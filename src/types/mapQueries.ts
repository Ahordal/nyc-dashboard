// mapQueries.ts
//
// Pure query/geometry helpers for the ArcGIS restaurant layer. Kept
// separate from MapView.tsx so that component orchestrates React state
// and effects, while this module owns "ask the layer a question, get
// data back" logic -- independently readable, and independently
// reusable if another component ever needs the same queries.

import type GeoJSONLayer from "@arcgis/core/layers/GeoJSONLayer";
import type MapView from "@arcgis/core/views/MapView";
import type Graphic from "@arcgis/core/Graphic";
import type Point from "@arcgis/core/geometry/Point";
import Extent from "@arcgis/core/geometry/Extent";
import type { Filters } from "../types/filters";
import type { RestaurantProperties } from "../types/restaurant";

export const CATEGORY_CLAUSES: Record<string, string> = {
  A: `current_status_code <> 'closed' AND (grade IS NULL OR grade NOT IN ('Z','P','N')) AND score <= 13`,
  B: `current_status_code <> 'closed' AND (grade IS NULL OR grade NOT IN ('Z','P','N')) AND score BETWEEN 14 AND 27`,
  C: `current_status_code <> 'closed' AND (grade IS NULL OR grade NOT IN ('Z','P','N')) AND score >= 28`,
  Pending: `current_status_code <> 'closed' AND grade IN ('Z','P','N')`,
  Closed: `current_status_code = 'closed'`,
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
    const escaped = word.replace(/'/g, "''");
    return `UPPER(search_index) LIKE '%${escaped}%'`;
  });

  return `(${wordClauses.join(" AND ")})`;
}

// Builds the combined definitionExpression from grade + borough filters
// and a search query. Returns an empty string when nothing is active
// (meaning "no filter" -- matches everything).
export function buildDefinitionExpression(
  filters: Filters,
  searchQuery: string,
): string {
  const clauses: string[] = [];

  if (filters.grades.length > 0) {
    const gradeClause = filters.grades
      .map((g) => CATEGORY_CLAUSES[g])
      .filter(Boolean)
      .map((c) => `(${c})`)
      .join(" OR ");
    if (gradeClause) clauses.push(`(${gradeClause})`);
  }

  if (filters.boroughs.length > 0) {
    const boroList = filters.boroughs.map((b) => `'${b}'`).join(",");
    clauses.push(`boro IN (${boroList})`);
  }

  const searchClause = buildSearchClause(searchQuery);
  if (searchClause) clauses.push(searchClause);

  return clauses.length > 0 ? clauses.join(" AND ") : "";
}

// Queries ALL restaurants intersecting the current map extent, not just
// the first page. A single queryFeatures() call is capped by the
// layer's maxRecordCount -- if more restaurants are in view than that
// limit, the server (or GeoJSONLayer's client-side query engine)
// silently truncates the result and sets exceededTransferLimit instead
// of erroring. Looping with start/num until exceededTransferLimit is
// false ensures downstream consumers (like RestaurantList's sort)
// always operate on the complete set of restaurants actually in view,
// not a partial slice.
export async function queryVisibleRestaurants(
  view: MapView,
  layer: GeoJSONLayer,
): Promise<RestaurantProperties[]> {
  await layer.load();

  const baseQuery = layer.createQuery();
  baseQuery.geometry = view.extent;
  baseQuery.spatialRelationship = "intersects";
  baseQuery.returnGeometry = false;
  baseQuery.outFields = ["*"];

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
  query.where = definitionExpression
    ? `id = '${restaurantId}' AND (${definitionExpression})`
    : `id = '${restaurantId}'`;
  query.returnGeometry = options.returnGeometry ?? false;
  query.outFields = ["*"];

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

// Computes the extent of everything matching whereClause by querying
// actual point geometries and building the bounding box ourselves,
// rather than using layer.queryExtent() -- see FilterExtentResult's
// comment for why that method can't be trusted for small/clustered
// result sets.
export async function queryFilterExtent(
  layer: GeoJSONLayer,
  whereClause: string,
): Promise<FilterExtentResult> {
  const baseQuery = layer.createQuery();
  baseQuery.where = whereClause;
  baseQuery.returnGeometry = true;
  baseQuery.outFields = ["*"];

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