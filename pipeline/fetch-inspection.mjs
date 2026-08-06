// fetch-inspections.mjs
//
// Fetches the full NYC DOHMH Restaurant Inspection Results dataset from the
// Socrata (SODA) API, then produces three output files:
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
//      "06B") to its full description text. There are only ~115 distinct
//      codes across the whole dataset, but tens of thousands of
//      inspection events cite them -- embedding the full description on
//      every single violation entry in the two files above means the
//      same ~115 strings get duplicated thousands of times over. Instead,
//      violations in both other output files carry only `code` and
//      `critical_flag`; consumers look up the description here by code.
//      Cuts the combined output size roughly in half.
//
// public/data/ is regenerated from scratch on every run and is NOT meant
// to be committed to Git -- see the project README for how this fits into
// the Vercel build step vs. the scheduled GitHub Action that pings a
// Vercel Deploy Hook to keep data fresh without any code changes.

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
// Strips diacritics (á -> a, é -> e, ñ -> n, etc.) 
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
 * one searchable field. This is where several categories of search
 * discrepancy get resolved ONCE at build time rather than via live query
 * variants:
 *
 *   - Apostrophe omissions ("mcdonalds" / "McDonald's") -- apostrophes
 *     stripped from both sides before matching
 *   - Casing anomalies -- everything uppercased
 *   - Conjunction variations (& vs AND) -- & expanded to AND as an extra
 *     token, original & also preserved via the raw join below
 *   - Corporate suffixes (INC/LLC/CORP) -- dropped as noise
 *   - Street/word abbreviations (St/Saint, Ave/Avenue, Bldg/Building,
 *     Int'l/International, etc.) -- both forms indexed via
 *     ABBREVIATION_EXPANSIONS
 *   - Leading "THE " -- NOT stripped from name itself (needed to
 *     preserve the restaurant's real name for display), but a
 *     "THE "-stripped variant of the name is ALSO added as an extra
 *     token so "Bitter End" matches "The Bitter End"
 *   - Parenthetical location/sub-venue tags (e.g. "The Pecking Order
 *     (The Bronx Zoo)") -- parenthetical content extracted and indexed
 *     as its own additional tokens, so searching "Bronx Zoo" surfaces
 *     this record even though it's not part of the primary name
 *   - Slash-joined multi-concept spaces ("2A / Berlin / Old Flings") --
 *     each segment split out and indexed separately, so searching
 *     "Berlin" alone matches
 
 */
export function buildSearchIndex({ name, cuisine, street, building }) {
  const tokenSets = [];

  if (name) {
    // Parenthetical content (e.g. "(The Bronx Zoo)") extracted and
    // indexed separately from the main name.
    const parenMatches = [...name.matchAll(/\(([^)]+)\)/g)].map((m) => m[1]);
    const nameWithoutParens = name.replace(/\([^)]*\)/g, " ");

    // Slash-joined multi-concept names ("2A / Berlin / Old Flings") --
    // split into individual segments, each indexed on its own.
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

    // "THE "-stripped variant, so "Bitter End" matches "The Bitter End"
    // -- only adds the stripped tokens if the name actually starts with
    // "The ", rather than unconditionally re-tokenizing.
    if (/^THE\s+/i.test(name.trim())) {
      tokenSets.push(
        ...normalizeToTokens(name.trim().replace(/^THE\s+/i, "")),
      );
    }
  }

  for (const field of [cuisine, street, building]) {
    tokenSets.push(...normalizeToTokens(field));
  }

  // Dedupe while preserving a stable order, then join into one
  // space-separated string -- this is what gets stored on the feature
  // and matched against with a single LIKE '%QUERY%' at query time.
  return [...new Set(tokenSets)].join(" ");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetches a URL with retry and exponential backoff.
 * Retries transient network failures and retryable HTTP responses,
 * throwing immediately on non-retryable errors.
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

// Request only the fields this pipeline actually uses. Using Socrata's
// $select clause trims unused columns (such as @computed_region_* and
// the redundant `location` object) server-side, reducing the amount of
// data downloaded on each request.
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
 *
 * Pagination ends when Socrata returns fewer than PAGE_SIZE rows. Results
 * are requested in camis, inspection_date order, so each restaurant's
 * records arrive chronologically. Because the dataset contains one row per
 * violation, multiple rows may legitimately share the same restaurant and
 * inspection date.
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
 * Builds the code-to-description lookup written to
 * violation-codes.json.
 *
 * The first description encountered for each violation code is retained.
 * In practice, violation descriptions are consistent across the dataset,
 * so each code maps to a single description.
 */
export function buildViolationCodeLookup(rows) {
  const lookup = {};
  for (const row of rows) {
    if (row.violation_code && !(row.violation_code in lookup)) {
      lookup[row.violation_code] = row.violation_description ?? "";
    }
  }
  return lookup;
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
 * Groups one restaurant's raw inspection rows into inspection events.
 *
 * Each event represents a unique inspection date, combining all
 * violation rows from that inspection into a single `violations` array.
 * Returns the events in chronological order (oldest first).
 *
 * This grouping is shared by both buildLatestInspectionsGeoJSON() and
 * buildInspectionHistory() to avoid duplicating the same logic.
 */
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
      // Stable inspection identifier used throughout the application.
      // CAMIS never changes, and past inspection dates are immutable, so this
      // remains consistent across pipeline runs and is suitable for selection
      // state and future deep-linking.
      id: `${camis}-${date.slice(0, 10)}`,
      date,

      // Fields such as name, address, grade, and score should be identical
      // across every row for a given inspection. However, the dataset's
      // documentation warns of occasional data-quality issues. Prefer a row
      // that actually has a score rather than blindly taking the first one.
      // This avoids treating a graded inspection as "no grade data" simply
      // because the first sibling row happened to contain a null score.
      primary: rowsForDate.find((r) => r.score != null) ?? rowsForDate[0],

      // No `description` field here -- the same ~115 violation codes repeat
      // across tens of thousands of events, so the full text lives once in
      // violation-codes.json instead of being duplicated on every violation.
      // Consumers look up the description by code.
      violations: rowsForDate
        .filter((r) => r.violation_code)
        .map((r) => ({
          code: r.violation_code,
          critical_flag: r.critical_flag ?? "",
        })),
    });
  }

  // Map iteration preserves insertion order, which currently reflects the
  // pre-sorted input. Sort explicitly by date anyway so this helper doesn't
  // silently depend on fetchAllRows() continuing to return ordered records.
  events.sort((a, b) => (a.date > b.date ? 1 : a.date < b.date ? -1 : 0));

  return events;
}

/**
 * Precomputes each restaurant's grouped inspection events so both
 * buildLatestInspectionsGeoJSON() and buildInspectionHistory() can reuse
 * the same result instead of deriving it independently.
 *
 * Returns a Map<camis, events[]>.
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
 * "Most recent" means the most recent inspection event with a score, not
 * simply the chronologically latest event. Administrative visits and
 * other non-substantive inspections may not produce a grade or score, so
 * the most recent scored inspection is used instead.
 *
 * Restaurants with no scored inspection anywhere in their history
 * (including those represented only by NOT_YET_INSPECTED_DATE) are
 * omitted from the output rather than emitted as placeholder features.
 *
 * Because the dataset contains one row per violation, each inspection is
 * first grouped by inspection_date so all violations from that inspection
 * are rolled into a single `violations` array on the resulting feature.
 */
export function buildLatestInspectionsGeoJSON(eventsByRestaurant, generatedAt) {
  const features = [];

  for (const [camis, events] of eventsByRestaurant) {
    // A placeholder-dated (1900) event should never count as a real
    // inspection, even if a data glitch left a non-null score on that row.
    // `score != null` alone isn't sufficient evidence that an inspection
    // actually occurred.
    const scoredEvents = events.filter(
      (event) =>
        event.primary.score != null && event.date !== NOT_YET_INSPECTED_DATE,
    );
    if (scoredEvents.length === 0) continue;

    const latest = scoredEvents[scoredEvents.length - 1];
    const { primary, violations } = latest;

    const lat = parseFloat(primary.latitude);
    const lon = parseFloat(primary.longitude);

    // Skip records with unusable coordinates -- they can't be placed on the
    // map. Beyond rejecting NaN values, also reject anything outside a loose
    // NYC bounding box (e.g. (0, 0) or swapped latitude/longitude) so bad
    // data doesn't silently produce plausible-looking points in the wrong
    // place.
    if (Number.isNaN(lat) || Number.isNaN(lon) || !isWithinNYC(lat, lon))
      continue;

    const status = deriveCurrentStatus(primary.action);

    // Rounded coordinates to 6 decimal places (~11 cm precision)
    const roundedLat = Math.round(lat * 1e6) / 1e6;
    const roundedLon = Math.round(lon * 1e6) / 1e6;

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
        // Precomputed, normalized search field -- see buildSearchIndex()
        // for the full list of what this resolves (apostrophes, casing,
        // &/AND, corporate suffixes, street abbreviations, parenthetical
        // sub-venue tags, slash-joined multi-concept names, leading
        // "THE "). Search should query this field with a single
        // UPPER(search_index) LIKE '%QUERY%' rather than separately
        // matching name/cuisine/street/building.
        search_index: buildSearchIndex({
          name: primary.dba ?? "",
          cuisine: primary.cuisine_description ?? "",
          street: primary.street ?? "",
          building: primary.building ?? "",
        }),
        boro: normalizeBoro(primary.boro),
        building: primary.building ?? "",
        street: primary.street ?? "",
        zipcode: primary.zipcode ?? "",
        phone: primary.phone ?? "",
        cuisine: primary.cuisine_description ?? "",
        // Leave missing grades as null rather than defaulting to "N". The raw
        // dataset already uses "N" (Not Yet Graded) as an official grade, which
        // is distinct from a genuinely missing grade on an inspection.
        // Downstream UI should treat grade == null as its own "no grade data"
        // state rather than collapsing it into "N".

        // Use || rather than ?? deliberately. Socrata documents that null fields
        // are omitted from the response (yielding undefined), but || also
        // normalizes the defensive edge case of an empty string ("grade": "") to
        // null. Since no valid grade is falsy, this is a safe normalization.

        grade: primary.grade || null,
        grade_date: primary.grade_date ?? null,
        // Guaranteed non-null here. Every feature reaching this point came from
        // scoredEvents, which already filtered on score != null.
        score: Number(primary.score),
        inspection_date: latest.date,
        inspection_type: primary.inspection_type ?? "",
        action: primary.action ?? "",
        // JSON-stringified rather than stored as a raw array. ArcGIS's
        // GeoJSONLayer doesn't support Object/Array attribute values, so a plain
        // array wouldn't load as a usable feature attribute. Consumers should
        // JSON.parse() this back into an array when rendering.
        violations: JSON.stringify(violations),
        // Whether DOHMH currently considers the restaurant open, based on the
        // ACTION text of its most recent scored inspection (see
        // deriveCurrentStatus()).
        //
        // Consumers should match on current_status_code, not
        // current_status_label. The label is display text and may change without
        // affecting the underlying status.
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

/**
 * Builds the per-restaurant inspection history used by the
 * "Score Over Time" chart.
 *
 * Each history entry represents a complete inspection event rather than
 * just a (date, score) pair. Along with the score, it includes the
 * inspection's grade and rolled-up violations so selecting a point on
 * the chart can display that inspection's full details.
 *
 * Returns { generated_at, restaurants }, mirroring the GeoJSON output so
 * both files carry the same freshness metadata.
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
 * each batch before starting the next rather than launching every
 * operation in a single Promise.all().
 *
 * This avoids exceeding the operating system's concurrent open-file
 * limit when writing thousands of files, which would otherwise result
 * in an EMFILE error.
 */
async function runInBatches(items, batchSize, fn) {
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    await Promise.all(batch.map(fn));
  }
}

/**
 * Writes one small JSON file per restaurant (history/{camis}.json)
 * instead of one large combined file, so visitors only download the
 * history for the restaurant they actually select.
 *
 * The output directory is wiped and regenerated on every run rather than
 * incrementally updated. This ensures restaurants that disappear from
 * the dataset (closures, CAMIS changes, etc.) don't leave orphaned files
 * behind, and keeps the directory exactly in sync with the current
 * dataset.
 *
 * Files are written in batches (see runInBatches()) rather than one
 * large Promise.all() to avoid exceeding the operating system's
 * concurrent open-file limit (EMFILE).
 */
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

  let latestGeoJSON, history, violationCodes;
  try {
    const grouped = groupByCamis(rows);
    const eventsByRestaurant = buildEventsByRestaurant(grouped);
    const generatedAt = new Date().toISOString();
    latestGeoJSON = buildLatestInspectionsGeoJSON(
      eventsByRestaurant,
      generatedAt,
    );
    history = buildInspectionHistory(eventsByRestaurant, generatedAt);
    // Built directly from the raw rows rather than the grouped events, since
    // every violation code needs to be captured once regardless of which
    // restaurants or inspections survive the scored/coordinate filtering.
    violationCodes = buildViolationCodeLookup(rows);
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
}

// Only run automatically when this file is executed directly
// (`node fetch-inspections.mjs`), not when its functions are imported.
// This avoids triggering a live network fetch as an import side effect.

// Use pathToFileURL() because process.argv[1] is a filesystem path,
// whereas import.meta.url is a file:// URL. pathToFileURL() converts the
// path into the same URL format so the comparison works correctly across
// operating systems, including Windows.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err.message);
    if (err.cause) console.error("Caused by:", err.cause);
    process.exit(1);
  });
}
