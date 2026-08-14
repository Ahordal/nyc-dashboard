// backfill.mjs
// This script acts as a local test entry point, allowing you to run the geocoding 
// pipeline against a static JSON file of restaurants for manual regression testing.
//
// Usage:
//   node backfill.mjs path/to/restaurants.json

import dotenv from 'dotenv';
dotenv.config({ path: '../.env' }); // Loads environment variables from the repository root
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

  // Reads and parses the static restaurant test file
  const restaurants = JSON.parse(await readFile(inputPath, 'utf-8'));

  // Hands off execution to the shared core backfill loop
  const result = await runGeocodeBackfill(restaurants, {
    apiKey: API_KEY,
    cachePath: CACHE_PATH,
    logPath: SUSPICIOUS_SHIFT_LOG_PATH,
  });

  // Prints out the final performance and metrics summary of the test run
  console.log(
    `\nDone. Skipped (already cached): ${result.skippedCount} | Newly resolved: ${result.resolvedCount} | ` +
      `Requests used: ${result.requestsUsed} | Suspicious shifts logged: ${result.suspiciousShiftsLogged}`
  );
}

main().catch((err) => {
  console.error('Backfill run failed:', err);
  process.exit(1);
});