// cache.mjs
//
// Local cache for restaurant geocoding results, keyed by CAMIS ID.
// Handles safe loading, atomic writes (no corruption on a crash),
// automatic invalidation when a restaurant's address or the matching
// rules change, and merging of overlapping runs.

import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

// Bumping this version forces a re-geocode of everything if the address
// matching rules change in future.
export const RESOLVER_VERSION = 1;

// Loading

/**
 * Loads the existing cache file from disk. If the file is missing or corrupted 
 * from a previous crash, it safely ignores the error and returns an empty object 
 * so the app can keep running without breaking.
 * 
 * @param {string} filePath - Path to the cache JSON file
 * @returns {Promise<Object>} The loaded cache dictionary
 */
export async function loadCache(filePath) {
  try {
    const raw = await readFile(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return {}; // Returns empty cache on the very first run
    }
    console.warn(`Cache at ${filePath} could not be read (${err.message}); starting fresh.`);
    return {};
  }
}

// Saving (atomic)

/**
 * Saves the cache safely by writing it to a temporary file first, then instantly 
 * renaming it over the real file. This prevents a half-written file if the script 
 * crashes midway.
 * 
 * @param {string} filePath - Destination path for the cache
 * @param {Object} cache - The current cache object to save
 */
export async function saveCacheAtomic(filePath, cache) {
  await mkdir(dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(tempPath, JSON.stringify(cache, null, 2), 'utf-8');
  await rename(tempPath, filePath);
}

// Cache entry construction

/**
 * Creates a standardized cache record from a restaurant's geocoding result, 
 * keeping the original official data untouched.
 * 
 * @param {Object} params - Entry details (camis, dohmh, addressHash, resolution)
 * @returns {Object} A structured cache record
 */
export function buildCacheEntry({ camis, dohmh, addressHash, resolution }) {
  return {
    camis,
    dohmh, // Original official health department data, never modified
    resolved:
      resolution.status === 'verified'
        ? { lat: resolution.lat, lon: resolution.lon, neighbourhood: resolution.neighbourhood }
        : null,
    status: resolution.status, // Current status: 'verified', 'unverified', or 'pending'
    matchType: resolution.matchType,
    resolvedVia: resolution.resolvedVia,
    distanceFromDohmh: resolution.distanceFromDohmh ?? null,
    reason: resolution.reason || null,
    resolvedAt: resolution.status === 'pending' ? null : new Date().toISOString(),
    addressHash,
    resolverVersion: RESOLVER_VERSION,
  };
}

// Invalidation logic

/**
 * Checks whether a restaurant needs to be geocoded again. It returns true if 
 * it's new, previously failed/pending, has a different address, or if the global 
 * resolver version has been bumped.
 * 
 * @param {Object} cache - The current cache dictionary
 * @param {string} camis - The restaurant's ID
 * @param {string} currentAddressHash - The newly computed address hash
 * @returns {boolean} True if a fresh geocode lookup is needed
 */
export function needsResolution(cache, camis, currentAddressHash) {
  const entry = cache[camis];
  if (!entry) return true;
  if (entry.status === 'pending') return true;
  if (entry.addressHash !== currentAddressHash) return true;
  if (entry.resolverVersion !== RESOLVER_VERSION) return true;
  return false;
}

/**
 * Adds or updates a single restaurant entry, returning a brand new cache object 
 * instead of modifying the old one directly.
 * 
 * @param {Object} cache - Existing cache object
 * @param {Object} entry - The cache entry to insert or update
 * @returns {Object} A new updated cache object
 */
export function upsertCacheEntry(cache, entry) {
  return { ...cache, [entry.camis]: entry };
}

// Merging (reconciling concurrent/overlapping runs)

/**
 * Helper function to check if a cache entry is finished and final (not pending).
 * 
 * @param {Object} entry - Cache entry to check
 * @returns {boolean} True if the status is final
 */
function isFinal(entry) {
  return entry != null && entry.status !== 'pending';
}

/**
 * Combines two cache objects together entry-by-entry. Finished results always beat 
 * pending ones, and newer timestamps win if both are finished, ensuring no good 
 * geocoding work is accidentally lost.
 * 
 * @param {Object} local - Local cache dataset
 * @param {Object} remote - Remote cache dataset
 * @returns {Object} The merged cache dictionary
 */
export function mergeCaches(local, remote) {
  const merged = { ...remote };

  for (const [camis, localEntry] of Object.entries(local)) {
    const remoteEntry = remote[camis];

    if (!remoteEntry) {
      merged[camis] = localEntry;
      continue;
    }

    const localFinal = isFinal(localEntry);
    const remoteFinal = isFinal(remoteEntry);

    if (localFinal && !remoteFinal) {
      merged[camis] = localEntry;
    } else if (!localFinal && remoteFinal) {
      merged[camis] = remoteEntry;
    } else if (localFinal && remoteFinal) {
      const localTime = localEntry.resolvedAt ? Date.parse(localEntry.resolvedAt) : 0;
      const remoteTime = remoteEntry.resolvedAt ? Date.parse(remoteEntry.resolvedAt) : 0;
      merged[camis] = localTime >= remoteTime ? localEntry : remoteEntry;
    } else {
      merged[camis] = localEntry;
    }
  }

  return merged;
}

/**
 * Combines two suspicious coordinate shift logs into one, removing duplicates 
 * by CAMIS ID and letting local entries take priority.
 * 
 * @param {Array} local - Local shift logs
 * @param {Array} remote - Remote shift logs
 * @returns {Array} Cleaned, combined array of shift logs
 */
export function mergeSuspiciousShifts(local, remote) {
  const byCamis = new Map();
  for (const entry of remote) byCamis.set(entry.camis, entry);
  for (const entry of local) byCamis.set(entry.camis, entry);
  return [...byCamis.values()];
}