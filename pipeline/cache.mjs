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

// --- Merging (for reconciling concurrent/overlapping runs) -----------------

// Ranks an entry's "authoritativeness" for merge purposes: a real result
// (verified or unverified) always outranks a pending one, since pending
// means "this run didn't actually finish resolving it." Used to decide
// which side wins when the SAME camis was touched by two different runs.
function isFinal(entry) {
  return entry != null && entry.status !== 'pending';
}

// Merges two cache objects into one, entry-by-entry by CAMIS. Used when a
// run's own local results need to be reconciled against whatever's already
// on the remote (e.g. from an overlapping run, or any other commit that
// landed on main since this run's checkout) — rather than blindly
// overwriting one with the other and risking silently losing real
// geocoding work from either side.
//
// Per-key resolution rules, in order:
//   1. Only one side has this camis at all -> keep that side's entry.
//   2. One side is 'pending' and the other is final (verified/unverified)
//      -> the final result always wins, regardless of which side it's on.
//      A pending entry represents unfinished work and should never
//      overwrite a real result.
//   3. Both sides are final -> prefer whichever has the more recent
//      resolvedAt timestamp (the newer resolution is more likely to
//      reflect the current address/resolver version).
//   4. Both sides are pending -> keep either (arbitrarily `local`) since
//      neither represents finished work; a future run will retry it.
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
      merged[camis] = remoteEntry; // keep remote's real result, discard local's pending
    } else if (localFinal && remoteFinal) {
      const localTime = localEntry.resolvedAt ? Date.parse(localEntry.resolvedAt) : 0;
      const remoteTime = remoteEntry.resolvedAt ? Date.parse(remoteEntry.resolvedAt) : 0;
      merged[camis] = localTime >= remoteTime ? localEntry : remoteEntry;
    } else {
      merged[camis] = localEntry; // both pending, doesn't matter which
    }
  }

  return merged;
}

// Merges two suspicious-shift log arrays, deduping by CAMIS (a restaurant
// only needs to appear once in the log even if flagged by both sides of a
// merge). Local entries win on a duplicate, since they represent this run's
// most recent resolution.
export function mergeSuspiciousShifts(local, remote) {
  const byCamis = new Map();
  for (const entry of remote) byCamis.set(entry.camis, entry);
  for (const entry of local) byCamis.set(entry.camis, entry); // local overwrites on conflict
  return [...byCamis.values()];
}