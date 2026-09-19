// mapQueries.ts
//
// Pure query/geometry helpers for the ArcGIS layer — MapView owns React
// state, this owns "ask the layer, get data back". In src/queries/, not
// src/types/, since it's logic.

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

// Fields the dashboard actually reads. Excludes search_index (query-only
// — WHERE clauses still filter on it regardless).
//
// Violations were dropped (~4MB of per-feature arrays) and now live only
// in history/{camis}.json. Also GeoJSONLayer's own outFields (resident
// for ~27,000 graphics), so keeping this lean matters for memory.
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

// Same closure strings isClosedInspection() checks — avoids
// hand-duplicating CLOSED_ACTIONS. Escaped like escapeSqlString() below.
function buildClosedClause(): string {
  const values = Array.from(CLOSED_ACTIONS)
    .map((action) => `'${action.replace(/'/g, "''")}'`)
    .join(",");
  return `action IN (${values})`;
}

const CLOSED_CLAUSE = buildClosedClause();

// Mirrors getGradeCategory()'s precedence: closure, then Uninspected,
// then Pending, then score bands. Each grade button filters
// independently, so every clause stays self-contained.
//
// A/B/C spell out `grade IS NULL OR NOT IN (...)` since a bare NOT IN is
// NULL, not TRUE, for a null grade — that silently dropped ~3,500
// real-score, no-letter-grade restaurants. The UNINSPECTED_GRADE
// exclusion stays: it once let Uninspected leak into A/B/C via a null score.
export const CATEGORY_CLAUSES: Record<string, string> = {
  A: `NOT (${CLOSED_CLAUSE}) AND (grade IS NULL OR grade NOT IN ('Z','P','N','${UNINSPECTED_GRADE}')) AND score <= 13`,
  B: `NOT (${CLOSED_CLAUSE}) AND (grade IS NULL OR grade NOT IN ('Z','P','N','${UNINSPECTED_GRADE}')) AND score BETWEEN 14 AND 27`,
  C: `NOT (${CLOSED_CLAUSE}) AND (grade IS NULL OR grade NOT IN ('Z','P','N','${UNINSPECTED_GRADE}')) AND score >= 28`,
  Pending: `NOT (${CLOSED_CLAUSE}) AND (grade IN ('Z','P','N') OR (score IS NULL AND (grade IS NULL OR grade <> '${UNINSPECTED_GRADE}')))`,
  Uninspected: `NOT (${CLOSED_CLAUSE}) AND grade = '${UNINSPECTED_GRADE}'`,
  Closed: CLOSED_CLAUSE,
};

// Kept safely under typical ArcGIS maxRecordCount limits (commonly 1000-2000).
const VISIBLE_QUERY_PAGE_SIZE = 2000;

// Mirrors search_index's build-time normalization: uppercase, & -> AND,
// punctuation stripped, suffixes dropped. Must match here or input won't
// line up with the index.
const CORPORATE_SUFFIXES = new Set(["INC", "LLC", "CORP", "CO", "LTD", "LP", "PC"]);

function stripDiacritics(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeSearchQuery(raw: string): string {
  const cleaned = stripDiacritics(raw)
    .toUpperCase()
    .replace(/&/g, " AND ")
    .replace(/['".]/g, "")
    .replace(/[^A-Z0-9\s]/g, " ")
    .trim()
    .replace(/\s+/g, " ");

  return cleaned
    .split(" ")
    .filter((word) => word && !CORPORATE_SUFFIXES.has(word))
    .join(" ");
}

// Doubles single quotes — the standard SQL escaping convention (ArcGIS's
// query engine follows it too). Centralized so every builder here agrees.
function escapeSqlString(value: string): string {
  return value.replace(/'/g, "''");
}

// One LIKE against the precomputed search_index field, instead of
// separate matches on raw name/cuisine/street. Null for an empty query.
export function buildSearchClause(searchQuery: string): string | null {
  // Untouched search box: no filter at all (distinct from the case below).
  if (!searchQuery.trim()) return null;

  const normalized = normalizeSearchQuery(searchQuery);

  // Normalized to nothing (e.g. only punctuation) — null here would show
  // everything while the UI still reads "Search: '#'  22,527 restaurants".
  if (!normalized) return "1=0";

  const words = normalized.split(" ").filter(Boolean);
  if (words.length === 0) return null;

  const wordClauses = words.map((word) => {
    const escaped = escapeSqlString(word);
    return `UPPER(search_index) LIKE '%${escaped}%'`;
  });

  return `(${wordClauses.join(" AND ")})`;
}

// Combined definitionExpression from borough filters + search. Empty
// string when nothing is active.
//
// Excludes grade: definitionExpression limits what queryFeatures() can
// see, so including grade would hide other grades from anything
// querying the layer (e.g. the Grade Breakdown chart). Grade uses a
// separate display-only LayerView.filter (buildGradeWhereClause, MapView.tsx).
export function buildDefinitionExpression(
  filters: Filters,
  searchQuery: string,
): string {
  const clauses: string[] = [];

  if (filters.boroughs.length > 0) {
    const boroList = filters.boroughs
      .map((b) => `'${escapeSqlString(b)}'`)
      .join(",");
    clauses.push(`boro IN (${boroList})`);
  }

  const searchClause = buildSearchClause(searchQuery);
  if (searchClause) clauses.push(searchClause);

  return clauses.length > 0 ? clauses.join(" AND ") : "";
}

// Where clause for the active grade filters, for use ONLY as a
// LayerView.filter (display-only, doesn't affect queryFeatures()). Null
// when no grades are selected (show every grade).
export function buildGradeWhereClause(grades: string[]): string | null {
  if (grades.length === 0) return null;

  const gradeClause = grades
    .map((g) => CATEGORY_CLAUSES[g])
    .filter(Boolean)
    .map((c) => `(${c})`)
    .join(" OR ");

  return gradeClause ? `(${gradeClause})` : null;
}

// Client-side twin of buildGradeWhereClause: filters an already-fetched
// list by *computed* category (getGradeCategory), not the raw grade
// field, so a null-grade/real-score row still counts. Empty filter
// keeps everything.
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

// Pages past queryFeatures()'s maxRecordCount cap (silently truncated
// via exceededTransferLimit), so RestaurantList/StatsPanel/GradeChart
// see the complete set.
//
// Scope is the map extent, or — with `radius` set — everything within
// radius.miles of radius.point, so panels track the circle, not pan/zoom.
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

// Combines two former queries (match check + objectId re-fetch) into
// one, halving round-trips on a filter change.
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
  // Callers only need objectId/geometry — just the ID field ("*" as a
  // fallback that shouldn't trigger, since every caller awaits load() first).
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

type LngLat = { longitude: number; latitude: number };
type Bounds = { xmin: number; ymin: number; xmax: number; ymax: number };

// Smallest box framing both points for goTo(): 25% breathing room,
// padded to the view's aspect, grown southward by `bottomInsetRatio` so
// the sheet hides neither point. Null within ~150m — caller should
// recentre on the fix instead; pure math, wrapped in an Extent by the caller.
export function buildTwoPointFitBounds(
  a: LngLat,
  b: LngLat,
  opts: { viewAspect: number; bottomInsetRatio: number },
): Bounds | null {
  const dLng = Math.abs(a.longitude - b.longitude);
  const dLat = Math.abs(a.latitude - b.latitude);

  const cx = (a.longitude + b.longitude) / 2;
  const cy = (a.latitude + b.latitude) / 2;

  // A degree of longitude covers less ground than a degree of latitude
  // (except at the equator) - about 24% less at NYC's ~40.7°N. Scale
  // longitude degrees into latitude-equivalent ground-distance units
  // before any distance/aspect comparison, so both reflect real ground
  // shape instead of degree-space distortion; convert back to longitude
  // degrees only for the final bounds.
  const lonScale = Math.cos((cy * Math.PI) / 180);
  const dLngGround = dLng * lonScale;

  if (Math.hypot(dLngGround, dLat) < 0.0018) return null;

  let halfWGround = (dLngGround / 2) * 1.25;
  let halfH = (dLat / 2) * 1.25;

  const aspect = opts.viewAspect > 0 ? opts.viewAspect : 1;
  if (halfWGround / halfH > aspect) halfH = halfWGround / aspect;
  else halfWGround = halfH * aspect;

  const halfW = halfWGround / lonScale;

  // South edge drops by height * r/(1-r), keeping both points in the
  // visible (1-r) slice above the sheet.
  const r = Math.min(Math.max(opts.bottomInsetRatio, 0), 0.7);
  const drop = 2 * halfH * (r / (1 - r));

  return {
    xmin: cx - halfW,
    xmax: cx + halfW,
    ymin: cy - halfH - drop,
    ymax: cy + halfH,
  };
}

// Resolves by CAMIS/id against the whole layer, ignoring extent and the
// grade filter, so a `?camis=` link works even off-screen. Borough/
// search definitionExpression still applies — a link into a
// filtered-out borough loses.
export async function queryRestaurantByCamis(
  layer: GeoJSONLayer,
  camis: string,
): Promise<RestaurantProperties | null> {
  await layer.load();

  const query = layer.createQuery();
  const escapedCamis = escapeSqlString(camis);
  query.where = `id = '${escapedCamis}' OR camis = '${escapedCamis}'`;
  query.outFields = RESTAURANT_OUT_FIELDS;
  query.returnGeometry = false;
  query.num = 1;

  const result = await layer.queryFeatures(query);
  return result.features.length > 0
    ? (result.features[0].attributes as RestaurantProperties)
    : null;
}

export type FilterExtentResult = {
  count: number;
  extent: Extent | null;
  // True when every match sits in a tiny area (e.g. one address).
  // Computed from real geometries — queryExtent() returns a bogus
  // ~222,639-wide "square" for near-zero-area matches, zooming to the
  // world instead of in.
  isDegenerate: boolean;
};

// Extent of everything matching whereClause. Large sets use queryExtent()
// directly — its bug only hits tiny clustered sets (see FilterExtentResult)
// — decided by a cheap queryFeatureCount().
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
    // One request instead of N pages of full point geometry.
    const result = await layer.queryExtent(countQuery);
    return { count, extent: result.extent ?? null, isDegenerate: false };
  }

  // Small match: fall back to the exact per-point computation so the
  // "same building" degenerate case is still caught.
  const baseQuery = layer.createQuery();
  baseQuery.where = whereClause;
  baseQuery.returnGeometry = true;
  // Only geometry is read below; no restaurant properties are needed.
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

  // ~0.0005° ≈ 50m at NYC's latitude — covers "same building" without
  // flattening genuinely separate addresses.
  const isDegenerate = maxX - minX < 0.0005 && maxY - minY < 0.0005;

  return { count: points.length, extent, isDegenerate };
}

export type RestaurantGraphicHit = {
  graphic: { attributes: RestaurantProperties };
};

// Picks the restaurant graphic out of a hitTest() result, ignoring other
// layers (rings, basemap labels). Undefined on a miss; narrows
// Graphic.attributes (typed `any`) to our schema.
export function findRestaurantGraphicHit(
  hitTestResponse: { results: ViewHit[] },
  layer: GeoJSONLayer,
): RestaurantGraphicHit | undefined {
  const hit = hitTestResponse.results.find(
    (result) => result.type === "graphic" && result.graphic.layer === layer,
  );
  return hit as RestaurantGraphicHit | undefined;
}