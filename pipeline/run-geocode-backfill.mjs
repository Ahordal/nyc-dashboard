// run-geocode-backfill.mjs
// PRODUCTION entry point for the geocode backfill, run by the scheduled
// GitHub Action (see .github/workflows/geocode-backfill.yml). Fetches the
// live DOHMH dataset (same source fetch-inspection.mjs uses), builds the
// restaurant list, and runs the shared backfill loop against it.
//
// This is intentionally decoupled from fetch-inspection.mjs's own build --
// this script is the ONLY place that makes LocationIQ API calls. The
// Vercel build step (fetch-inspection.mjs) only ever reads the resulting
// committed cache, never writes to it or calls LocationIQ itself.
//
// Usage:
//   node run-geocode-backfill.mjs
//
// Requires LOCATIONIQ_API_KEY in the environment (from .env locally, or
// from GitHub Actions secrets in CI). Optionally SOCRATA_APP_TOKEN, same
// as fetch-inspection.mjs, to raise Socrata's rate limits.

import dotenv from 'dotenv';
// Loads .env if present (local runs). In GitHub Actions, env vars are
// injected directly by the workflow -- dotenv.config() is a harmless no-op
// there since no .env file exists in that environment.
dotenv.config({ path: '../.env' });

import { fetchAllRows, groupByCamis, buildEventsByRestaurant, buildGeocodeInputList } from './fetch-inspection.mjs';
import { runGeocodeBackfill } from './backfill-core.mjs';

const CACHE_PATH = './geocode-cache.json';
const SUSPICIOUS_SHIFT_LOG_PATH = './suspicious-shifts.json';
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
}

main().catch((err) => {
  console.error('Geocode backfill run failed:', err);
  process.exit(1);
});
