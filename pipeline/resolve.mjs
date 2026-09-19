// resolve.mjs
//
// Combines geocode.mjs (network) and scoring.mjs (pure logic) into the
// full "resolve one restaurant" flow. Handles the quota check, the
// pending vs. unverified distinction, and rate limiting between calls.
//
// A restaurant object must have: dba, building, street, boro, zip,
// dohmhLat, dohmhLon.

import { buildQueries, fetchGeocode, rateLimitDelay, RateLimitedError } from './geocode.mjs';
import { selectBestMatch } from './scoring.mjs';

function pending(reason, extra = {}) {
  return { status: 'pending', reason, matchType: null, resolvedVia: null, ...extra };
}

function buildVerifiedResult(best) {
  return {
    status: 'verified',
    lat: best.lat,
    lon: best.lon,
    neighbourhood: best.neighbourhood,
    matchType: best.matchType,
    resolvedVia: best.resolvedVia,
    distanceFromDohmh: best.distanceFromDohmh,
    // Carried through so a shakily-confirmed match (borough + ZIP both
    // unconfirmed) stays distinguishable from a fully-confirmed one.
    score: best.score,
    reasons: best.reasons,
  };
}

// Uses an earlier query's match instead of discarding it when a LATER
// query fails (quota, rate limit, error) - otherwise the restaurant
// redoes both queries next run, wasting quota already spent. Falls back
// to the pending result when there's nothing to salvage.
function salvageOrPending(candidateEntries, restaurant, pendingResult) {
  const best = selectBestMatch(candidateEntries, restaurant);
  if (!best) return pendingResult;
  const verified = buildVerifiedResult(best);
  return pendingResult.rateLimited ? { ...verified, rateLimited: true } : verified;
}

// quota: { remaining: () => number, use: () => void }
// Caller owns the quota object so it can persist the count across restaurants
// within a single run.
export async function resolveRestaurant(restaurant, { apiKey, quota }) {
  const queries = buildQueries(restaurant);
  const candidateEntries = [];

  for (const { label, query } of queries) {
    if (quota.remaining() <= 0) {
      // Ran out of quota mid-restaurant - incomplete, not "no match found".
      // Pending means retry next run, unless an earlier query already
      // found an acceptable match.
      return salvageOrPending(candidateEntries, restaurant, pending('quota_exhausted'));
    }

    let results;
    try {
      results = await fetchGeocode(query, apiKey);
      quota.use(); // count the call regardless of whether it returned results
    } catch (err) {
      quota.use(); // the request was still sent, so it counts against quota either way

      if (err instanceof RateLimitedError) {
        // The ACCOUNT is rate-limited, not just this restaurant. Flagged
        // (rateLimited: true) so the caller's loop stops the run immediately
        // instead of grinding through guaranteed failures. No throttle
        // wait needed - no further requests follow this run anyway.
        return salvageOrPending(
          candidateEntries,
          restaurant,
          pending('rate_limited', { error: err.message, rateLimited: true }),
        );
      }

      // Network/API error, not "geocoder found nothing" - pending, retried
      // next run. A request still went out, so the next one must still
      // wait out the throttle.
      await rateLimitDelay();

      return salvageOrPending(
        candidateEntries,
        restaurant,
        pending('api_error', { error: err.message }),
      );
    }

    candidateEntries.push(...results.map((candidate) => ({ candidate, queryLabel: label })));
    await rateLimitDelay();
  }

  // Both queries completed successfully (even if one or both returned
  // zero results); now it's safe to make a final determination.
  const best = selectBestMatch(candidateEntries, restaurant);

  if (best) {
    return buildVerifiedResult(best);
  }

  // Geocoder ran cleanly, no acceptable candidate. This IS a final
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