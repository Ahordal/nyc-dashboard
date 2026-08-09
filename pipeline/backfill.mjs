// backfill.mjs
// LOCAL TEST entry point — runs the geocode backfill loop against a static
// JSON file of restaurants (e.g. real-test-restaurants.json), for manual
// regression testing. The actual production entry point that runs against
// live DOHMH data is run-geocode-backfill.mjs.
//
// Usage:
//   node backfill.mjs path/to/restaurants.json

import dotenv from 'dotenv';
dotenv.config({ path: '../.env' }); // .env lives at the repo root, not in pipeline/
import { readFile } from 'node:fs/promises';
import { runGeocodeBackfill } from './backfill-core.mjs';

const CACHE_PATH = './geocode-cache.json';
const SUSPICIOUS_SHIFT_LOG_PATH = './suspicious-shifts.json';
const API_KEY = process.env.LOCATIONIQ_API_KEY;

async function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error('Usage: node backfill.mjs path/to/restaurants.json');
    process.exit(1);
  }
  if (!API_KEY) {
    console.error('Missing LOCATIONIQ_API_KEY in .env');
    process.exit(1);
  }

  const restaurants = JSON.parse(await readFile(inputPath, 'utf-8'));

  const result = await runGeocodeBackfill(restaurants, {
    apiKey: API_KEY,
    cachePath: CACHE_PATH,
    logPath: SUSPICIOUS_SHIFT_LOG_PATH,
  });

  console.log(
    `\nDone. Skipped (already cached): ${result.skippedCount} | Newly resolved: ${result.resolvedCount} | ` +
      `Requests used: ${result.requestsUsed} | Suspicious shifts logged: ${result.suspiciousShiftsLogged}`
  );
}

main().catch((err) => {
  console.error('Backfill run failed:', err);
  process.exit(1);
});
