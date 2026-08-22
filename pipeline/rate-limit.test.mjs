// rate-limit.test.mjs
// Verifies the rate-limit early-exit behavior end-to-end using a mocked
// global.fetch — no real LocationIQ calls, no real quota consumed.
//
// Confirms:
//   1. A 429 response is caught as RateLimitedError, not a generic error.
//   2. resolveRestaurant() marks it { status: 'pending', reason: 'rate_limited',
//      rateLimited: true } — never 'unverified'.
//   3. runGeocodeBackfill() STOPS entirely on the first rate-limited response,
//      rather than continuing to grind through the rest of the restaurant list.
//
// Run with: node --test rate-limit.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fetchGeocode, RateLimitedError } from './geocode.mjs';
import { resolveRestaurant, createQuota } from './resolve.mjs';
import { runGeocodeBackfill } from './backfill-core.mjs';

async function withTempDir(fn) {
  const dir = await mkdtemp(join(tmpdir(), 'rate-limit-test-'));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function mockFetch429() {
  return async () => ({
    status: 429,
    ok: false,
    text: async () => 'Rate limit exceeded',
  });
}

// --- fetchGeocode throws RateLimitedError on 429 ---------------------------

test('fetchGeocode throws RateLimitedError specifically on HTTP 429', async () => {
  const originalFetch = global.fetch;
  global.fetch = mockFetch429();
  try {
    await assert.rejects(
      () => fetchGeocode('some query', 'fake-key'),
      RateLimitedError,
    );
  } finally {
    global.fetch = originalFetch;
  }
});

// --- resolveRestaurant marks rate-limited correctly -------------------------

test('resolveRestaurant returns pending/rate_limited with rateLimited:true on 429', async () => {
  const originalFetch = global.fetch;
  global.fetch = mockFetch429();
  try {
    const restaurant = {
      camis: '999',
      dba: 'Test Place',
      building: '1',
      street: 'Main St',
      boro: 'Queens',
      zip: '11111',
      dohmhLat: 40.7,
      dohmhLon: -73.9,
    };
    const quota = createQuota(100);
    const result = await resolveRestaurant(restaurant, { apiKey: 'fake-key', quota });

    assert.equal(result.status, 'pending'); // NEVER 'unverified' for a rate limit
    assert.equal(result.reason, 'rate_limited');
    assert.equal(result.rateLimited, true);
  } finally {
    global.fetch = originalFetch;
  }
});

// --- runGeocodeBackfill stops the ENTIRE run on first rate limit -----------

test('runGeocodeBackfill stops processing remaining restaurants after a 429', async () => {
  await withTempDir(async (dir) => {
    const originalFetch = global.fetch;
    let callCount = 0;
    global.fetch = async () => {
      callCount += 1;
      return { status: 429, ok: false, text: async () => 'Rate limit exceeded' };
    };

    try {
      const restaurants = Array.from({ length: 10 }, (_, i) => ({
        camis: `R${i}`,
        dba: `Restaurant ${i}`,
        building: '1',
        street: 'Main St',
        boro: 'Queens',
        zip: '11111',
        dohmhLat: 40.7,
        dohmhLon: -73.9,
      }));

      const result = await runGeocodeBackfill(restaurants, {
        apiKey: 'fake-key',
        cachePath: join(dir, 'cache.json'),
        logPath: join(dir, 'shifts.json'),
      });

      // Should have stopped after the FIRST restaurant's first request hit
      // the 429 — not ground through all 10 restaurants (which would be up
      // to 20 calls, one per query variant each).
      assert.equal(callCount, 1, 'should stop immediately on first 429, not keep calling');
      assert.equal(result.resolvedCount, 0);
    } finally {
      global.fetch = originalFetch;
    }
  });
});

test('runGeocodeBackfill processes normally when there is no rate limiting', async () => {
  await withTempDir(async (dir) => {
    const originalFetch = global.fetch;
    let callCount = 0;
    global.fetch = async () => {
      callCount += 1;
      return { status: 404, ok: false, text: async () => 'not found' }; // clean "no results", not rate limited
    };

    try {
      const restaurants = Array.from({ length: 3 }, (_, i) => ({
        camis: `R${i}`,
        dba: `Restaurant ${i}`,
        building: '35-01', // hyphenated so buildQueries fires both variants
        street: 'Main St',
        boro: 'Queens',
        zip: '11111',
        dohmhLat: 40.7,
        dohmhLon: -73.9,
      }));

      const result = await runGeocodeBackfill(restaurants, {
        apiKey: 'fake-key',
        cachePath: join(dir, 'cache.json'),
        logPath: join(dir, 'shifts.json'),
      });

      // 3 restaurants x 2 queries each = 6 calls, all restaurants processed
      // (unverified, since 404 -> empty results -> no match -- but NOT
      // stopped early, since this isn't a rate-limit situation). Building
      // numbers must be hyphenated for buildQueries to actually fire the
      // second (no-hyphen) query -- see geocode.mjs.
      assert.equal(callCount, 6);
      assert.equal(result.skippedCount, 0);
    } finally {
      global.fetch = originalFetch;
    }
  });
});