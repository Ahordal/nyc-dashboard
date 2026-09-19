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

function buildVerifiedResult(best) {
  return {
    status: 'verified',
    lat: best.lat,
    lon: best.lon,
    neighbourhood: best.neighbourhood,
    matchType: best.matchType,
    resolvedVia: best.resolvedVia,
    distanceFromDohmh: best.distanceFromDohmh,
    // Carried through so a shakily-confirmed match (e.g. borough + ZIP
    // both unconfirmed) can still be told apart from a fully-confirmed
    // one after caching, instead of both looking like plain "verified".
    score: best.score,
    reasons: best.reasons,
  };
}

// If an earlier query in this restaurant's loop already produced an
// acceptable match, use it instead of discarding it just because a LATER
// query then failed (quota ran out, rate limit, ordinary error) - otherwise
// the whole restaurant retries both queries from scratch next run, wasting
// the quota already spent on the successful one. Falls back to the
// pending result as-is when there's nothing to salvage.
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
      // Ran out of quota mid-restaurant. Whatever's been gathered so far
      // is incomplete; do NOT treat this as "no match found". Pending
      // means "try again next run", never written to the cache as final -
      // unless an earlier query already found an acceptable match.
      return salvageOrPending(candidateEntries, restaurant, {
        status: 'pending',
        reason: 'quota_exhausted',
        matchType: null,
        resolvedVia: null,
      });
    }

    let results;
    try {
      results = await fetchGeocode(query, apiKey);
      quota.use(); // count the call regardless of whether it returned results
    } catch (err) {
      quota.use(); // the request was still sent, so it counts against quota either way

      if (err instanceof RateLimitedError) {
        // The ACCOUNT is rate-limited, not just this one restaurant.
        // Flagged separately (rateLimited: true) so the caller's loop can
        // stop the whole run immediately rather than grinding through
        // every remaining restaurant with the same guaranteed failure,
        // wasting the time budget and adding more rejected requests to
        // the day's usage stats for nothing. No further requests will
        // follow this run either way, so no throttle wait is needed here.
        return salvageOrPending(candidateEntries, restaurant, {
          status: 'pending',
          reason: 'rate_limited',
          error: err.message,
          matchType: null,
          resolvedVia: null,
          rateLimited: true,
        });
      }

      // Network/API error. NOT the same as "geocoder ran and found
      // nothing". Pending, retried next run. A request still went out
      // against LocationIQ, so the next one (this restaurant's other
      // query, or the next restaurant) must still wait out the throttle.
      await rateLimitDelay();

      return salvageOrPending(candidateEntries, restaurant, {
        status: 'pending',
        reason: 'api_error',
        error: err.message,
        matchType: null,
        resolvedVia: null,
      });
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