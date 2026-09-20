// cache.mjs
//
// Local cache for restaurant geocoding results, keyed by CAMIS ID.
// Handles safe loading, atomic writes (no corruption on a crash),
// automatic invalidation when a restaurant's address or the matching
// rules change, and merging of overlapping runs.

import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { isWithinNYC } from '../shared/nycBounds.mjs';

// Bumping this version forces a re-geocode of everything if the address
// matching rules change in future.
export const RESOLVER_VERSION = 1;

// Loading

// ENOENT falls back silently (first run); anything else is logged first -
// a silent swallow here once caused a real data-loss incident.
export async function readJsonTolerant(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, 'utf-8'));
  } catch (err) {
    if (err.code === 'ENOENT') return fallback;
    console.warn(`${filePath} could not be read (${err.message}); using fallback.`);
    return fallback;
  }
}

export async function loadCache(filePath) {
  return readJsonTolerant(filePath, {});
}

// Saving (atomic)

// Write-then-rename so a crash mid-save can't leave a half-written cache.
export async function saveCacheAtomic(filePath, cache) {
  await mkdir(dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(tempPath, JSON.stringify(cache, null, 2), 'utf-8');
  await rename(tempPath, filePath);
}

// Cache entry construction

// Normalizes a resolution result into the cache's stored shape.
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
    error: resolution.error || null, // raw error text, for diagnosing a bad api_error batch
    score: resolution.score ?? null, // flags a shakily-confirmed match vs a solid one
    reasons: resolution.reasons || null, // e.g. ['borough_unconfirmed', 'zip_unconfirmed']
    resolvedAt: resolution.status === 'pending' ? null : new Date().toISOString(),
    addressHash,
    resolverVersion: RESOLVER_VERSION,
  };
}

// Invalidation logic

// True if this restaurant needs a fresh geocode: new, pending, address
// changed, resolver version bumped, or a verified entry now falls outside
// NYC bounds (catches a future scoring regression automatically).
//
// One `||` expression, not early returns, so order can't matter -
// reset-out-of-bounds-cache-entries.mjs relies on flipping just one field
// to force a re-geocode.
export function needsResolution(cache, camis, currentAddressHash) {
  const entry = cache[camis];
  if (!entry) return true;

  return Boolean(
    entry.status === 'pending' ||
      entry.addressHash !== currentAddressHash ||
      entry.resolverVersion !== RESOLVER_VERSION ||
      (entry.status === 'verified' && entry.resolved && !isWithinNYC(entry.resolved.lat, entry.resolved.lon)),
  );
}

// Returns a new cache object; does not mutate the original.
export function upsertCacheEntry(cache, entry) {
  return { ...cache, [entry.camis]: entry };
}

// Merging (reconciling concurrent/overlapping runs)

function isFinal(entry) {
  return entry != null && entry.status !== 'pending';
}

// NaN comparisons are always false; treat a malformed/missing resolvedAt
// as 0 so it can't silently win a tie-break over a real timestamp.
function resolvedTime(entry) {
  const parsed = entry.resolvedAt ? Date.parse(entry.resolvedAt) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

// Reconciles two runs entry-by-entry: a finished result always beats a
// pending one, and the newer resolvedAt wins between two finished results.
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
      merged[camis] = resolvedTime(localEntry) >= resolvedTime(remoteEntry) ? localEntry : remoteEntry;
    } else {
      merged[camis] = localEntry;
    }
  }

  return merged;
}

// De-dupes by camis; local entries win over remote.
export function mergeSuspiciousShifts(local, remote) {
  const byCamis = new Map();
  for (const entry of remote) byCamis.set(entry.camis, entry);
  for (const entry of local) byCamis.set(entry.camis, entry);
  return [...byCamis.values()];
}