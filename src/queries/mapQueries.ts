// mapQueries.ts
//
// Pure query/geometry helpers for the ArcGIS restaurant layer. Kept
// separate from MapView.tsx so that component owns React state and
// effects while this module owns "ask the layer a question, get data
// back". Lives in its own src/queries/ folder rather than src/types/
// because it's query logic, not type definitions.

import type GeoJSONLayer from "@arcgis/core/layers/GeoJSONLayer";
import type MapView from "@arcgis/core/views/MapView";
import type Graphic from "@arcgis/core/Graphic";
import type { ViewHit } from "@arcgis/core/views/types";
import Point from "@arcgis/core/geometry/Point";
import Extent from "@arcgis/core/geometry/Extent";
import type { Filters } from "../types/filters";
import type { RestaurantProperties } from "../types/restaurant";
import type { SearchRadiusPoint } from "../types/searchRadius";
import {
  CLOSED_ACTIONS,
  UNINSPECTED_GRADE,
  getGradeCategory,
} from "../utils/gradeCategory";

// Fields actually read by the dashboard's components (list cards,
// details panel, map filter logic). Deliberately excludes fields that
// exist in the pipeline's GeoJSON but are never consumed client-side:
// search_index (query-only; WHERE clauses can still filter on it
// regardless of outFields), dohmh_latitude/dohmh_longitude,
// neighbourhood, community_board, council_district, record_date,
// grade_date, and display_address.
//
// Violations aren't in the GeoJSON at all any more (they were ~4 MB of
// per-feature arrays); they live only in history/{camis}.json, which the
// dashboard already fetches on select. This list doubles as the
// GeoJSONLayer's own outFields (kept resident for all ~27,000 graphics)
// and queryVisibleRestaurants' outFields (re-pulled into React state on
// every pan/zoom), so keeping it lean is a real chunk of the memory
// footprint.
export const RESTAURANT_OUT_FIELDS = [
  "id",
  "camis",
  "name",
  "latitude",
  "longitude",
  "boro",
  "building",
  "street",
  "display_street",
  "zipcode",
  "phone",
  "cuisine",
  "location_status",
  "grade",
  "score",
  "inspection_date",
  "inspection_type",
  "action",
  "current_status_code",
  "current_status_label",
];

// Builds a SQL IN-list of the exact closure action strings
// isClosedInspection() checks against, so this "closed" clause comes
// from the same set rather than a hand-copied duplicate (see
// CLOSED_ACTIONS in gradeCategory.ts). Escaped the same way
// escapeSqlString() below escapes user input.
function buildClosedClause(): string {
  const values = Array.from(CLOSED_ACTIONS)
    .map((action) => `'${action.replace(/'/g, "''")}'`)
    .join(",");
  return `action IN (${values})`;
}

const CLOSED_CLAUSE = buildClosedClause();

// Mirrors getGradeCategory()'s precedence exactly (see gradeCategory.ts):
// a closure action wins over everything, then the Uninspected sentinel
// grade, then administrative Pending grades, then score bands. Each grade
// button filters independently (see buildGradeWhereClause), so every
// clause below stays self-contained rather than assuming the others have
// already excluded a restaurant. The A/B/C clauses exclude the
// Uninspected grade explicitly rather than relying on `score <= 13` to
// fail for a null score, which isn't guaranteed across every client-side
// query engine and once let Uninspected restaurants match A/B/C filters.
export const CATEGORY_CLAUSES: Record<string, string> = {
  A: `NOT (${CLOSED_CLAUSE}) AND grade NOT IN ('Z','P','N','${UNINSPECTED_GRADE}') AND score <= 13`,
  B: `NOT (${CLOSED_CLAUSE}) AND grade NOT IN ('Z','P','N','${UNINSPECTED_GRADE}') AND score BETWEEN 14 AND 27`,
  C: `NOT (${CLOSED_CLAUSE}) AND grade NOT IN ('Z','P','N','${UNINSPECTED_GRADE}') AND score >= 28`,
  Pending: `NOT (${CLOSED_CLAUSE}) AND (grade IN ('Z','P','N') OR (score IS NULL AND (grade IS NULL OR grade <> '${UNINSPECTED_GRADE}')))`,
  Uninspected: `NOT (${CLOSED_CLAUSE}) AND grade = '${UNINSPECTED_GRADE}'`,
  Closed: CLOSED_CLAUSE,
};

// Page size for querying visible restaurants. Kept safely under typical
// ArcGIS maxRecordCount limits (commonly 1000-2000) so each page request
// is well within what the layer will actually return.
const VISIBLE_QUERY_PAGE_SIZE = 2000;

// Mirrors the normalization applied to search_index at build time (see
// buildSearchIndex() in the data pipeline): uppercased, & becomes AND,
// apostrophes/periods stripped, other punctuation collapsed to spaces.
// This has to match on the query side or a literal "&" or "'" typed by
// the user wouldn't line up with the pre-normalized index field.
function stripDiacritics(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeSearchQuery(raw: string): string {
  return stripDiacritics(raw)
    .toUpperCase()
    .replace(/&/g, " AND ")
    .replace(/['".]/g, "")
    .replace(/[^A-Z0-9\s]/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

// Escapes a value for safe interpolation into a SQL-style WHERE clause
// by doubling single quotes, the standard SQL convention (ArcGIS's
// query engine follows it too). Centralized here so every WHERE-clause
// builder in this file uses the same rule.
function escapeSqlString(value: string): string {
  return value.replace(/'/g, "''");
}

// Builds a case-insensitive match against the precomputed search_index
// field (see the pipeline's buildSearchIndex()): a single LIKE against
// one normalized field rather than separate matches on raw
// name/cuisine/street/building. Apostrophes, casing, &/AND, corporate
// suffixes, street abbreviations, parenthetical sub-venue tags, and
// slash-joined names are all already resolved in the index; this just
// normalizes the query the same way. Returns null for an
// empty/whitespace-only query.
export function buildSearchClause(searchQuery: string): string | null {
  // Nothing typed at all: no filter, show everything. Distinct from the
  // case below; an untouched search box should never restrict results.
  if (!searchQuery.trim()) return null;

  const normalized = normalizeSearchQuery(searchQuery);

  // Something WAS typed, but it normalized away to nothing (e.g. only
  // punctuation like "#" or "!~", with no letter/digit content the index
  // could ever have stored). Returning null here would behave as "no
  // search", showing the full set while the UI still reads
  // "Search: '#'  22,527 restaurants". Match nothing instead, so a
  // search with no searchable characters returns zero results.
  if (!normalized) return "1=0";

  const words = normalized.split(" ").filter(Boolean);
  if (words.length === 0) return null;

  const wordClauses = words.map((word) => {
    const escaped = escapeSqlString(word);
    return `UPPER(search_index) LIKE '%${escaped}%'`;
  });

  return `(${wordClauses.join(" AND ")})`;
}

// Builds the combined definitionExpression from borough filters and a
// search query. Returns an empty string when nothing is active (no
// filter, matches everything).
//
// Deliberately excludes grade. definitionExpression restricts both what
// renders on the map and what queryFeatures() can ever see, so
// including grade here would stop anything querying this layer (e.g. the
// Grade Breakdown chart's tally) from seeing the other grades. Grade is
// applied separately as a display-only LayerView.filter (see
// buildGradeWhereClause and MapView.tsx).
export function buildDefinitionExpression(
  filters: Filters,
  searchQuery: string,
): string {
  const clauses: string[] = [];

  if (filters.boroughs.length > 0) {
    const boroList = filters.boroughs.map((b) => `'${b}'`).join(",");
    clauses.push(`boro IN (${boroList})`);
  }

  const searchClause = buildSearchClause(searchQuery);
  if (searchClause) clauses.push(searchClause);

  return clauses.length > 0 ? clauses.join(" AND ") : "";
}

// Builds a where clause for the active grade filters, for use ONLY as a
// LayerView.filter (display-only: hides non-matching markers without
// affecting queryFeatures() results). Returns null when no grades are
// selected (show every grade).
export function buildGradeWhereClause(grades: string[]): string | null {
  if (grades.length === 0) return null;

  const gradeClause = grades
    .map((g) => CATEGORY_CLAUSES[g])
    .filter(Boolean)
    .map((c) => `(${c})`)
    .join(" OR ");

  return gradeClause ? `(${gradeClause})` : null;
}

// The client-side twin of buildGradeWhereClause: given an already-fetched
// list and the active grade labels, keeps only restaurants whose
// *computed* category (getGradeCategory, not the raw grade field)
// matches one. An empty filter keeps everything (returns the same
// array). A/B/C match on the computed category on purpose, so a row with
// a null grade but a real score still counts.
export function filterRestaurantsByGradeCategory(
  restaurants: RestaurantProperties[],
  activeGrades: string[],
): RestaurantProperties[] {
  if (activeGrades.length === 0) return restaurants;

  const wanted = new Set(activeGrades);
  return restaurants.filter((r) => {
    const category = getGradeCategory(r.action, r.grade, r.score);
    if (wanted.has("Closed") && category === "closed") return true;
    if (wanted.has("Pending") && category === "pending") return true;
    if (wanted.has("Uninspected") && category === "uninspected") return true;
    if (
      (category === "A" || category === "B" || category === "C") &&
      wanted.has(category)
    ) {
      return true;
    }
    return false;
  });
}

// Queries ALL restaurants in scope, not just the first page. A single
// queryFeatures() call is capped by the layer's maxRecordCount; beyond
// that the result is silently truncated with exceededTransferLimit set
// instead of erroring. Looping with start/num until it clears ensures
// downstream consumers (RestaurantList, StatsPanel, GradeChart, all fed
// from one result) see the complete set.
//
// Scope is normally the current map extent. When a `radius` is passed
// (the Search Radius tool is active) the scope is instead everything
// within `radius.miles` of `radius.point`, so the list/KPI/chart
// describe the circle and stop changing as the user pans or zooms.
export async function queryVisibleRestaurants(
  view: MapView,
  layer: GeoJSONLayer,
  radius?: { point: SearchRadiusPoint; miles: number } | null,
): Promise<RestaurantProperties[]> {
  await layer.load();

  const baseQuery = layer.createQuery();
  if (radius) {
    baseQuery.geometry = new Point({
      longitude: radius.point.longitude,
      latitude: radius.point.latitude,
    });
    baseQuery.distance = radius.miles;
    baseQuery.units = "miles";
  } else {
    baseQuery.geometry = view.extent;
  }
  baseQuery.spatialRelationship = "intersects";
  baseQuery.where = layer.definitionExpression ?? "1=1";
  baseQuery.outFields = RESTAURANT_OUT_FIELDS;
  baseQuery.returnGeometry = false;

  const allFeatures: Graphic[] = [];
  let start = 0;

  while (true) {
    const query = baseQuery.clone();
    query.start = start;
    query.num = VISIBLE_QUERY_PAGE_SIZE;

    const result = await layer.queryFeatures(query);
    allFeatures.push(...result.features);

    if (!result.exceededTransferLimit || result.features.length === 0) {
      break;
    }
    start += VISIBLE_QUERY_PAGE_SIZE;
  }

  return allFeatures.map(
    (feature) => feature.attributes as RestaurantProperties,
  );
}

// Result of checking a single restaurant ID against the active
// definitionExpression. Combines what used to be two separate queries
// (does the restaurant still match the filters; re-fetch its objectId
// for highlighting) into one, halving the round-trips against the layer
// whenever filters change with a restaurant selected.
export type SelectionCheckResult = {
  stillMatches: boolean;
  objectId: number | null;
  geometry: Point | null;
};

export async function checkSelectionAgainstFilters(
  layer: GeoJSONLayer,
  restaurantId: string,
  definitionExpression: string,
  options: { returnGeometry?: boolean } = {},
): Promise<SelectionCheckResult> {
  const query = layer.createQuery();
  const escapedId = escapeSqlString(restaurantId);
  query.where = definitionExpression
    ? `id = '${escapedId}' AND (${definitionExpression})`
    : `id = '${escapedId}'`;
  query.returnGeometry = options.returnGeometry ?? false;
  // Callers only ever read stillMatches/objectId/geometry, never
  // restaurant properties, so the only attribute this query needs back
  // is the object ID field. Falls back to "*" if the layer hasn't
  // resolved objectIdField yet (shouldn't happen, since every call site
  // awaits layer.load() first, but safer than requesting a missing field).
  query.outFields = layer.objectIdField ? [layer.objectIdField] : ["*"];

  const result = await layer.queryFeatures(query);

  if (result.features.length === 0) {
    return { stillMatches: false, objectId: null, geometry: null };
  }

  const feature = result.features[0];
  const idField = layer.objectIdField;
  const rawObjectId = idField ? feature.attributes[idField] : null;
  const objectId =
    rawObjectId !== null && rawObjectId !== undefined
      ? Number(rawObjectId)
      : null;

  return {
    stillMatches: true,
    objectId,
    geometry: (feature.geometry as Point) ?? null,
  };
}

export type FilterExtentResult = {
  count: number;
  extent: Extent | null;
  // True when every matched point sits within a tiny area (e.g. several
  // restaurants at the same address). Computed here from real point
  // geometries rather than ArcGIS's queryExtent(), which was observed
  // returning a bogus, enormous square extent (width === height,
  // ~222,639, mislabeled as degrees) for exactly this near-zero-area
  // case, zooming the map out to the world instead of in.
  isDegenerate: boolean;
};

// Computes the extent of everything matching whereClause. For large
// result sets (the common case: a borough can match thousands),
// layer.queryExtent() is used directly: one lightweight request, no
// per-feature geometry. It's avoided only for SMALL result sets, where
// it was seen returning the bogus giant square described in
// FilterExtentResult above instead of the real tight cluster. A
// geometry-free queryFeatureCount() picks the path, so the expensive
// per-point computation only runs for small counts.
const DEGENERATE_CHECK_THRESHOLD = 25;

export async function queryFilterExtent(
  layer: GeoJSONLayer,
  whereClause: string,
): Promise<FilterExtentResult> {
  const countQuery = layer.createQuery();
  countQuery.where = whereClause;
  const count = await layer.queryFeatureCount(countQuery);

  if (count === 0) {
    return { count: 0, extent: null, isDegenerate: false };
  }

  if (count > DEGENERATE_CHECK_THRESHOLD) {
    // Large match (e.g. a borough): queryExtent()'s bug only shows up
    // for tiny clustered sets, so it's safe and much cheaper here, one
    // request instead of N pages of full point geometry.
    const result = await layer.queryExtent(countQuery);
    return { count, extent: result.extent ?? null, isDegenerate: false };
  }

  // Small match: fall back to the exact per-point computation so the
  // "same building" degenerate case is still caught.
  const baseQuery = layer.createQuery();
  baseQuery.where = whereClause;
  baseQuery.returnGeometry = true;
  // Only feature.geometry is read below; no restaurant properties are
  // needed for a bounding-box computation, so request none back.
  baseQuery.outFields = [];

  const points: Point[] = [];
  let start = 0;

  while (true) {
    const query = baseQuery.clone();
    query.start = start;
    query.num = VISIBLE_QUERY_PAGE_SIZE;

    const result = await layer.queryFeatures(query);
    for (const feature of result.features) {
      if (feature.geometry) points.push(feature.geometry as Point);
    }

    if (!result.exceededTransferLimit || result.features.length === 0) {
      break;
    }
    start += VISIBLE_QUERY_PAGE_SIZE;
  }

  if (points.length === 0) {
    return { count: 0, extent: null, isDegenerate: false };
  }

  let minX = points[0].x;
  let maxX = points[0].x;
  let minY = points[0].y;
  let maxY = points[0].y;

  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  const extent = new Extent({
    xmin: minX,
    ymin: minY,
    xmax: maxX,
    ymax: maxY,
    spatialReference: points[0].spatialReference,
  });

  // ~0.0005 degrees is roughly 50m at NYC's latitude, generously
  // covering "same building" while still treating genuinely different
  // nearby addresses as a real spread.
  const isDegenerate = maxX - minX < 0.0005 && maxY - minY < 0.0005;

  return { count: points.length, extent, isDegenerate };
}

export type RestaurantGraphicHit = {
  graphic: { attributes: RestaurantProperties };
};

// Picks the restaurant-layer graphic out of a view.hitTest() result,
// ignoring hits on any other layer (the Search Radius rings, basemap
// labels). Returns undefined when the click or hover landed on no
// restaurant dot. The final assertion narrows Graphic.attributes (typed
// `any` by ArcGIS) to our known layer schema.
export function findRestaurantGraphicHit(
  hitTestResponse: { results: ViewHit[] },
  layer: GeoJSONLayer,
): RestaurantGraphicHit | undefined {
  const hit = hitTestResponse.results.find(
    (result) => result.type === "graphic" && result.graphic.layer === layer,
  );
  return hit as RestaurantGraphicHit | undefined;
}