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
import type { Filters } from "../types/filters";
import type { RestaurantProperties } from "../types/restaurant";
import type Geometry from "@arcgis/core/geometry/Geometry";
import type Extent from "@arcgis/core/geometry/Extent";
import type Point from "@arcgis/core/geometry/Point";

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

// Builds a case-insensitive "matches anywhere in name, cuisine, street,
// or building" clause for the given search text. Apostrophes are
// stripped from BOTH the query and the compared field values via
// REPLACE(), so "mcdonalds" matches "McDonald's" regardless of which
// side has the punctuation. Returns null for an empty/whitespace-only
// query (no clause to add).
export function buildSearchClause(searchQuery: string): string | null {
  const trimmed = searchQuery.trim();
  if (!trimmed) return null;

  const escaped = trimmed.toUpperCase().replace(/'/g, "''");
  const fields = ["name", "cuisine", "street", "building"];

  // If the query ends in "s" and has no apostrophe already, also try
  // inserting one before that trailing "s" -- covers "mcdonalds" ->
  // "MCDONALD'S" without touching the field values at all.
  const possessiveVariant =
    !trimmed.includes("'") && /s$/i.test(trimmed)
      ? escaped.slice(0, -1) + "''S"
      : null;

  const patternsFor = (field: string) => {
    const clauses = [`UPPER(${field}) LIKE '%${escaped}%'`];
    if (possessiveVariant) {
      clauses.push(`UPPER(${field}) LIKE '%${possessiveVariant}%'`);
    }
    return clauses;
  };

  const allClauses = fields.flatMap(patternsFor);
  return `(${allClauses.join(" OR ")})`;
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
// inside the old applyHighlightForId to re-fetch its objectId for
// highlighting) into ONE query that returns everything both callers
// need -- halving the round-trips against the layer whenever filters
// change with a restaurant selected.
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

// Computes the union extent + count of everything matching the given
// where-clause. Used to zoom the map to fit all restaurants matching
// the combined grade/borough/search filter.
export async function queryFilterExtent(
    layer: GeoJSONLayer,
    whereClause: string,
): Promise<{ count: number; extent: Extent | null }> {
    const query = layer.createQuery();
    query.where = whereClause;
    const { count, extent } = await (layer as any).queryExtent(query);
    return { count, extent: extent ?? null };
}