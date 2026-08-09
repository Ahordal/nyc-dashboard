// resolve.mjs
// Combines geocode.mjs (network) + scoring.mjs (pure logic) into the full
// "resolve one restaurant" flow. Handles the quota check, the pending vs.
// unverified distinction, and rate limiting between calls.
//
// A restaurant object must have: dba, building, street, boro, zip,
// dohmhLat, dohmhLon.

import { buildQueries, fetchGeocode, rateLimitDelay } from './geocode.mjs';
import { selectBestMatch } from './scoring.mjs';

// quota: { remaining: () => number, use: () => void }
// Caller owns the quota object so it can persist the count across restaurants
// within a single run.
export async function resolveRestaurant(restaurant, { apiKey, quota }) {
  const queries = buildQueries(restaurant);
  const candidateEntries = [];

  for (const { label, query } of queries) {
    if (quota.remaining() <= 0) {
      // Ran out of quota mid-restaurant. Whatever we've gathered so far is
      // incomplete — do NOT treat this as "no match found". Pending means
      // "try again next run", never written to the cache as final.
      return {
        status: 'pending',
        reason: 'quota_exhausted',
        matchType: null,
        resolvedVia: null,
      };
    }

    let results;
    try {
      results = await fetchGeocode(query, apiKey);
      quota.use(); // count the call regardless of whether it returned results
    } catch (err) {
      quota.use(); // the request was still sent — counts against quota either way
      // Network/API error — this is NOT the same as "geocoder ran and found
      // nothing". Pending, retried next run.
      return {
        status: 'pending',
        reason: 'api_error',
        error: err.message,
        matchType: null,
        resolvedVia: null,
      };
    }

    candidateEntries.push(...results.map((candidate) => ({ candidate, queryLabel: label })));
    await rateLimitDelay();
  }

  // Both queries completed successfully (even if one or both returned zero
  // results) — now it's safe to make a final determination.
  const best = selectBestMatch(candidateEntries, restaurant);

  if (best) {
    return {
      status: 'verified',
      lat: best.lat,
      lon: best.lon,
      neighbourhood: best.neighbourhood,
      matchType: best.matchType,
      resolvedVia: best.resolvedVia,
      distanceFromDohmh: best.distanceFromDohmh,
    };
  }

  // Geocoder ran cleanly, no acceptable candidate — this IS a final
  // "unverified" result, safe to cache (until the address itself changes).
  return {
    status: 'unverified',
    reason: 'no_acceptable_match',
    matchType: null,
    resolvedVia: null,
  };
}

// Simple in-memory quota tracker. Caller can wrap/persist this however fits
// the pipeline (e.g. load today's used-count from a small state file).
export function createQuota(dailyLimit = 4900) {
  let used = 0;
  return {
    remaining: () => dailyLimit - used,
    use: () => {
      used += 1;
    },
    used: () => used,
  };
}
