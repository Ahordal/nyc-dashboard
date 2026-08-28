// mapQueries.ts
//
// Pure query/geometry helpers for the ArcGIS restaurant layer. Kept
// separate from MapView.tsx so that component orchestrates React state
// and effects, while this module owns "ask the layer a question, get
// data back" logic -- independently readable, and independently
// reusable if another component ever needs the same queries. Lives in
// its own src/queries/ folder rather than src/types/ -- it's query
// logic, not type definitions, so it was previously easy to miss here
// looking for it alongside filters.ts/restaurant.ts.

import type GeoJSONLayer from "@arcgis/core/layers/GeoJSONLayer";
import type MapView from "@arcgis/core/views/MapView";
import type Graphic from "@arcgis/core/Graphic";
import Point from "@arcgis/core/geometry/Point";
import Extent from "@arcgis/core/geometry/Extent";
import type { Filters } from "../types/filters";
import type { RestaurantProperties } from "../types/restaurant";
import type { SearchRadiusPoint } from "../types/searchRadius";
import { CLOSED_ACTIONS, UNINSPECTED_GRADE } from "../utils/gradeCategory";

// Fields actually read by the dashboard's components (restaurant list
// cards, details panel, map filter logic). Deliberately excludes
// fields that exist in the source GeoJSON/pipeline output but are never
// displayed or consumed client-side: search_index (query-only -- WHERE
// clauses can filter on it regardless of outFields, since outFields only
// controls what comes back in a result's attributes, not what's
// filterable), dohmh_latitude/dohmh_longitude, neighbourhood,
// community_board, council_district, record_date, grade_date, and
// display_address (superseded by display_street + building/boro
// composition in RestaurantCard/RestaurantDetails).
//
// Also deliberately excludes "violations" -- unlike the other excluded
// fields above, this one IS displayed, but only for a single selected
// restaurant at a time (RestaurantReport's initial/no-history-yet
// view). It's also by far the heaviest field per feature (raw JSON
// text of a restaurant's violation records). Because this field list is
// used both as the GeoJSONLayer's own outFields (which keeps that data
// resident for every one of its ~27,000 graphics, all the time, not
// just what's in view) AND as queryVisibleRestaurants' outFields (which
// re-pulls it into React state on every pan/zoom), leaving "violations"
// out of this shared list was a significant chunk of the dashboard's
// memory footprint. See RESTAURANT_DETAIL_OUT_FIELDS and
// fetchRestaurantDetail below for how a single restaurant's violations
// text is fetched instead, on click, rather than held for all 27k.
//
// Excluding all of the above cuts the per-feature attribute payload
// substantially, which matters most for queryVisibleRestaurants below
// -- it can return thousands of restaurants on every pan/zoom and its
// results get pushed into React state.
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

// Full field set for a single restaurant's complete record, including
// its current inspection's violations text. Only ever requested for one
// restaurant at a time -- see fetchRestaurantDetail.
export const RESTAURANT_DETAIL_OUT_FIELDS = [
  ...RESTAURANT_OUT_FIELDS,
  "violations",
];

// Builds a SQL IN-list of the exact closure action strings
// isClosedInspection() checks against, so this "closed" clause is
// generated from the same set rather than a hand-copied duplicate --
// see CLOSED_ACTIONS in gradeCategory.ts. Escaped the same way
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
// grade, then administrative Pending grades, then score bands. Previously
// this was a hand-copied re-implementation of that same logic, keyed on
// current_status_code instead of action -- the two happened to agree in
// practice, but nothing guaranteed it, and the A/B/C clauses didn't
// exclude the Uninspected grade explicitly (only Z/P/N), relying on
// score <= 13 to fail for a null score. That's true under standard SQL
// null semantics but not guaranteed for every client-side query engine,
// and was the root cause of Uninspected restaurants (score: null)
// intermittently matching grade A/B/C map filters while being correctly
// excluded from the Restaurant List's own (already explicit) JS check.
// Each grade button filters independently (see buildGradeWhereClause), so
// every clause below stays self-contained rather than relying on the
// others having already excluded a restaurant.
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
// buildSearchIndex() in the data pipeline script) -- uppercased, & ->
// AND, apostrophes/periods stripped, other punctuation collapsed to
// spaces. This has to match on the query side or a literal "&"/"'"
// typed by the user wouldn't line up with the pre-normalized index
// field, since search_index never stores those characters either.
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

// Builds a case-insensitive match against the precomputed search_index
// field (see the pipeline's buildSearchIndex()) -- a single LIKE against
// one normalized field, rather than separately matching raw name/
// cuisine/street/building. Apostrophes, casing, &/AND, corporate
// suffixes, street abbreviations, parenthetical sub-venue tags, and
// slash-joined multi-concept names are all already resolved in the
// index itself; this just needs to normalize the query the same way.
// Returns null for an empty/whitespace-only query (no clause to add).
// Escapes a value for safe interpolation into a SQL-style WHERE clause
// string, by doubling single quotes -- the standard SQL escaping
// convention (ArcGIS's query engine follows it too). Centralized here
// so every WHERE-clause builder in this file uses the same rule rather
// than each re-implementing (or forgetting) it independently.
function escapeSqlString(value: string): string {
  return value.replace(/'/g, "''");
}

export function buildSearchClause(searchQuery: string): string | null {
  // Nothing typed at all -- no filter, show everything. Distinct from the
  // case below: an untouched search box should never restrict results.
  if (!searchQuery.trim()) return null;

  const normalized = normalizeSearchQuery(searchQuery);

  // Something WAS typed, but it normalized away to nothing (e.g. only
  // punctuation like "#" or "!~" -- there's no letter/digit content for
  // search_index to have ever indexed). Falling back to `null` here would
  // silently behave as "no search," showing the full unfiltered set while
  // the UI still displays "Search: '#' -- 22,527 restaurants," which reads
  // as a real match count for a query that was never actually evaluated.
  // Match nothing instead, so a search with no searchable characters
  // correctly returns zero results rather than everything.
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
// search query. Returns an empty string when nothing is active (meaning
// "no filter" -- matches everything).
//
// Deliberately excludes grade. definitionExpression restricts BOTH what
// renders on the map AND what queryFeatures() can ever see -- if grade
// were included here, anything that queries this layer (e.g. the Grade
// Breakdown chart's tally) would only ever see the currently-selected
// grade, making it impossible to show the full breakdown while a grade
// is selected. Grade is applied separately, as a display-only
// LayerView.filter (see buildGradeWhereClause) -- see MapView.tsx.
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
// LayerView.filter (display-only -- hides non-matching markers without
// affecting queryFeatures() results). Returns null when no grades are
// selected (meaning "no filter" -- show every grade).
export function buildGradeWhereClause(grades: string[]): string | null {
  if (grades.length === 0) return null;

  const gradeClause = grades
    .map((g) => CATEGORY_CLAUSES[g])
    .filter(Boolean)
    .map((c) => `(${c})`)
    .join(" OR ");

  return gradeClause ? `(${gradeClause})` : null;
}

// Queries ALL restaurants in scope, not just the first page. A single
// queryFeatures() call is capped by the layer's maxRecordCount -- if more
// restaurants are in scope than that limit, the server (or GeoJSONLayer's
// client-side query engine) silently truncates the result and sets
// exceededTransferLimit instead of erroring. Looping with start/num until
// exceededTransferLimit is false ensures downstream consumers (the
// RestaurantList, StatsPanel, and GradeChart, all fed from one result)
// always operate on the complete set, not a partial slice.
//
// Scope is normally the current map extent. When a `radius` is passed
// (the Search Radius tool is active) the scope is instead everything
// within `radius.miles` of `radius.point` -- so the list/KPI/chart
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

// Fetches the complete record -- including violations text -- for a
// single restaurant. Used on click/select instead of relying on
// RESTAURANT_OUT_FIELDS (which deliberately excludes "violations" to
// keep the layer's resident graphics and the bulk visible-restaurants
// query lean). This is a small, targeted query against just one
// restaurant's id, so paying for the full field list here doesn't carry
// the same cost it would across thousands of features.
export async function fetchRestaurantDetail(
  layer: GeoJSONLayer,
  restaurantId: string,
): Promise<RestaurantProperties | null> {
  await layer.load();

  const query = layer.createQuery();
  query.where = `id = '${escapeSqlString(restaurantId)}'`;
  query.outFields = RESTAURANT_DETAIL_OUT_FIELDS;
  query.returnGeometry = false;

  const result = await layer.queryFeatures(query);
  const feature = result.features[0];

  return feature ? (feature.attributes as RestaurantProperties) : null;
}

// Result of checking a single restaurant ID against the active
// definitionExpression. Combines what used to be TWO separate queries
// (one to check if the restaurant still matches the filters, a second
// to re-fetch its objectId for highlighting) into ONE query that
// returns everything both callers need -- halving the round-trips
// against the layer whenever filters change with a restaurant selected.
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
  // Callers only ever read stillMatches/objectId/geometry from the
  // result, never restaurant properties -- so the only attribute this
  // query actually needs back is the object ID field itself. Falls back
  // to "*" if the layer hasn't resolved objectIdField yet (shouldn't
  // happen in practice, since every call site awaits layer.load() first,
  // but safer than silently requesting a field that doesn't exist).
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
  // restaurants at the same building/address). Computed here from real
  // point geometries rather than trusting ArcGIS's own queryExtent() --
  // that method was observed returning a bogus, enormous square extent
  // (width === height, ~222,639, mislabeled as degrees) for exactly this
  // near-zero-area case, which is what was causing the map to zoom out
  // to the world instead of zooming in.
  isDegenerate: boolean;
};

// Computes the extent of everything matching whereClause. For large
// result sets (the common case -- a borough selection can match
// thousands of restaurants), layer.queryExtent() is used directly: a
// single lightweight request, no per-feature geometry download. It's
// only avoided for SMALL result sets, because that's specifically where
// it was observed returning a bogus, enormous square extent (width ===
// height, ~222,639, mislabeled as degrees) instead of the real tight
// cluster -- see isDegenerate below. A quick queryFeatureCount() (also
// geometry-free) decides which path to take, so the expensive manual
// per-point computation only ever runs for small counts, not for a
// borough-sized match.
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
    // Large match (e.g. a borough) -- queryExtent()'s bug only shows up
    // for tiny clustered sets, so it's safe and much cheaper here: one
    // request instead of N pages of full point geometry.
    const result = await layer.queryExtent(countQuery);
    return { count, extent: result.extent ?? null, isDegenerate: false };
  }

  // Small match -- fall back to the exact per-point computation so the
  // "same building" degenerate case is still caught correctly.
  const baseQuery = layer.createQuery();
  baseQuery.where = whereClause;
  baseQuery.returnGeometry = true;
  // Only feature.geometry is read below -- no restaurant properties are
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

  // ~0.0005 degrees is roughly 50m at NYC's latitude -- generously
  // covers "same building" while still treating genuinely different
  // nearby addresses as a real spread.
  const isDegenerate = maxX - minX < 0.0005 && maxY - minY < 0.0005;

  return { count: points.length, extent, isDegenerate };
}