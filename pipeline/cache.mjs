// cache.mjs
// CAMIS-keyed cache for geocoding results. Handles atomic writes (temp file
// + rename, so a crash mid-write can't corrupt the cache), address-hash-based
// invalidation (so an address change forces re-resolution even if the CAMIS
// was already cached), and resolver versioning (so improving the matching
// logic later can deliberately invalidate old results).

import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

// Bump this whenever scoring.mjs / normalize.mjs matching logic changes in a
// way that should force re-resolution of previously-cached entries.
export const RESOLVER_VERSION = 1;

// --- Loading ---------------------------------------------------------------

// Loads the cache file. Returns an empty cache if the file doesn't exist yet,
// or if it's corrupted (e.g. a previous crash left a partial write) — a
// corrupted cache should never crash the pipeline, just mean more re-resolving.
export async function loadCache(filePath) {
  try {
    const raw = await readFile(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return {}; // no cache yet — first run
    }
    console.warn(`Cache at ${filePath} could not be read (${err.message}) — starting fresh.`);
    return {};
  }
}

// --- Saving (atomic) ---------------------------------------------------------

// Writes the cache atomically: write to a temp file, then rename over the
// real path. Rename is atomic on POSIX and NTFS, so a crash mid-write leaves
// either the old cache intact or the new one complete — never a half-written
// JSON file.
export async function saveCacheAtomic(filePath, cache) {
  await mkdir(dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(tempPath, JSON.stringify(cache, null, 2), 'utf-8');
  await rename(tempPath, filePath);
}

// --- Cache entry construction ------------------------------------------------

// Builds a cache entry from a resolveRestaurant() result. `dohmh` is the
// restaurant's original DOHMH data — always preserved untouched.
export function buildCacheEntry({ camis, dohmh, addressHash, resolution }) {
  return {
    camis,
    dohmh, // { building, street, boro, zip, lat, lon } — never modified after write
    resolved:
      resolution.status === 'verified'
        ? { lat: resolution.lat, lon: resolution.lon, neighbourhood: resolution.neighbourhood }
        : null,
    status: resolution.status, // 'verified' | 'unverified' | 'pending'
    matchType: resolution.matchType,
    resolvedVia: resolution.resolvedVia,
    distanceFromDohmh: resolution.distanceFromDohmh ?? null,
    reason: resolution.reason || null, // e.g. 'no_acceptable_match', 'api_error', 'quota_exhausted'
    resolvedAt: resolution.status === 'pending' ? null : new Date().toISOString(),
    addressHash,
    resolverVersion: RESOLVER_VERSION,
  };
}

// --- Invalidation logic -------------------------------------------------------

// Decides whether a restaurant needs (re-)resolution. True if:
//   - never resolved (no cache entry)
//   - previously pending (errors/timeouts/quota cutoffs are always retried)
//   - the address has changed since the cached result (hash mismatch)
//   - the matching logic has since changed (resolver version mismatch)
export function needsResolution(cache, camis, currentAddressHash) {
  const entry = cache[camis];
  if (!entry) return true;
  if (entry.status === 'pending') return true;
  if (entry.addressHash !== currentAddressHash) return true;
  if (entry.resolverVersion !== RESOLVER_VERSION) return true;
  return false; // verified or unverified, address unchanged, current resolver version
}

// Inserts/overwrites one entry. Returns a NEW cache object (does not mutate
// the input) so callers can reason about state changes explicitly.
export function upsertCacheEntry(cache, entry) {
  return { ...cache, [entry.camis]: entry };
}
