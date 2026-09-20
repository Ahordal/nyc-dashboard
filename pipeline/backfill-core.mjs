// backfill-core.mjs
//
// Runs the main geocoding loop over a list of restaurants: checks the
// cache to skip unnecessary work, tracks the daily API quota, saves
// progress incrementally, and flags unusual coordinate jumps for review.

import { addressHash } from './normalize.mjs';
import { resolveRestaurant, createQuota } from './resolve.mjs';
import {
  loadCache,
  saveCacheAtomic,
  buildCacheEntry,
  needsResolution,
  upsertCacheEntry,
  readJsonTolerant,
} from './cache.mjs';

const DEFAULT_DAILY_LIMIT = 4900;
const DEFAULT_SAVE_EVERY_N = 25;
const DEFAULT_SUSPICIOUS_THRESHOLD_METERS = 100;

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

    // Skip this restaurant if its data is already safely cached and hasn't changed.
    if (!needsResolution(cache, restaurant.camis, hash)) {
      skippedCount += 1;
      continue;
    }

    // Stop processing if we've hit our daily request limit.
    if (quota.remaining() <= 0) {
      console.log(`Daily quota reached (${quota.used()} requests). Stopping; remainder picks up next run.`);
      break;
    }

    // Look up the restaurant's location using the external geocoding API.
    const resolution = await resolveRestaurant(restaurant, { apiKey, quota });
    const entry = buildCacheEntry({ camis: restaurant.camis, dohmh, addressHash: hash, resolution });
    cache = upsertCacheEntry(cache, entry);

    // Flag for review: moved unusually far from DOHMH's coordinate, OR
    // only shakily confirmed (borough + ZIP bonuses both missed) -
    // otherwise indistinguishable from a fully-confirmed match once cached.
    if (resolution.status === 'verified') {
      resolvedCount += 1;

      const flagReasons = [];
      if (resolution.distanceFromDohmh != null && resolution.distanceFromDohmh > suspiciousThresholdMeters) {
        flagReasons.push('distance_shift');
      }
      if (resolution.reasons?.includes('borough_unconfirmed') && resolution.reasons?.includes('zip_unconfirmed')) {
        flagReasons.push('low_confidence_match');
      }

      if (flagReasons.length > 0) {
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
          score: resolution.score,
          reasons: resolution.reasons,
          flagReasons,
        });
      }
    }

    processedSinceLastSave += 1;
    if (processedSinceLastSave >= saveEveryN) {
      await saveCacheAtomic(cachePath, cache);
      console.log(`  ...progress saved (${quota.used()} requests used so far)`);
      processedSinceLastSave = 0;
    }

    // Stop immediately if we get rate-limited so we don't waste the rest of the run on guaranteed errors.
    if (resolution.rateLimited) {
      console.log('LocationIQ rate limit hit; stopping this run early. Remainder picks up next run.');
      await saveCacheAtomic(cachePath, cache);
      break;
    }
  }

  // Save the final state of the cache to disk.
  await saveCacheAtomic(cachePath, cache);

  // Append any flagged coordinate shifts to the log file for review.
  if (suspiciousShifts.length > 0) {
    const existing = await readJsonTolerant(logPath, []);
    await saveCacheAtomic(logPath, [...existing, ...suspiciousShifts]);
  }

  return {
    skippedCount,
    resolvedCount,
    requestsUsed: quota.used(),
    suspiciousShiftsLogged: suspiciousShifts.length,
    cacheSize: Object.keys(cache).length,
  };
}