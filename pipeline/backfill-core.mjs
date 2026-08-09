// backfill-core.mjs
// The actual resolve-everyone loop, extracted so it can be driven by either
// a static test JSON file (backfill.mjs, for local regression testing) or
// the real live DOHMH dataset (run-geocode-backfill.mjs, the production
// entry point used by the scheduled GitHub Action). Both entry points share
// this exact logic — no duplicated loop to keep in sync.

import { readFile, writeFile } from 'node:fs/promises';
import { addressHash } from './normalize.mjs';
import { resolveRestaurant, createQuota } from './resolve.mjs';
import { loadCache, saveCacheAtomic, buildCacheEntry, needsResolution, upsertCacheEntry } from './cache.mjs';

const DEFAULT_DAILY_LIMIT = 4900;
const DEFAULT_SAVE_EVERY_N = 25;
const DEFAULT_SUSPICIOUS_THRESHOLD_METERS = 100;

/**
 * Runs the full resolve loop over a list of restaurants, respecting the
 * daily quota and saving progressively (not just at the end).
 *
 * @param {Array} restaurants - [{ camis, dba, building, street, boro, zip, dohmhLat, dohmhLon }]
 * @param {Object} opts
 * @param {string} opts.apiKey - LocationIQ API key
 * @param {string} opts.cachePath - path to the CAMIS-keyed cache JSON file
 * @param {string} opts.logPath - path to the suspicious-shifts log JSON file
 * @param {number} [opts.dailyLimit]
 * @param {number} [opts.saveEveryN]
 * @param {number} [opts.suspiciousThresholdMeters]
 * @returns {Promise<{ skippedCount, resolvedCount, requestsUsed, suspiciousShiftsLogged, cacheSize }>}
 */
export async function runGeocodeBackfill(restaurants, opts) {
  const {
    apiKey,
    cachePath,
    logPath,
    dailyLimit = DEFAULT_DAILY_LIMIT,
    saveEveryN = DEFAULT_SAVE_EVERY_N,
    suspiciousThresholdMeters = DEFAULT_SUSPICIOUS_THRESHOLD_METERS,
  } = opts;

  let cache = await loadCache(cachePath);
  const quota = createQuota(dailyLimit);

  const suspiciousShifts = [];
  let processedSinceLastSave = 0;
  let skippedCount = 0;
  let resolvedCount = 0;

  console.log(`Loaded ${restaurants.length} restaurants, cache has ${Object.keys(cache).length} entries.`);

  for (const restaurant of restaurants) {
    const dohmh = {
      building: restaurant.building,
      street: restaurant.street,
      boro: restaurant.boro,
      zip: restaurant.zip,
      lat: restaurant.dohmhLat,
      lon: restaurant.dohmhLon,
    };
    const hash = addressHash({
      camis: restaurant.camis,
      building: restaurant.building,
      street: restaurant.street,
      boro: restaurant.boro,
      zip: restaurant.zip,
    });

    if (!needsResolution(cache, restaurant.camis, hash)) {
      skippedCount += 1;
      continue;
    }

    if (quota.remaining() <= 0) {
      console.log(`Daily quota reached (${quota.used()} requests). Stopping — remainder picks up next run.`);
      break;
    }

    // Restaurants with no usable DOHMH coordinate at all (NaN/missing) can
    // still be geocoded — scoreCandidate() treats a null dohmhLat/dohmhLon
    // as "skip the distance check" rather than failing, so this is safe.
    const resolution = await resolveRestaurant(restaurant, { apiKey, quota });
    const entry = buildCacheEntry({ camis: restaurant.camis, dohmh, addressHash: hash, resolution });
    cache = upsertCacheEntry(cache, entry);

    if (resolution.status === 'verified') {
      resolvedCount += 1;
      if (
        resolution.distanceFromDohmh != null &&
        resolution.distanceFromDohmh > suspiciousThresholdMeters
      ) {
        suspiciousShifts.push({
          camis: restaurant.camis,
          dba: restaurant.dba,
          address: `${restaurant.building} ${restaurant.street}, ${restaurant.boro} ${restaurant.zip}`,
          dohmhLat: restaurant.dohmhLat,
          dohmhLon: restaurant.dohmhLon,
          resolvedLat: resolution.lat,
          resolvedLon: resolution.lon,
          distanceMeters: resolution.distanceFromDohmh,
          matchType: resolution.matchType,
          resolvedVia: resolution.resolvedVia,
        });
      }
    }

    processedSinceLastSave += 1;
    if (processedSinceLastSave >= saveEveryN) {
      await saveCacheAtomic(cachePath, cache);
      console.log(`  ...progress saved (${quota.used()} requests used so far)`);
      processedSinceLastSave = 0;
    }
  }

  await saveCacheAtomic(cachePath, cache);

  if (suspiciousShifts.length > 0) {
    let existing = [];
    try {
      existing = JSON.parse(await readFile(logPath, 'utf-8'));
    } catch {
      // no existing log yet
    }
    await writeFile(logPath, JSON.stringify([...existing, ...suspiciousShifts], null, 2), 'utf-8');
  }

  return {
    skippedCount,
    resolvedCount,
    requestsUsed: quota.used(),
    suspiciousShiftsLogged: suspiciousShifts.length,
    cacheSize: Object.keys(cache).length,
  };
}
