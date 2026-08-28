// run-geocode-backfill.mjs
//
// PRODUCTION entry point for the geocode backfill, run by the scheduled
// GitHub Action (see .github/workflows/geocode-backfill.yml). Fetches the
// live DOHMH dataset (same source fetch-inspection.mjs uses), builds the
// restaurant list, and runs the shared backfill loop against it.
//
// Intentionally decoupled from fetch-inspection.mjs's own build: this
// script is the ONLY place that makes LocationIQ API calls. The Vercel
// build step (fetch-inspection.mjs) only ever reads the resulting
// committed cache, never writes to it or calls LocationIQ itself.

import dotenv from 'dotenv';
// Loads .env if present (local runs). In GitHub Actions, env vars are
// injected directly by the workflow, so dotenv.config() is a harmless
// no-op there since no .env file exists.
dotenv.config({ path: '../.env' });

import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import {
  fetchAllRows,
  groupByCamis,
  buildEventsByRestaurant,
  buildGeocodeInputList,
  buildLatestInspectionsGeoJSON,
  buildInspectionHistory,
} from './fetch-inspection.mjs';
import { runGeocodeBackfill } from './backfill-core.mjs';
import { loadCache } from './cache.mjs';

const CACHE_PATH = './geocode-cache.json';
const SUSPICIOUS_SHIFT_LOG_PATH = './suspicious-shifts.json';
const COUNTS_SNAPSHOT_PATH = './counts-snapshot.json';
const API_KEY = process.env.LOCATIONIQ_API_KEY;

async function main() {
  if (!API_KEY) {
    console.error('Missing LOCATIONIQ_API_KEY in environment.');
    process.exit(1);
  }

  console.log('Fetching live DOHMH dataset...');
  const rows = await fetchAllRows();

  const grouped = groupByCamis(rows);
  const eventsByRestaurant = buildEventsByRestaurant(grouped);
  const restaurants = buildGeocodeInputList(eventsByRestaurant);

  console.log(`Built geocode input list: ${restaurants.length} restaurants.`);

  const result = await runGeocodeBackfill(restaurants, {
    apiKey: API_KEY,
    cachePath: CACHE_PATH,
    logPath: SUSPICIOUS_SHIFT_LOG_PATH,
  });

  console.log(
    `\nDone. Skipped (already cached): ${result.skippedCount} | Newly resolved: ${result.resolvedCount} | ` +
      `Requests used: ${result.requestsUsed} | Suspicious shifts logged: ${result.suspiciousShiftsLogged} | ` +
      `Cache size: ${result.cacheSize}`
  );

  // Reload the cache runGeocodeBackfill() just wrote. eventsByRestaurant
  // above is still valid to reuse (backfill only resolves coordinates, it
  // doesn't touch inspection rows), but the geocode resolutions
  // themselves need to come from disk to reflect what this run committed.
  console.log('Computing dashboard counts for this run...');
  const updatedCache = await loadCache(CACHE_PATH);
  const latestGeoJSON = buildLatestInspectionsGeoJSON(eventsByRestaurant, new Date().toISOString(), updatedCache);
  const history = buildInspectionHistory(eventsByRestaurant, new Date().toISOString());
  const inspectionCount = Object.values(history.restaurants).reduce(
    (total, points) => total + points.length,
    0,
  );
  const restaurantCount = latestGeoJSON.features.length;

  // Diff against the PREVIOUS daily run's snapshot (seeded from the `data`
  // branch by the workflow before this script runs). Nothing else writes
  // counts-snapshot.json, so this is strictly (this daily refresh) minus
  // (the previous daily refresh); site rebuilds from `main` pushes in
  // between never touch it. null (not 0) when there's no prior run yet.
  const previousSnapshot = await readSnapshotOrNull(COUNTS_SNAPSHOT_PATH);
  const { restaurantDelta, inspectionDelta } = computeCountDeltas(
    { restaurantCount, inspectionCount },
    previousSnapshot,
  );

  const snapshot = {
    generatedAt: new Date().toISOString(),
    restaurantCount,
    inspectionCount,
    restaurantDelta,
    inspectionDelta,
  };
  await writeFile(COUNTS_SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2), 'utf-8');
  console.log(
    `Wrote counts-snapshot.json (${restaurantCount} restaurants [${formatDelta(restaurantDelta)}], ` +
      `${inspectionCount} inspections [${formatDelta(inspectionDelta)}]).`,
  );
}

// Returns null on missing/corrupt/empty file so the first-ever run (or a run
// whose seed step found nothing on `data`) reports null deltas rather than
// crashing or inventing a zero-change day.
export async function readSnapshotOrNull(path) {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf-8'));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

// (this daily refresh) minus (the previous daily refresh). A field is
// null (never 0) when the previous snapshot has no comparable count, so
// the dashboard can tell "no prior run to compare" apart from "genuinely
// no change since yesterday".
export function computeCountDeltas(
  { restaurantCount, inspectionCount },
  previousSnapshot,
) {
  return {
    restaurantDelta:
      previousSnapshot?.restaurantCount != null
        ? restaurantCount - previousSnapshot.restaurantCount
        : null,
    inspectionDelta:
      previousSnapshot?.inspectionCount != null
        ? inspectionCount - previousSnapshot.inspectionCount
        : null,
  };
}

export function formatDelta(delta) {
  if (delta == null) return 'no baseline';
  return delta >= 0 ? `+${delta}` : `${delta}`;
}

// Only run the backfill when invoked directly (node
// run-geocode-backfill.mjs), not when imported by a test; mirrors
// fetch-inspection.mjs.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error('Geocode backfill run failed:', err);
    process.exit(1);
  });
}
