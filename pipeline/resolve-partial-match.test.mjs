// resolve-partial-match.test.mjs
//
// resolveRestaurant() runs up to two geocode queries (hyphenated,
// no-hyphen) per restaurant. If the first already found an acceptable
// match and the SECOND then fails (quota exhausted, rate limit, an
// ordinary error), that match must be kept rather than discarded -
// otherwise the restaurant retries both queries from scratch next run,
// wasting the quota already spent on the successful one.
//
// Run with: node --test resolve-partial-match.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveRestaurant, createQuota } from './resolve.mjs';

// Hyphenated building number so buildQueries fires both query variants
// (see geocode.mjs).
const RESTAURANT = {
  camis: '1',
  dba: 'Test Place',
  building: '35-01',
  street: 'Main St',
  boro: 'Queens',
  zip: '11111',
  dohmhLat: 40.7,
  dohmhLon: -73.9,
};

// Matches RESTAURANT's building/street exactly, close to its DOHMH point
// and within NYC bounds, so scoreCandidate accepts it.
const ACCEPTABLE_CANDIDATE = {
  lat: '40.7',
  lon: '-73.9',
  address: { house_number: '35-01', road: 'Main St' },
};

// Fails scoreCandidate's house-number check, so it's never accepted.
const UNACCEPTABLE_CANDIDATE = {
  lat: '40.71',
  lon: '-73.91',
  address: { house_number: '999', road: 'Nowhere Ave' },
};

function mockFetchSequence(responses) {
  let callCount = 0;
  return async () => {
    const response = responses[callCount];
    callCount += 1;
    return response;
  };
}

const OK = (rows) => ({ status: 200, ok: true, json: async () => rows });
const RATE_LIMITED = { status: 429, ok: false, text: async () => 'Rate limit exceeded' };
const SERVER_ERROR = { status: 400, ok: false, text: async () => 'Bad request' };

test('salvages the first query\'s match when the second is rate-limited', async () => {
  const originalFetch = global.fetch;
  global.fetch = mockFetchSequence([OK([ACCEPTABLE_CANDIDATE]), RATE_LIMITED]);
  try {
    const result = await resolveRestaurant(RESTAURANT, { apiKey: 'fake-key', quota: createQuota(100) });
    assert.equal(result.status, 'verified'); // not discarded
    assert.equal(result.matchType, 'house+street');
    assert.equal(result.rateLimited, true); // still tells the caller's loop to stop the run
  } finally {
    global.fetch = originalFetch;
  }
});

test('salvages the first query\'s match when the second hits an ordinary error', async () => {
  const originalFetch = global.fetch;
  global.fetch = mockFetchSequence([OK([ACCEPTABLE_CANDIDATE]), SERVER_ERROR]);
  try {
    const result = await resolveRestaurant(RESTAURANT, { apiKey: 'fake-key', quota: createQuota(100) });
    assert.equal(result.status, 'verified');
    assert.equal(result.rateLimited, undefined); // no run-stopping signal for an ordinary error
  } finally {
    global.fetch = originalFetch;
  }
});

test('salvages the first query\'s match when quota runs out before the second', async () => {
  const originalFetch = global.fetch;
  global.fetch = mockFetchSequence([OK([ACCEPTABLE_CANDIDATE])]);
  try {
    const quota = createQuota(1); // exhausted after the first query
    const result = await resolveRestaurant(RESTAURANT, { apiKey: 'fake-key', quota });
    assert.equal(result.status, 'verified');
  } finally {
    global.fetch = originalFetch;
  }
});

test('stays pending when there is nothing acceptable to salvage', async () => {
  const originalFetch = global.fetch;
  global.fetch = mockFetchSequence([OK([UNACCEPTABLE_CANDIDATE]), RATE_LIMITED]);
  try {
    const result = await resolveRestaurant(RESTAURANT, { apiKey: 'fake-key', quota: createQuota(100) });
    assert.equal(result.status, 'pending');
    assert.equal(result.reason, 'rate_limited');
  } finally {
    global.fetch = originalFetch;
  }
});
