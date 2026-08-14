// backfill-core.mjs
// This file runs the main geocoding loop across a list of restaurants. It checks 
// the cache to avoid unnecessary work, tracks daily API quotas, saves progress 
// incrementally, and flags any unusual coordinate jumps for review.

import { readFile, writeFile } from 'node:fs/promises';
import { addressHash } from './normalize.mjs';
import { resolveRestaurant, createQuota } from './resolve.mjs';
import { loadCache, saveCacheAtomic, buildCacheEntry, needsResolution, upsertCacheEntry } from './cache.mjs';

const DEFAULT_DAILY_LIMIT = 4900;
const DEFAULT_SAVE_EVERY_N = 25;
const DEFAULT_SUSPICIOUS_THRESHOLD_METERS = 100;

/**
 * Loops through a list of restaurants to geocode their locations, managing API quotas 
 * and saving progress along the way.
 * 
 * @param {Array} restaurants - List of restaurant objects to process
 * @param {Object} opts - Configuration options like API keys, paths, and limits
 * @returns {Promise<{ skippedCount, resolvedCount, requestsUsed, suspiciousShiftsLogged, cacheSize }>} Summary metrics of the run
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

    // Skip this restaurant if its data is already safely cached and hasn't changed.
    if (!needsResolution(cache, restaurant.camis, hash)) {
      skippedCount += 1;
      continue;
    }

    // Stop processing if we've hit our daily request limit.
    if (quota.remaining() <= 0) {
      console.log(`Daily quota reached (${quota.used()} requests). Stopping — remainder picks up next run.`);
      break;
    }

    // Look up the restaurant's location using the external geocoding API.
    const resolution = await resolveRestaurant(restaurant, { apiKey, quota });
    const entry = buildCacheEntry({ camis: restaurant.camis, dohmh, addressHash: hash, resolution });
    cache = upsertCacheEntry(cache, entry);

    // If the match is verified, check if it moved unusually far from the official health department coordinates.
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

    // Stop immediately if we get rate-limited so we don't waste the rest of the run on guaranteed errors.
    if (resolution.rateLimited) {
      console.log('LocationIQ rate limit hit — stopping this run early. Remainder picks up next run.');
      await saveCacheAtomic(cachePath, cache);
      break;
    }
  }

  // Save the final state of the cache to disk.
  await saveCacheAtomic(cachePath, cache);

  // Append any flagged coordinate shifts to the log file for review.
  if (suspiciousShifts.length > 0) {
    let existing = [];
    try {
      existing = JSON.parse(await readFile(logPath, 'utf-8'));
    } catch {
      // Ignore if the log file doesn't exist yet
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