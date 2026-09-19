// merge-count-correction.test.mjs
//
// run-geocode-backfill.mjs freezes restaurantCount/restaurantDelta from
// the PRE-merge local cache. A restaurant with an invalid DOHMH
// coordinate only counts at all once it has a verified, in-bounds cache
// entry, so if merging against the remote changes that for any of them,
// the snapshot must be corrected by the same amount rather than
// committing a value based on cache state that's about to be replaced.
//
// Run with: node --test merge-count-correction.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countVerifiedInBounds, correctSnapshotForMerge } from './merge-and-commit-cache.mjs';

const VERIFIED_NYC = { status: 'verified', resolved: { lat: 40.7, lon: -73.9 } };
const VERIFIED_OUT_OF_BOUNDS = { status: 'verified', resolved: { lat: 34.05, lon: -118.24 } };
const PENDING = { status: 'pending', resolved: null };

// countVerifiedInBounds

test('countVerifiedInBounds counts only verified, in-bounds entries from the given list', () => {
  const cache = { a: VERIFIED_NYC, b: VERIFIED_OUT_OF_BOUNDS, c: PENDING, d: VERIFIED_NYC };
  assert.equal(countVerifiedInBounds(cache, ['a', 'b', 'c', 'd']), 2);
});

test('countVerifiedInBounds ignores camis missing from the cache entirely', () => {
  const cache = { a: VERIFIED_NYC };
  assert.equal(countVerifiedInBounds(cache, ['a', 'missing']), 1);
});

// correctSnapshotForMerge

test('leaves the snapshot untouched when there are no DOHMH-invalid restaurants to check', () => {
  const snapshot = { restaurantCount: 100, restaurantDelta: 5 };
  const result = correctSnapshotForMerge(snapshot, {}, {}, []);
  assert.equal(result, snapshot);
});

test('leaves the snapshot untouched when the merge did not change any of them', () => {
  const localCache = { a: PENDING };
  const mergedCache = { a: PENDING };
  const snapshot = { restaurantCount: 100, restaurantDelta: 5 };
  const result = correctSnapshotForMerge(snapshot, localCache, mergedCache, ['a']);
  assert.equal(result, snapshot);
});

test('increases the count when the merge resolved a DOHMH-invalid restaurant the local run had not', () => {
  const localCache = { a: PENDING };
  const mergedCache = { a: VERIFIED_NYC }; // e.g. resolved by a run that landed on `data` in the meantime
  const snapshot = { restaurantCount: 100, restaurantDelta: 5 };
  const result = correctSnapshotForMerge(snapshot, localCache, mergedCache, ['a']);
  assert.equal(result.restaurantCount, 101);
  assert.equal(result.restaurantDelta, 6);
});

test('decreases the count when the merge reverted a DOHMH-invalid restaurant to unresolved', () => {
  const localCache = { a: VERIFIED_NYC };
  const mergedCache = { a: PENDING };
  const snapshot = { restaurantCount: 100, restaurantDelta: 5 };
  const result = correctSnapshotForMerge(snapshot, localCache, mergedCache, ['a']);
  assert.equal(result.restaurantCount, 99);
  assert.equal(result.restaurantDelta, 4);
});

test('keeps a null restaurantDelta null rather than turning it into a number', () => {
  const localCache = { a: PENDING };
  const mergedCache = { a: VERIFIED_NYC };
  const snapshot = { restaurantCount: 100, restaurantDelta: null };
  const result = correctSnapshotForMerge(snapshot, localCache, mergedCache, ['a']);
  assert.equal(result.restaurantCount, 101);
  assert.equal(result.restaurantDelta, null);
});

test('does not correct inspectionCount/inspectionDelta - those never depend on the cache', () => {
  const localCache = { a: PENDING };
  const mergedCache = { a: VERIFIED_NYC };
  const snapshot = { restaurantCount: 100, restaurantDelta: 5, inspectionCount: 500, inspectionDelta: 20 };
  const result = correctSnapshotForMerge(snapshot, localCache, mergedCache, ['a']);
  assert.equal(result.inspectionCount, 500);
  assert.equal(result.inspectionDelta, 20);
});

test('returns null-ish snapshot untouched', () => {
  assert.equal(correctSnapshotForMerge(null, {}, {}, ['a']), null);
});
