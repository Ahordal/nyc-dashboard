// fetch-inspections.mjs
//
// Fetches the full NYC DOHMH Restaurant Inspection Results dataset from the
// Socrata (SODA) API, then produces four output files:
//
//   1. public/data/latest-inspections.geojson
//      One point feature per restaurant (CAMIS), representing that
//      restaurant's most recent SCORED inspection (which can span
//      multiple violation rows sharing the same date -- those are
//      rolled up into a single `violations` array rather than picking
//      one arbitrarily). If a restaurant's truly-latest visit has no
//      score (a non-substantive compliance/administrative check), this
//      falls back to their last real graded/scored inspection instead.
//      Restaurants with NO scored inspection anywhere in their history
//      (including ones that have never been inspected at all) are
//      excluded from this file entirely, rather than appearing as a
//      "no data" placeholder. Used to drive the map, KPI counts, and
//      grade breakdown donut chart.
//
//   2. public/data/history/{camis}.json
//      One small file per restaurant, holding just that restaurant's
//      SCORED inspection EVENTS (grouped by inspection_date, with that
//      date's violations rolled up), sorted oldest -> newest. Used to
//      drive the "Score Over Time" chart -- fetched only for the
//      restaurant a visitor actually selects, rather than one giant file
//      containing every restaurant's history. Each point carries enough
//      detail (grade, violations, inspection type) to open its own
//      inspection detail view when clicked, not just plot a bare number.
//      The directory is wiped and fully regenerated on every run, so a
//      restaurant that drops out of the dataset doesn't leave an
//      orphaned file behind. Every restaurant with a file here has at
//      least one scored inspection -- the same underlying criterion
//      latest-inspections.geojson uses -- though the map file also
//      requires valid coordinates, so a restaurant with bad/missing
//      lat-long data could have a history file here without appearing
//      on the map.
//
//   3. public/data/violation-codes.json
//      A single small lookup object mapping each violation `code` (e.g.
//      "06B") to its description and official DOHMH category. There are
//      only ~115 distinct codes actively cited across the dataset, but tens
//      of thousands of inspection events cite them -- embedding the full text
//      on every single violation entry in the two files above means the
//      same strings get duplicated thousands of times over. Instead,
//      violations in both other output files carry only `code` and
//      `critical_flag`; consumers look up details here by code.
//      Cuts the combined output size roughly in half.
//
//   4. public/data/dashboard-meta.json
//      A small summary object -- { lastUpdated, restaurantCount,
//      inspectionCount } -- describing this run's freshness and the
//      overall size of the dataset. restaurantCount mirrors
//      latest-inspections.geojson's feature count; inspectionCount sums
//      every scored inspection event across all restaurants in the
//      history output. Powers the "Dashboard Information" modal's
//      Data Source & Freshness section.
//
// public/data/ is regenerated from scratch on every run and is NOT meant
// to be committed to Git -- see the project README for how this fits into
// the Vercel build step vs. the scheduled GitHub Action that pings a
// Vercel Deploy Hook to keep data fresh without any code changes.

import { writeFile, readFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadCache } from "./cache.mjs";
import { formatDisplayAddress, formatDisplayStreet } from "./normalize.mjs";

// Path to the geocode cache committed to the repo by the scheduled
// GitHub Action (see run-geocode-backfill.mjs). This file is READ ONLY
// here -- no network calls, no LocationIQ API key needed at build time.
// If the cache doesn't exist yet (e.g. before the first backfill run),
// loadCache() returns {} and every restaurant simply falls back to its
// DOHMH coordinate with location_status "pending".
const GEOCODE_CACHE_PATH = path.join(import.meta.dirname, "geocode-cache.json");

// Path to the locally committed violation categories CSV mapping file.
const CATEGORY_CSV_PATH = path.join(import.meta.dirname, "violation-categories.csv");

const DATASET_URL = "https://data.cityofnewyork.us/resource/43nn-pn8j.json";
const PAGE_SIZE = 50000; // Socrata's max recommended page size

// Anchored to this script's own location, not the caller's working
// directory -- so this always resolves to <repo root>/public/data,
// whether the script is run from the repo root, from inside pipeline/,
// or (as in the GitHub Action) with pipeline/ set as the working directory.
const OUTPUT_DIR = path.resolve(import.meta.dirname, "../public/data");

// Per-restaurant history files live here (one small file per CAMIS)
// instead of one giant inspection-history.json, so a visitor only ever
// downloads the one restaurant's history they actually click into.
export const HISTORY_DIR = path.join(OUTPUT_DIR, "history");

const REQUEST_HEADERS = process.env.SOCRATA_APP_TOKEN
  ? { "X-App-Token": process.env.SOCRATA_APP_TOKEN }
  : {};

// Retry settings for transient Socrata errors (429/500/503, etc).
const MAX_RETRIES = 4;
const BASE_RETRY_DELAY_MS = 1000; // 1s, then 2s, then 4s, then 8s

// The placeholder date Socrata uses for restaurants that haven't been
// inspected yet. These are excluded from the "most recent inspection" logic
// but they could still appear in the raw data. Comparisons below rely on
// this being a fixed-format ISO-8601 string, same shape as inspection_date
// values returned by the API, so plain string comparison stays valid.
const NOT_YET_INSPECTED_DATE = "1900-01-01T00:00:00.000";

// Loose bounding box around NYC (including a small margin), used to catch
// obviously-wrong coordinates -- e.g. (0, 0), swapped lat/lon, or other
// "illogical values" the dataset's own documentation warns about -- rather
// than plotting a garbage point somewhere nonsensical on the map.
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

// The API returns BORO as a title-case string already ("Brooklyn", "Bronx"),
// matching BoroughFilters values directly. This map is kept as a
// safety net in case that casing ever drifts, normalizing whatever comes
// back to the exact values the UI expects.
const BORO_DISPLAY_NAMES = {
  MANHATTAN: "Manhattan",
  BRONX: "Bronx",
  BROOKLYN: "Brooklyn",
  QUEENS: "Queens",
  "STATEN ISLAND": "Staten Island",
};

// The dataset's own documentation lists exactly these five ACTION values.
// Whichever one appears on a restaurant's MOST RECENT inspection tells us
// their current DOHMH-enforced status -- e.g. if the last thing on record
// is "re-closed," they're currently closed; if it's "re-opened" (or just a
// normal inspection with or without violations), they're open. Anything
// that doesn't exactly match one of these known values falls through to
// "unknown" rather than guessing.
const OPEN_ACTIONS = new Set([
  "Violations were cited in the following area(s).",
  "No violations were recorded at the time of this inspection.",
  "Establishment re-opened by DOHMH",
]);
const CLOSED_ACTIONS = new Set([
  "Establishment re-closed by DOHMH",
  "Establishment Closed by DOHMH. Violations were cited in the following area(s) and those requiring immediate action were addressed.",
]);

/**
 * Derives a restaurant's current open/closed status from its most recent
 * SCORED inspection's ACTION text. Anything that doesn't exactly match
 * one of the known values falls through to "unknown" rather than
 * guessing -- silently assuming "open" for an unrecognized value would
 * be the wrong kind of mistake on a public health tool.
 *
 * Returns { code, label }: `code` is a stable machine-readable value
 * ("open" / "closed" / "unknown") meant for filtering and rendering
 * logic, while `label` is the human-readable display text. Consumers
 * should always match on `code`, never on `label` -- the label is free
 * to change wording without that being a breaking change.
 */
function deriveCurrentStatus(action) {
  if (OPEN_ACTIONS.has(action)) return { code: "open", label: "Open" };
  if (CLOSED_ACTIONS.has(action))
    return { code: "closed", label: "Closed by DOHMH" };
  return { code: "unknown", label: "Unknown" };
}

export function normalizeBoro(rawBoro) {
  if (!rawBoro) return "";
  const key = String(rawBoro).trim().toUpperCase();
  return BORO_DISPLAY_NAMES[key] ?? rawBoro;
}

// Legal/corporate suffixes stripped from search tokens -- these rarely
// help someone find a restaurant and only add noise to the index.
const CORPORATE_SUFFIXES = new Set([
  "INC",
  "LLC",
  "CORP",
  "CO",
  "LTD",
  "LP",
  "PC",
]);

// Two-way street/word abbreviation expansions. Each key maps to the
// expansion added as an EXTRA token alongside the original -- both forms
// end up in the search index, so a query in either form matches. "ST" is
// deliberately mapped to both "STREET" and "SAINT" since it's genuinely
// ambiguous without positional context (e.g. "1st St" vs "St. Mark's");
// adding both extra tokens is harmless for matching purposes, it just
// means "ST" contributes a bit of redundant searchable text.
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

/**
 * Normalizes a single free-text field into a set of searchable tokens:
 * uppercased, apostrophes/periods stripped (so "INT'L" and "ST." become
 * "INTL" and "ST" before abbreviation lookup), corporate suffixes
 * dropped, and each remaining word expanded via ABBREVIATION_EXPANSIONS
 * where applicable (original word is always kept alongside its
 * expansion(s), never replaced).
 *
 * Returns an array of tokens rather than a joined string, so callers can
 * combine tokens from multiple source fields before deduping/joining
 * once at the end.
 */
function stripDiacritics(text) {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeToTokens(raw) {
  if (!raw) return [];

  const cleaned = stripDiacritics(String(raw))
    .toUpperCase()
    .replace(/&/g, " AND ") // & -> AND as its own token, not stripped
    .replace(/['".]/g, "") // strip apostrophes and periods
    .replace(/[^A-Z0-9\s]/g, " "); // any other punctuation -> space

  const words = cleaned.split(/\s+/).filter(Boolean);
  const tokens = [];

  for (const word of words) {
    if (CORPORATE_SUFFIXES.has(word)) continue; // drop entirely, no value as a search term
    tokens.push(word);
    const expansions = ABBREVIATION_EXPANSIONS[word];
    if (expansions) tokens.push(...expansions);
  }

  return tokens;
}

/**
 * Builds the single normalized `search_index` string stored on each
 * restaurant feature, combining name, cuisine, street, and building into
 * one searchable field.
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

/**
 * Fetches a URL with retry and exponential backoff.
 */
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
 * Loads and parses the local DOHMH Violation Code mapping CSV file offline.
 * Returns a dictionary mapping violation codes to their categories.
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

/**
 * Fetches every row from the dataset using paginated SODA API requests.
 */
export async function fetchAllRows() {
  const rows = [];
  let offset = 0;

  while (true) {
    const url = `${DATASET_URL}?$select=${SELECT_FIELDS}&$limit=${PAGE_SIZE}&$offset=${offset}&$order=camis,inspection_date`;
    console.log(`Fetching offset ${offset}...`);

    const response = await fetchWithRetry(url);
    const page = await response.json();
    rows.push(...page);

    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  console.log(`Fetched ${rows.length} total rows.`);
  return rows;
}

/**
 * Builds the code-to-details lookup written to violation-codes.json,
 * combining description and official category.
 */
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
    if (scoredEvents.length === 0) continue;

    const latest = scoredEvents[scoredEvents.length - 1];
    const { primary, violations } = latest;

    const dohmhLatRaw = parseFloat(primary.latitude);
    const dohmhLonRaw = parseFloat(primary.longitude);

    const dohmhValid =
      !Number.isNaN(dohmhLatRaw) &&
      !Number.isNaN(dohmhLonRaw) &&
      isWithinNYC(dohmhLatRaw, dohmhLonRaw);

    const cacheEntry = geocodeCache[camis];
    const hasVerifiedResolution =
      cacheEntry?.status === "verified" && cacheEntry.resolved;

    if (!dohmhValid && !hasVerifiedResolution) continue;

    const displayLat = hasVerifiedResolution ? cacheEntry.resolved.lat : dohmhLatRaw;
    const displayLon = hasVerifiedResolution ? cacheEntry.resolved.lon : dohmhLonRaw;

    const locationStatus = hasVerifiedResolution
      ? "verified"
      : cacheEntry?.status === "unverified"
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
        grade: primary.grade || null,
        grade_date: primary.grade_date ?? null,
        score: Number(primary.score),
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

export function buildDashboardMeta(generatedAt, restaurantCount, historyRestaurants) {
  const inspectionCount = Object.values(historyRestaurants).reduce(
    (total, points) => total + points.length,
    0,
  );

  return {
    lastUpdated: generatedAt,
    restaurantCount,
    inspectionCount,
  };
}

async function runInBatches(items, batchSize, fn) {
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    await Promise.all(batch.map(fn));
  }
}

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

  let latestGeoJSON, history, violationCodes, dashboardMeta;
  try {
    const grouped = groupByCamis(rows);
    const eventsByRestaurant = buildEventsByRestaurant(grouped);
    const generatedAt = new Date().toISOString();
    
    // Load official violation categories from the local repository asset
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
    `Wrote dashboard-meta.json (${dashboardMeta.restaurantCount} restaurants, ${dashboardMeta.inspectionCount} inspections, generated_at ${dashboardMeta.lastUpdated})`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err.message);
    if (err.cause) console.error("Caused by:", err.cause);
    process.exit(1);
  });
}