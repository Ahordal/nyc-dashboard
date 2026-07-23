// fetch-inspections.mjs
//
// Fetches the full NYC DOHMH Restaurant Inspection Results dataset from the
// Socrata (SODA) API, then produces two output files:
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
// Run with: node fetch-inspections.mjs
// Requires Node 18+ (for built-in fetch).
//
// Optional: set a SOCRATA_APP_TOKEN environment variable to get a higher,
// dedicated rate limit from Socrata instead of the shared unauthenticated
// pool. Sign up for a free token at https://data.cityofnewyork.us/profile/app_tokens

import { writeFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

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
// inspected yet. We exclude these from "most recent inspection" logic
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

// The dataset's own documentation lists exactly these five ACTION values.
// Whichever one appears on a restaurant's MOST RECENT inspection tells us
// their current DOHMH-enforced status -- e.g. if the last thing on record
// is "re-closed," they're currently closed; if it's "re-opened" (or just a
// normal inspection with or without violations), they're open. Anything
// that doesn't exactly match one of these known values falls through to
// "unknown" rather than guessing -- silently assuming "open" for an
// unrecognized value would be the wrong kind of mistake on a public
// health tool.
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
 */
function deriveCurrentStatus(action) {
  if (OPEN_ACTIONS.has(action)) return "open";
  if (CLOSED_ACTIONS.has(action)) return "closed_by_doh";
  return "unknown";
}

export function normalizeBoro(rawBoro) {
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

// Only these fields are ever read anywhere in this script (see
// buildLatestInspectionsGeoJSON/buildInspectionHistory). Passing them as
// a $select clause tells Socrata to drop everything else -- the
// @computed_region_* spatial-join columns, the redundant `location`
// Point object that duplicates latitude/longitude -- before it ever
// leaves their server, shrinking the actual payload downloaded on every
// page rather than filtering it out locally after the fact.
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
 * Groups raw inspection rows by restaurant (CAMIS). Because rows were
 * fetched in camis, inspection_date order, each group's records are
 * already sorted oldest -> newest.
 */
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

/**
 * Groups one restaurant's raw rows into distinct inspection EVENTS --
 * one entry per unique inspection_date, with every violation row from
 * that date rolled up into a single `violations` array. Both
 * buildLatestInspectionsGeoJSON and buildInspectionHistory need this same
 * grouping (one just wants the last entry, the other wants all of them),
 * so it's factored out here rather than duplicated.
 *
 * Returns an array of { id, date, primary, violations }, in chronological
 * order (oldest first) -- relying on the fact that `records` already
 * arrives sorted, per groupByCamis's contract.
 *
 * `id` is a stable `${camis}-${date}` key (date trimmed to YYYY-MM-DD,
 * since inspection_date is always midnight and colons don't belong in a
 * URL path segment). It's the same string every time the pipeline runs,
 * for any inspection that's already happened -- camis never changes, and
 * a past inspection's date doesn't change either -- so it's safe to use
 * for stable selection state now, and for deep links/sharing later if
 * that's ever added.
 */
export function groupRowsByInspectionDate(camis, records) {
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
      id: `${camis}-${date.slice(0, 10)}`,
      date,
      // Restaurant/inspection-level fields (name, address, grade, score,
      // etc.) are SUPPOSED to be identical across every row sharing a
      // date -- but the dataset's own documentation warns of "illogical
      // values" from data entry/transfer errors, so it's possible one
      // sibling row has a null grade/score due to a glitch while another
      // row from the same inspection has the real value. Preferring a
      // row that actually has a score (rather than blindly taking index
      // 0) avoids misclassifying a graded restaurant as "no grade data"
      // just because of which row happened to come first.
      primary: rowsForDate.find((r) => r.score != null) ?? rowsForDate[0],
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
 * Computes groupRowsByInspectionDate ONCE per restaurant, rather than
 * having both buildLatestInspectionsGeoJSON and buildInspectionHistory
 * independently re-derive it for every restaurant. Returns a
 * Map<camis, events[]> that both builders consume directly.
 */
export function buildEventsByRestaurant(grouped) {
  const eventsByRestaurant = new Map();
  for (const [camis, records] of grouped) {
    eventsByRestaurant.set(camis, groupRowsByInspectionDate(camis, records));
  }
  return eventsByRestaurant;
}

/**
 * Builds the most-recent-per-restaurant GeoJSON FeatureCollection.
 *
 * "Most recent" here means the most recent inspection EVENT that
 * actually has a score -- not just whichever event is chronologically
 * last. A restaurant's truly-latest visit might be a non-substantive
 * check (smoke-free compliance, an administrative visit) that produces
 * neither a grade nor a score; in that case we fall back to their last
 * real graded/scored inspection instead of showing stale placeholder
 * data. A restaurant with NO scored inspection anywhere in its history
 * (including one that's never been inspected at all -- see
 * NOT_YET_INSPECTED_DATE) is excluded from this output entirely, rather
 * than appearing as a "no data" placeholder feature.
 *
 * A single inspection can produce several rows (one per violation cited)
 * that share the same camis + inspection_date. Rather than treating one
 * arbitrary row as "the" inspection, groupRowsByInspectionDate groups by
 * inspection_date first and rolls up every violation from that date into
 * a `violations` array on the feature -- so no violation is silently
 * dropped or overwritten.
 */
export function buildLatestInspectionsGeoJSON(eventsByRestaurant, generatedAt) {
  const features = [];

  for (const [camis, events] of eventsByRestaurant) {
    const scoredEvents = events.filter((event) => event.primary.score != null);
    if (scoredEvents.length === 0) continue;

    const latest = scoredEvents[scoredEvents.length - 1];
    const { primary, violations } = latest;

    const lat = parseFloat(primary.latitude);
    const lon = parseFloat(primary.longitude);

    // Skip records with no usable coordinates -- can't place them on the
    // map. Beyond just NaN, also reject anything outside a loose NYC
    // bounding box (e.g. (0, 0), swapped lat/lon) so a garbage value
    // doesn't silently produce a real-looking point in the wrong place.
    if (Number.isNaN(lat) || Number.isNaN(lon) || !isWithinNYC(lat, lon)) continue;

    features.push({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [lon, lat],
      },
      properties: {
        id: latest.id,
        camis,
        name: primary.dba ?? "",
        boro: normalizeBoro(primary.boro),
        building: primary.building ?? "",
        street: primary.street ?? "",
        zipcode: primary.zipcode ?? "",
        phone: primary.phone ?? "",
        cuisine: primary.cuisine_description ?? "",
        // Left as-is rather than defaulting to "N" -- the raw dataset
        // already has an official "N" (Not Yet Graded) grade value, which
        // is a different thing from a genuinely blank/missing grade field
        // on a real inspection ("no grade data available"). Collapsing
        // both into "N" would lose a distinction the reference dashboard
        // itself keeps separate in its KPI panel. Downstream UI should
        // treat grade == null as its own "no grade data" bucket, distinct
        // from grade === "N".
        //
        // Uses || rather than ?? deliberately: Socrata's docs say null
        // fields are omitted from the response (so primary.grade would be
        // undefined), but this also normalizes the edge case of the key
        // being present with an empty string ("grade":"") to null --
        // there's no legitimate real grade value that's falsy, so this is
        // a safe defensive net against that data-quality edge case, not
        // just the documented one.
        grade: primary.grade || null,
        grade_date: primary.grade_date ?? null,
        // Guaranteed non-null here -- every feature that reaches this
        // point came from scoredEvents, which already filtered on
        // score != null above.
        score: Number(primary.score),
        inspection_date: latest.date,
        inspection_type: primary.inspection_type ?? "",
        action: primary.action ?? "",
        violations,
        // Whether DOHMH currently considers this restaurant open, based
        // on the ACTION text of its most recent SCORED inspection -- see
        // deriveCurrentStatus for how "closed" vs "open" vs "unknown" is
        // decided.
        current_status: deriveCurrentStatus(primary.action),
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

/**
 * Builds the per-restaurant inspection history used for the
 * "Score Over Time" chart. Each point now represents one full inspection
 * EVENT -- not just a bare (date, score) pair -- including its grade and
 * rolled-up violations, so clicking a point on the chart can open that
 * specific past inspection's full results (matching the map's popup/detail
 * panel behavior), not just show a number.
 *
 * Returns { generated_at, restaurants }, mirroring the GeoJSON output's
 * generated_at field so both files carry the same freshness metadata.
 */
export function buildInspectionHistory(eventsByRestaurant, generatedAt) {
  const restaurants = {};

  for (const [camis, events] of eventsByRestaurant) {
    const points = events
      .filter((event) => event.primary.score != null) // needs a score to plot
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

/**
 * Runs an async operation over `items` in fixed-size batches, awaiting
 * each batch before starting the next -- rather than firing everything
 * at once via a single Promise.all. Needed because opening tens of
 * thousands of file handles simultaneously exceeds the OS's concurrent
 * open-file limit (hit in practice around ~8,000 on Windows), causing an
 * EMFILE error partway through.
 */
async function runInBatches(items, batchSize, fn) {
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    await Promise.all(batch.map(fn));
  }
}

/**
 * Writes one small JSON file per restaurant (history/{camis}.json)
 * instead of one giant combined file, so a visitor only downloads the
 * one restaurant's history they actually select.
 *
 * Wipes and fully regenerates the directory on every run, rather than
 * only adding/updating files, so a restaurant that drops out of the
 * dataset (closes, gets re-coded, etc) doesn't leave an orphaned file
 * behind forever -- the directory always exactly matches the current
 * run's data, with no separate bookkeeping of "what existed yesterday"
 * that could itself drift out of sync.
 *
 * Writes in batches (see runInBatches) rather than one giant Promise.all
 * across every restaurant, since at ~27,000+ files that would exceed the
 * OS's concurrent open-file limit and fail partway through with EMFILE.
 */
export async function writeHistoryFiles(restaurants) {
  await rm(HISTORY_DIR, { recursive: true, force: true });
  await mkdir(HISTORY_DIR, { recursive: true });

  const HISTORY_WRITE_BATCH_SIZE = 500;
  await runInBatches(Object.entries(restaurants), HISTORY_WRITE_BATCH_SIZE, ([camis, points]) =>
    writeFile(path.join(HISTORY_DIR, `${camis}.json`), JSON.stringify(points), "utf-8")
  );
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
    const eventsByRestaurant = buildEventsByRestaurant(grouped);
    const generatedAt = new Date().toISOString();
    latestGeoJSON = buildLatestInspectionsGeoJSON(eventsByRestaurant, generatedAt);
    history = buildInspectionHistory(eventsByRestaurant, generatedAt);
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
      writeHistoryFiles(history.restaurants),
    ]);
  } catch (err) {
    throw new Error(`Failed while writing output files: ${err.message}`, { cause: err });
  }

  console.log(
    `Wrote ${latestGeoJSON.features.length} restaurants to latest-inspections.geojson`
  );
  console.log(
    `Wrote ${Object.keys(history.restaurants).length} individual history files to ${HISTORY_DIR}`
  );
}

// Only run automatically when this file is executed directly
// (`node fetch-inspections.mjs`), not when its functions are imported by
// something else (e.g. a test file or the demo script) -- otherwise every
// import would also trigger a live network fetch as a side effect.
//
// Uses pathToFileURL rather than a plain `file://${process.argv[1]}`
// string, because process.argv[1] is a raw filesystem path (backslashes
// and a drive letter on Windows, e.g. K:\...\fetch-inspections.mjs) while
// import.meta.url is always a proper file:// URL (forward slashes,
// percent-encoding, e.g. file:///K:/.../fetch-inspections.mjs) -- naively
// concatenating "file://" + the raw path never matches on Windows, which
// silently skips main() entirely with no error at all. pathToFileURL
// converts the path into that same URL format correctly on every OS.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err.message);
    if (err.cause) console.error("Caused by:", err.cause);
    process.exit(1);
  });
}