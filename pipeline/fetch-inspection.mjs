// fetch-inspection.mjs
//
// Fetches NYC DOHMH inspection records from the SODA API and compiles
// four static assets:
// 1. latest-inspections.geojson: most recent scored inspection per
//    restaurant (powers the map and KPIs).
// 2. history/{camis}.json: per-CAMIS time series for on-demand score charts.
// 3. violation-codes.json: code-to-description/category lookup, so
//    description text isn't repeated across files.
// 4. dashboard-meta.json: summary counts and daily baseline deltas.

import { writeFile, readFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadCache } from "./cache.mjs";
import { formatDisplayAddress, formatDisplayStreet } from "./normalize.mjs";
import {
  OPEN_ACTIONS,
  CLOSED_ACTIONS,
  UNINSPECTED_GRADE,
} from "../shared/inspectionStatus.mjs";

// Read-only geocode cache committed by scheduled backfill. If absent, falls back to raw DOHMH coords.
const GEOCODE_CACHE_PATH = path.join(import.meta.dirname, "geocode-cache.json");

// Read-only snapshot of previous run counts. Used to compute +/- deltas without external DB.
const COUNTS_SNAPSHOT_PATH = path.join(import.meta.dirname, "counts-snapshot.json");

const CATEGORY_CSV_PATH = path.join(import.meta.dirname, "violation-categories.csv");

const DATASET_URL = "https://data.cityofnewyork.us/resource/43nn-pn8j.json";
const PAGE_SIZE = 50000; // Socrata maximum recommended page size

// Anchored to script directory to ensure consistent path resolution across local and CI environments.
const OUTPUT_DIR = path.resolve(import.meta.dirname, "../public/data");

// Per-CAMIS files prevent clients from downloading full historical datasets for single lookups.
export const HISTORY_DIR = path.join(OUTPUT_DIR, "history");

const REQUEST_HEADERS = process.env.SOCRATA_APP_TOKEN
  ? { "X-App-Token": process.env.SOCRATA_APP_TOKEN }
  : {};

const MAX_RETRIES = 4;
const BASE_RETRY_DELAY_MS = 1000; // Exponential backoff: 1s, 2s, 4s, 8s

// Socrata default placeholder for uninspected entities; excluded from scored calculations.
const NOT_YET_INSPECTED_DATE = "1900-01-01T00:00:00.000";

// Bounding box filter to discard (0,0), inverted coordinates, or out-of-state bad data.
const NYC_BOUNDS = {
  minLat: 40.4,
  maxLat: 41.0,
  minLon: -74.3,
  maxLon: -73.65,
};

function isWithinNYC(lat, lon) {
  return (
    lat >= NYC_BOUNDS.minLat &&
    lat <= NYC_BOUNDS.maxLat &&
    lon >= NYC_BOUNDS.minLon &&
    lon <= NYC_BOUNDS.maxLon
  );
}

// Safety normalization map in case API casing drifts from expected filter values.
const BORO_DISPLAY_NAMES = {
  MANHATTAN: "Manhattan",
  BRONX: "Bronx",
  BROOKLYN: "Brooklyn",
  QUEENS: "Queens",
  "STATEN ISLAND": "Staten Island",
};

// DOHMH status actions. Unrecognized values fall back to 'unknown' to
// avoid misrepresenting closures. OPEN_ACTIONS/CLOSED_ACTIONS come from
// shared/inspectionStatus.mjs, the same source
// src/utils/gradeCategory.ts's CLOSED_ACTIONS reads from.
const OPEN_ACTIONS_SET = new Set(OPEN_ACTIONS);
const CLOSED_ACTIONS_SET = new Set(CLOSED_ACTIONS);

/**
 * Derives operational status from latest ACTION text.
 * Consumers should filter on `code` rather than mutable UI `label` strings.
 */
function deriveCurrentStatus(action) {
  if (OPEN_ACTIONS_SET.has(action)) return { code: "open", label: "Open" };
  if (CLOSED_ACTIONS_SET.has(action))
    return { code: "closed", label: "Closed by DOHMH" };
  return { code: "unknown", label: "Unknown" };
}

export function normalizeBoro(rawBoro) {
  if (!rawBoro) return "";
  const key = String(rawBoro).trim().toUpperCase();
  return BORO_DISPLAY_NAMES[key] ?? rawBoro;
}

// Stripped to remove low-signal noise from search index.
const CORPORATE_SUFFIXES = new Set([
  "INC",
  "LLC",
  "CORP",
  "CO",
  "LTD",
  "LP",
  "PC",
]);

// Bidirectional token expansions to support both abbreviated and spelled-out queries.
// ST maps to both STREET and SAINT to handle ambiguous names without complex NLP.
const ABBREVIATION_EXPANSIONS = {
  ST: ["STREET", "SAINT"],
  AVE: ["AVENUE"],
  BLVD: ["BOULEVARD"],
  RD: ["ROAD"],
  DR: ["DRIVE"],
  LN: ["LANE"],
  PL: ["PLACE"],
  CT: ["COURT"],
  PKWY: ["PARKWAY"],
  HWY: ["HIGHWAY"],
  EXPY: ["EXPRESSWAY"],
  SQ: ["SQUARE"],
  TER: ["TERRACE"],
  BLDG: ["BUILDING"],
  INTL: ["INTERNATIONAL"],
  N: ["NORTH"],
  S: ["SOUTH"],
  E: ["EAST"],
  W: ["WEST"],
};

function stripDiacritics(text) {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * Tokenizes text: strips punctuation/suffixes, preserves & as AND, and injects expansions.
 * Applies diacritic stripping ONLY for search normalization, leaving display names untouched.
 */
function normalizeToTokens(raw) {
  if (!raw) return [];

  const cleaned = stripDiacritics(String(raw))
    .toUpperCase()
    .replace(/&/g, " AND ")
    .replace(/['".]/g, "")
    .replace(/[^A-Z0-9\s]/g, " ");

  const words = cleaned.split(/\s+/).filter(Boolean);
  const tokens = [];

  for (const word of words) {
    if (CORPORATE_SUFFIXES.has(word)) continue;
    tokens.push(word);
    const expansions = ABBREVIATION_EXPANSIONS[word];
    if (expansions) tokens.push(...expansions);
  }

  return tokens;
}

/**
 * Combines entity fields into a deduplicated, space-delimited search token string.
 * Splits parentheticals, slashes, and leading 'THE' into distinct searchable segments.
 */
export function buildSearchIndex({ name, cuisine, street, building }) {
  const tokenSets = [];

  if (name) {
    const parenMatches = [...name.matchAll(/\(([^)]+)\)/g)].map((m) => m[1]);
    const nameWithoutParens = name.replace(/\([^)]*\)/g, " ");

    const slashSegments = nameWithoutParens
      .split("/")
      .map((s) => s.trim())
      .filter(Boolean);

    for (const segment of slashSegments) {
      tokenSets.push(...normalizeToTokens(segment));
    }
    for (const paren of parenMatches) {
      tokenSets.push(...normalizeToTokens(paren));
    }

    if (/^THE\s+/i.test(name.trim())) {
      tokenSets.push(
        ...normalizeToTokens(name.trim().replace(/^THE\s+/i, "")),
      );
    }
  }

  for (const field of [cuisine, street, building]) {
    tokenSets.push(...normalizeToTokens(field));
  }

  return [...new Set(tokenSets)].join(" ");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, attempt = 1) {
  let response;

  try {
    response = await fetch(url, { headers: REQUEST_HEADERS });
  } catch (networkErr) {
    if (attempt > MAX_RETRIES) throw networkErr;
    const delay = BASE_RETRY_DELAY_MS * 2 ** (attempt - 1);
    console.warn(
      `Network error on attempt ${attempt}, retrying in ${delay}ms: ${networkErr.message}`,
    );
    await sleep(delay);
    return fetchWithRetry(url, attempt + 1);
  }

  if (response.ok) return response;

  const isRetryable = [429, 500, 502, 503, 504].includes(response.status);
  if (!isRetryable || attempt > MAX_RETRIES) {
    throw new Error(
      `Socrata request failed: ${response.status} ${response.statusText}`,
    );
  }

  const delay = BASE_RETRY_DELAY_MS * 2 ** (attempt - 1);
  console.warn(
    `Got ${response.status} on attempt ${attempt}, retrying in ${delay}ms...`,
  );
  await sleep(delay);
  return fetchWithRetry(url, attempt + 1);
}

/**
 * Parses violation category CSV to enrich violation descriptions with official groupings.
 */
async function loadLocalViolationCategories() {
  console.log("Loading local violation categories from file...");
  
  try {
    const csvText = await readFile(CATEGORY_CSV_PATH, "utf-8");
    
    const lines = csvText.split(/\r?\n/).filter(line => line.trim() !== "");
    if (lines.length < 2) return {};

    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    const codeIdx = headers.findIndex(h => h === "Violation_Code");
    const categoryIdx = headers.findIndex(h => h === "Category_Description");

    const mapping = {};
    
    if (codeIdx === -1 || categoryIdx === -1) {
      console.warn("Could not find 'Violation Code' or 'Violation Category' columns in CSV.");
      return mapping;
    }

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(c => c.trim().replace(/^"|"$/g, ''));
      const code = cols[codeIdx];
      const category = cols[categoryIdx];
      
      if (code && category) {
        mapping[code] = category;
      }
    }
    
    return mapping;
  } catch (err) {
    console.warn(`Failed to load local violation categories: ${err.message}. Defaulting to uncategorized.`);
    return {};
  }
}

const SELECT_FIELDS = [
  "camis",
  "dba",
  "boro",
  "building",
  "street",
  "zipcode",
  "phone",
  "cuisine_description",
  "inspection_date",
  "action",
  "violation_code",
  "violation_description",
  "critical_flag",
  "score",
  "grade",
  "grade_date",
  "record_date",
  "inspection_type",
  "latitude",
  "longitude",
  "community_board",
  "council_district",
].join(",");

// Queries dataset count aggregate to validate paginated pipeline completeness.
async function fetchExpectedRowCount() {
  const url = `${DATASET_URL}?$select=count(*) as count`;
  const response = await fetchWithRetry(url);
  const [{ count }] = await response.json();
  return Number(count);
}

/**
 * Paginates SODA API. Orders by `:id` tiebreaker to prevent silent row drops
 * across page boundaries when multiple violations share identical dates.
 * Aborts on total count mismatch to prevent writing truncated builds.
 */
export async function fetchAllRows() {
  const expectedCount = await fetchExpectedRowCount();

  const rows = [];
  let offset = 0;

  while (true) {
    const url = `${DATASET_URL}?$select=${SELECT_FIELDS}&$limit=${PAGE_SIZE}&$offset=${offset}&$order=camis,inspection_date,:id`;
    console.log(`Fetching offset ${offset}...`);

    const response = await fetchWithRetry(url);
    const page = await response.json();
    rows.push(...page);

    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  console.log(`Fetched ${rows.length} total rows (expected ${expectedCount}).`);

  if (rows.length !== expectedCount) {
    throw new Error(
      `Row count mismatch: fetched ${rows.length} rows but Socrata reports ` +
        `${expectedCount} total for the dataset. Aborting rather than writing ` +
        `a possibly-incomplete dataset.`,
    );
  }

  return rows;
}

// Builds central violation lookup to avoid repeating verbose description strings across individual files.
export function buildViolationCodeLookup(rows, categoryMapping) {
  const lookup = {};
  for (const row of rows) {
    if (row.violation_code && !(row.violation_code in lookup)) {
      lookup[row.violation_code] = {
        description: row.violation_description ?? "",
        category: categoryMapping[row.violation_code] ?? "Uncategorized"
      };
    }
  }
  return lookup;
}

export function groupByCamis(rows) {
  const grouped = new Map();

  for (const row of rows) {
    const camis = row.camis;
    if (!camis) continue;

    if (!grouped.has(camis)) grouped.set(camis, []);
    grouped.get(camis).push(row);
  }

  return grouped;
}

// Groups flat violation rows into unified inspection events by date.
export function groupRowsByInspectionDate(camis, records) {
  const inspected = records.filter(
    (r) => r.inspection_date && r.inspection_date !== NOT_YET_INSPECTED_DATE,
  );
  const candidates = inspected.length > 0 ? inspected : records;

  const byDate = new Map();
  for (const r of candidates) {
    if (!byDate.has(r.inspection_date)) byDate.set(r.inspection_date, []);
    byDate.get(r.inspection_date).push(r);
  }

  const events = [];
  for (const [date, rowsForDate] of byDate) {
    events.push({
      id: `${camis}-${date.slice(0, 10)}`,
      date,
      primary: rowsForDate.find((r) => r.score != null) ?? rowsForDate[0],
      violations: rowsForDate
        .filter((r) => r.violation_code)
        .map((r) => ({
          code: r.violation_code,
          critical_flag: r.critical_flag ?? "",
        })),
    });
  }

  events.sort((a, b) => (a.date > b.date ? 1 : a.date < b.date ? -1 : 0));

  return events;
}

export function buildEventsByRestaurant(grouped) {
  const eventsByRestaurant = new Map();
  for (const [camis, records] of grouped) {
    eventsByRestaurant.set(camis, groupRowsByInspectionDate(camis, records));
  }
  return eventsByRestaurant;
}

export function buildGeocodeInputList(eventsByRestaurant) {
  const restaurants = [];

  for (const [camis, events] of eventsByRestaurant) {
    if (events.length === 0) continue;
    const { primary } = events[events.length - 1];

    const lat = parseFloat(primary.latitude);
    const lon = parseFloat(primary.longitude);

    restaurants.push({
      camis,
      dba: primary.dba ?? "",
      building: primary.building ?? "",
      street: primary.street ?? "",
      boro: normalizeBoro(primary.boro),
      zip: primary.zipcode ?? "",
      dohmhLat: Number.isNaN(lat) ? null : lat,
      dohmhLon: Number.isNaN(lon) ? null : lon,
    });
  }

  return restaurants;
}

/**
 * Builds the primary GeoJSON feature collection for the map.
 * Enforces spatial validity (NYC bounding box) and resolves geocode cache overrides.
 */
export function buildLatestInspectionsGeoJSON(
  eventsByRestaurant,
  generatedAt,
  geocodeCache = {},
) {
  const features = [];

  for (const [camis, events] of eventsByRestaurant) {
    const scoredEvents = events.filter(
      (event) =>
        event.primary.score != null && event.date !== NOT_YET_INSPECTED_DATE,
    );

    // Restaurants with zero scored events have never received an actual
    // DOHMH inspection; every record on file is the 1900-01-01
    // placeholder. These used to be dropped from the dataset entirely;
    // now they're surfaced as a distinct "Uninspected" category (grade
    // forced to UNINSPECTED_GRADE below) rather than silently omitted. A
    // legally-operating-before-inspection status doesn't necessarily mean
    // the restaurant is still open; see the grade/copy handling below,
    // which stays neutral rather than asserting either way.
    const isUninspected = scoredEvents.length === 0;
    const latest = isUninspected
      ? events[events.length - 1]
      : scoredEvents[scoredEvents.length - 1];

    if (!latest) continue;

    const { primary, violations } = latest;

    const dohmhLatRaw = parseFloat(primary.latitude);
    const dohmhLonRaw = parseFloat(primary.longitude);

    const dohmhValid =
      !Number.isNaN(dohmhLatRaw) &&
      !Number.isNaN(dohmhLonRaw) &&
      isWithinNYC(dohmhLatRaw, dohmhLonRaw);

    const cacheEntry = geocodeCache[camis];

    // Must match bounds check; prevents false positive matches on duplicate street names outside NYC.
    const hasVerifiedResolution =
      cacheEntry?.status === "verified" &&
      cacheEntry.resolved &&
      isWithinNYC(cacheEntry.resolved.lat, cacheEntry.resolved.lon);

    if (!dohmhValid && !hasVerifiedResolution) continue;

    const displayLat = hasVerifiedResolution ? cacheEntry.resolved.lat : dohmhLatRaw;
    const displayLon = hasVerifiedResolution ? cacheEntry.resolved.lon : dohmhLonRaw;

    // Cache entries that failed NYC bounds are flagged 'unverified' rather than 'pending' (already attempted).
    const failedBoundsCheck =
      cacheEntry?.status === "verified" &&
      cacheEntry.resolved &&
      !isWithinNYC(cacheEntry.resolved.lat, cacheEntry.resolved.lon);

    const locationStatus = hasVerifiedResolution
      ? "verified"
      : cacheEntry?.status === "unverified" || failedBoundsCheck
        ? "unverified"
        : "pending";

    const status = deriveCurrentStatus(primary.action);

    const roundedLat = Math.round(displayLat * 1e6) / 1e6;
    const roundedLon = Math.round(displayLon * 1e6) / 1e6;
    const roundedDohmhLat = dohmhValid ? Math.round(dohmhLatRaw * 1e6) / 1e6 : null;
    const roundedDohmhLon = dohmhValid ? Math.round(dohmhLonRaw * 1e6) / 1e6 : null;
    const neighbourhood = hasVerifiedResolution
      ? cacheEntry.resolved.neighbourhood ?? null
      : null;

    features.push({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [roundedLon, roundedLat],
      },
      properties: {
        id: latest.id,
        camis,
        name: primary.dba ?? "",
        latitude: roundedLat,
        longitude: roundedLon,
        search_index: buildSearchIndex({
          name: primary.dba ?? "",
          cuisine: primary.cuisine_description ?? "",
          street: primary.street ?? "",
          building: primary.building ?? "",
        }),
        boro: normalizeBoro(primary.boro),
        building: primary.building ?? "",
        street: primary.street ?? "",
        display_street: formatDisplayStreet(primary.street ?? ""),
        display_address: formatDisplayAddress({
          building: primary.building ?? "",
          street: primary.street ?? "",
          neighbourhood,
        }),
        zipcode: primary.zipcode ?? "",
        phone: primary.phone ?? "",
        cuisine: primary.cuisine_description ?? "",
        dohmh_latitude: roundedDohmhLat,
        dohmh_longitude: roundedDohmhLon,
        location_status: locationStatus,
        neighbourhood,
        grade: isUninspected ? UNINSPECTED_GRADE : primary.grade || null,
        grade_date: isUninspected ? null : (primary.grade_date ?? null),
        score: isUninspected ? null : Number(primary.score),
        inspection_date: latest.date,
        inspection_type: primary.inspection_type ?? "",
        action: primary.action ?? "",
        violations: JSON.stringify(violations),
        current_status_code: status.code,
        current_status_label: status.label,
        record_date: primary.record_date ?? null,
        community_board: primary.community_board ?? "",
        council_district: primary.council_district ?? "",
      },
    });
  }

  return {
    type: "FeatureCollection",
    generated_at: generatedAt,
    features,
  };
}

export function buildInspectionHistory(eventsByRestaurant, generatedAt) {
  const restaurants = {};

  for (const [camis, events] of eventsByRestaurant) {
    const points = events
      .filter((event) => event.primary.score != null)
      .map((event) => ({
        id: event.id,
        date: event.date,
        score: Number(event.primary.score),
        grade: event.primary.grade || null,
        inspection_type: event.primary.inspection_type ?? "",
        action: event.primary.action ?? "",
        violations: event.violations,
      }));

    if (points.length > 0) {
      restaurants[camis] = points;
    }
  }

  return {
    generated_at: generatedAt,
    restaurants,
  };
}

export function buildDashboardMeta(generatedAt, restaurantCount, historyRestaurants, countsSnapshot) {
  const inspectionCount = Object.values(historyRestaurants).reduce(
    (total, points) => total + points.length,
    0,
  );

  // The Dashboard Information panel reports the state of the last daily
  // geocode-backfill run, not this build. `main` is pushed (and the site
  // rebuilt) many times a day; the deltas must only ever compare one daily
  // refresh to the one before it, so run-geocode-backfill.mjs computes and
  // freezes both the totals and the deltas in counts-snapshot.json, and this
  // build passes them straight through. Until the first snapshot has been
  // committed, fall back to this build's own live totals with no deltas.
  if (countsSnapshot?.restaurantCount != null) {
    return {
      lastUpdated: countsSnapshot.generatedAt ?? generatedAt,
      restaurantCount: countsSnapshot.restaurantCount,
      inspectionCount: countsSnapshot.inspectionCount ?? inspectionCount,
      restaurantDelta: countsSnapshot.restaurantDelta ?? null,
      inspectionDelta: countsSnapshot.inspectionDelta ?? null,
    };
  }

  return {
    lastUpdated: generatedAt,
    restaurantCount,
    inspectionCount,
    restaurantDelta: null,
    inspectionDelta: null,
  };
}

// Tolerates missing/corrupted baseline file by returning null instead of throwing.
async function loadCountsSnapshot(filePath) {
  try {
    const raw = await readFile(filePath, "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === "ENOENT") {
      return null;
    }
    console.warn(
      `Counts snapshot at ${filePath} could not be read (${err.message}); omitting deltas.`,
    );
    return null;
  }
}

async function runInBatches(items, batchSize, fn) {
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    await Promise.all(batch.map(fn));
  }
}

// Re-creates history directory on every build to prevent orphaned files from decommissioned venues.
export async function writeHistoryFiles(restaurants) {
  await rm(HISTORY_DIR, { recursive: true, force: true });
  await mkdir(HISTORY_DIR, { recursive: true });

  const HISTORY_WRITE_BATCH_SIZE = 500;
  await runInBatches(
    Object.entries(restaurants),
    HISTORY_WRITE_BATCH_SIZE,
    ([camis, points]) =>
      writeFile(
        path.join(HISTORY_DIR, `${camis}.json`),
        JSON.stringify(points),
        "utf-8",
      ),
  );
}

async function main() {
  let rows;
  try {
    rows = await fetchAllRows();
  } catch (err) {
    throw new Error(`Failed while fetching inspections: ${err.message}`, {
      cause: err,
    });
  }

  const geocodeCache = await loadCache(GEOCODE_CACHE_PATH);
  const countsSnapshot = await loadCountsSnapshot(COUNTS_SNAPSHOT_PATH);

  let latestGeoJSON, history, violationCodes, dashboardMeta;
  try {
    const grouped = groupByCamis(rows);
    const eventsByRestaurant = buildEventsByRestaurant(grouped);
    const generatedAt = new Date().toISOString();
    
    const categoryMapping = await loadLocalViolationCategories();
    
    latestGeoJSON = buildLatestInspectionsGeoJSON(
      eventsByRestaurant,
      generatedAt,
      geocodeCache,
    );
    history = buildInspectionHistory(eventsByRestaurant, generatedAt);
    violationCodes = buildViolationCodeLookup(rows, categoryMapping);
    dashboardMeta = buildDashboardMeta(
      generatedAt,
      latestGeoJSON.features.length,
      history.restaurants,
      countsSnapshot,
    );
  } catch (err) {
    throw new Error(`Failed while building output data: ${err.message}`, {
      cause: err,
    });
  }

  try {
    await mkdir(OUTPUT_DIR, { recursive: true });

    await Promise.all([
      writeFile(
        path.join(OUTPUT_DIR, "latest-inspections.geojson"),
        JSON.stringify(latestGeoJSON),
        "utf-8",
      ),
      writeFile(
        path.join(OUTPUT_DIR, "violation-codes.json"),
        JSON.stringify(violationCodes),
        "utf-8",
      ),
      writeFile(
        path.join(OUTPUT_DIR, "dashboard-meta.json"),
        JSON.stringify(dashboardMeta),
        "utf-8",
      ),
      writeHistoryFiles(history.restaurants),
    ]);
  } catch (err) {
    throw new Error(`Failed while writing output files: ${err.message}`, {
      cause: err,
    });
  }

  console.log(
    `Wrote ${latestGeoJSON.features.length} restaurants to latest-inspections.geojson`,
  );
  console.log(
    `Wrote ${Object.keys(violationCodes).length} codes to violation-codes.json`,
  );
  console.log(
    `Wrote ${Object.keys(history.restaurants).length} individual history files to ${HISTORY_DIR}`,
  );
  console.log(
    `Wrote dashboard-meta.json (${dashboardMeta.restaurantCount} restaurants [${formatDeltaForLog(dashboardMeta.restaurantDelta)}], ` +
      `${dashboardMeta.inspectionCount} inspections [${formatDeltaForLog(dashboardMeta.inspectionDelta)}], generated_at ${dashboardMeta.lastUpdated})`,
  );
}

function formatDeltaForLog(delta) {
  if (delta == null) return "no baseline";
  return delta >= 0 ? `+${delta}` : `${delta}`;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err.message);
    if (err.cause) console.error("Caused by:", err.cause);
    process.exit(1);
  });
}