// fetch-inspections.mjs
//
// Fetches the full NYC DOHMH Restaurant Inspection Results dataset from the
// Socrata (SODA) API, then produces two output files:
//
//   1. public/data/latest-inspections.geojson
//      One point feature per restaurant (CAMIS), representing that
//      restaurant's most recent INSPECTION (which can span multiple
//      violation rows sharing the same date -- those are rolled up into
//      a single `violations` array rather than picking one arbitrarily).
//      Used to drive the map, KPI counts, and grade breakdown donut chart.
//
//   2. public/data/inspection-history.json
//      Every inspection EVENT per restaurant (grouped by inspection_date,
//      with that date's violations rolled up), sorted oldest -> newest.
//      Used to drive the "Score Over Time" chart -- each point carries
//      enough detail (grade, violations, inspection type) to open its own
//      inspection detail view when clicked, not just plot a bare number.
//
// Run with: node fetch-inspections.mjs
// Requires Node 18+ (for built-in fetch).
//
// Optional: set a SOCRATA_APP_TOKEN environment variable to get a higher,
// dedicated rate limit from Socrata instead of the shared unauthenticated
// pool. Sign up for a free token at https://data.cityofnewyork.us/profile/app_tokens

import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const DATASET_URL = "https://data.cityofnewyork.us/resource/43nn-pn8j.json";
const PAGE_SIZE = 50000; // Socrata's max recommended page size
// Anchored to this script's own location, not the caller's working
// directory -- so this always resolves to <repo root>/public/data,
// whether the script is run from the repo root, from inside pipeline/,
// or (as in the GitHub Action) with pipeline/ set as the working directory.
const OUTPUT_DIR = path.resolve(import.meta.dirname, "../public/data");

const REQUEST_HEADERS = process.env.SOCRATA_APP_TOKEN
  ? { "X-App-Token": process.env.SOCRATA_APP_TOKEN }
  : {};

// Retry settings for transient Socrata errors (429/500/503, etc).
const MAX_RETRIES = 4;
const BASE_RETRY_DELAY_MS = 1000; // 1s, then 2s, then 4s, then 8s

// The placeholder date Socrata uses for restaurants that haven't been
// inspected yet. We exclude these from "most recent inspection" logic
// but they could still appear in the raw data. Comparisons below rely on
// this being a fixed-format ISO-8601 string, same shape as inspection_date
// values returned by the API, so plain string comparison stays valid.
const NOT_YET_INSPECTED_DATE = "1900-01-01T00:00:00.000";

// The API returns BORO as a title-case string already ("Brooklyn", "Bronx"),
// matching the app's BoroughFilters values directly. This map is kept as a
// safety net in case that casing ever drifts, normalizing whatever comes
// back to the exact values the UI expects.
const BORO_DISPLAY_NAMES = {
  MANHATTAN: "Manhattan",
  BRONX: "Bronx",
  BROOKLYN: "Brooklyn",
  QUEENS: "Queens",
  "STATEN ISLAND": "Staten Island",
};

function normalizeBoro(rawBoro) {
  if (!rawBoro) return "";
  const key = String(rawBoro).trim().toUpperCase();
  return BORO_DISPLAY_NAMES[key] ?? rawBoro;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetches a single URL with retry + exponential backoff for transient
 * server errors. Throws immediately on non-retryable failures (e.g. a
 * malformed request), and after MAX_RETRIES attempts on persistent ones.
 */
async function fetchWithRetry(url, attempt = 1) {
  let response;

  try {
    response = await fetch(url, { headers: REQUEST_HEADERS });
  } catch (networkErr) {
    // Network-level failure (DNS, connection reset, etc) -- also retryable.
    if (attempt > MAX_RETRIES) throw networkErr;
    const delay = BASE_RETRY_DELAY_MS * 2 ** (attempt - 1);
    console.warn(
      `Network error on attempt ${attempt}, retrying in ${delay}ms: ${networkErr.message}`
    );
    await sleep(delay);
    return fetchWithRetry(url, attempt + 1);
  }

  if (response.ok) return response;

  const isRetryable = [429, 500, 502, 503, 504].includes(response.status);
  if (!isRetryable || attempt > MAX_RETRIES) {
    throw new Error(
      `Socrata request failed: ${response.status} ${response.statusText}`
    );
  }

  const delay = BASE_RETRY_DELAY_MS * 2 ** (attempt - 1);
  console.warn(
    `Got ${response.status} on attempt ${attempt}, retrying in ${delay}ms...`
  );
  await sleep(delay);
  return fetchWithRetry(url, attempt + 1);
}

/**
 * Fetches every row of the dataset via paginated SODA API requests.
 * Socrata returns fewer than PAGE_SIZE rows on the final page, which is
 * how we know to stop. Ordering by camis, inspection_date means each
 * restaurant's records already arrive in chronological order, so later
 * steps don't need to re-sort them from scratch. Note this dataset returns
 * one row PER VIOLATION, so several rows can legitimately share the same
 * camis + inspection_date -- that's handled explicitly below, not assumed
 * away by the ordering.
 */
async function fetchAllRows() {
  const rows = [];
  let offset = 0;

  while (true) {
    const url = `${DATASET_URL}?$limit=${PAGE_SIZE}&$offset=${offset}&$order=camis,inspection_date`;
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
 * Groups raw inspection rows by restaurant (CAMIS). Because rows were
 * fetched in camis, inspection_date order, each group's records are
 * already sorted oldest -> newest.
 */
function groupByCamis(rows) {
  const grouped = new Map();

  for (const row of rows) {
    const camis = row.camis;
    if (!camis) continue;

    if (!grouped.has(camis)) grouped.set(camis, []);
    grouped.get(camis).push(row);
  }

  return grouped;
}

/**
 * Groups one restaurant's raw rows into distinct inspection EVENTS --
 * one entry per unique inspection_date, with every violation row from
 * that date rolled up into a single `violations` array. Both
 * buildLatestInspectionsGeoJSON and buildInspectionHistory need this same
 * grouping (one just wants the last entry, the other wants all of them),
 * so it's factored out here rather than duplicated.
 *
 * Returns an array of { date, primary, violations }, in chronological
 * order (oldest first) -- relying on the fact that `records` already
 * arrives sorted, per groupByCamis's contract.
 */
function groupRowsByInspectionDate(records) {
  const inspected = records.filter(
    (r) => r.inspection_date && r.inspection_date !== NOT_YET_INSPECTED_DATE
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
      date,
      // Restaurant/inspection-level fields (name, address, grade, score,
      // etc.) are identical across every row sharing a date, so any one
      // of them works as the source for those.
      primary: rowsForDate[0],
      violations: rowsForDate
        .filter((r) => r.violation_code)
        .map((r) => ({
          code: r.violation_code,
          description: r.violation_description ?? "",
          critical_flag: r.critical_flag ?? "",
        })),
    });
  }

  // byDate iteration order follows insertion order, which follows the
  // pre-sorted input -- but sort explicitly by date string anyway so this
  // helper's correctness doesn't silently depend on that upstream ordering
  // being preserved if fetchAllRows' $order clause ever changes.
  events.sort((a, b) => (a.date > b.date ? 1 : a.date < b.date ? -1 : 0));

  return events;
}

/**
 * Builds the most-recent-per-restaurant GeoJSON FeatureCollection.
 *
 * A single inspection can produce several rows (one per violation cited)
 * that share the same camis + inspection_date. Rather than treating one
 * arbitrary row as "the" inspection, this groups by inspection_date first,
 * then rolls up every violation from that date into a `violations` array
 * on the feature -- so no violation is silently dropped or overwritten.
 */
function buildLatestInspectionsGeoJSON(grouped) {
  const features = [];

  for (const [camis, records] of grouped) {
    const events = groupRowsByInspectionDate(records);
    if (events.length === 0) continue;

    const latest = events[events.length - 1];
    const { primary, violations } = latest;

    const lat = parseFloat(primary.latitude);
    const lon = parseFloat(primary.longitude);

    // Skip records with no usable coordinates -- can't place them on the map.
    if (Number.isNaN(lat) || Number.isNaN(lon)) continue;

    features.push({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [lon, lat],
      },
      properties: {
        camis,
        name: primary.dba ?? "",
        boro: normalizeBoro(primary.boro),
        building: primary.building ?? "",
        street: primary.street ?? "",
        zipcode: primary.zipcode ?? "",
        phone: primary.phone ?? "",
        cuisine: primary.cuisine_description ?? "",
        grade: primary.grade ?? "N",
        grade_date: primary.grade_date ?? null,
        // != null (not truthy) so a genuine score of 0 is kept, not
        // coerced to null -- a restaurant with zero violations is common
        // and meaningfully different from "no score recorded."
        score: primary.score != null ? Number(primary.score) : null,
        inspection_date: latest.date,
        inspection_type: primary.inspection_type ?? "",
        action: primary.action ?? "",
        violations,
        record_date: primary.record_date ?? null,
        community_board: primary.community_board ?? "",
        council_district: primary.council_district ?? "",
        census_tract: primary.census_tract ?? "",
        bin: primary.bin ?? "",
        bbl: primary.bbl ?? "",
        nta: primary.nta ?? "",
      },
    });
  }

  return {
    type: "FeatureCollection",
    features,
  };
}

/**
 * Builds the per-restaurant inspection history used for the
 * "Score Over Time" chart. Each point now represents one full inspection
 * EVENT -- not just a bare (date, score) pair -- including its grade and
 * rolled-up violations, so clicking a point on the chart can open that
 * specific past inspection's full results (matching the map's popup/detail
 * panel behavior), not just show a number.
 */
function buildInspectionHistory(grouped) {
  const history = {};

  for (const [camis, records] of grouped) {
    const events = groupRowsByInspectionDate(records);

    const points = events
      .filter((event) => event.primary.score != null) // needs a score to plot
      .map((event) => ({
        date: event.date,
        score: Number(event.primary.score),
        grade: event.primary.grade ?? null,
        inspection_type: event.primary.inspection_type ?? "",
        action: event.primary.action ?? "",
        violations: event.violations,
      }));

    if (points.length > 0) {
      history[camis] = points;
    }
  }

  return history;
}

async function main() {
  let rows;
  try {
    rows = await fetchAllRows();
  } catch (err) {
    throw new Error(`Failed while fetching inspections: ${err.message}`, { cause: err });
  }

  let latestGeoJSON, history;
  try {
    const grouped = groupByCamis(rows);
    latestGeoJSON = buildLatestInspectionsGeoJSON(grouped);
    history = buildInspectionHistory(grouped);
  } catch (err) {
    throw new Error(`Failed while building output data: ${err.message}`, { cause: err });
  }

  try {
    await mkdir(OUTPUT_DIR, { recursive: true });

    await Promise.all([
      writeFile(
        path.join(OUTPUT_DIR, "latest-inspections.geojson"),
        JSON.stringify(latestGeoJSON),
        "utf-8"
      ),
      writeFile(
        path.join(OUTPUT_DIR, "inspection-history.json"),
        JSON.stringify(history),
        "utf-8"
      ),
    ]);
  } catch (err) {
    throw new Error(`Failed while writing output files: ${err.message}`, { cause: err });
  }

  console.log(
    `Wrote ${latestGeoJSON.features.length} restaurants to latest-inspections.geojson`
  );
  console.log(
    `Wrote history for ${Object.keys(history).length} restaurants to inspection-history.json`
  );
}

main().catch((err) => {
  console.error(err.message);
  if (err.cause) console.error("Caused by:", err.cause);
  process.exit(1);
});