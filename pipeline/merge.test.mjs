// merge.test.mjs
// Tests mergeCaches() and mergeSuspiciousShifts() — the logic that
// reconciles a run's local results against whatever landed on the remote
// in the meantime (e.g. an overlapping run, or any other commit to main).
//
// Run with: node --test merge.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeCaches, mergeSuspiciousShifts, RESOLVER_VERSION } from './cache.mjs';

function entry(overrides = {}) {
  return {
    camis: '1',
    dohmh: { building: '1', street: 'Main St', boro: 'Queens', zip: '11111', lat: 40.7, lon: -73.9 },
    resolved: null,
    status: 'pending',
    matchType: null,
    resolvedVia: null,
    distanceFromDohmh: null,
    reason: null,
    resolvedAt: null,
    addressHash: 'hash',
    resolverVersion: RESOLVER_VERSION,
    ...overrides,
  };
}

test('mergeCaches keeps a camis that only exists locally', () => {
  const merged = mergeCaches({ A: entry({ camis: 'A' }) }, {});
  assert.ok(merged.A);
});

test('mergeCaches keeps a camis that only exists on remote', () => {
  const merged = mergeCaches({}, { B: entry({ camis: 'B' }) });
  assert.ok(merged.B);
});

test('mergeCaches: a final local result wins over a pending remote one', () => {
  const local = { A: entry({ camis: 'A', status: 'verified', resolvedAt: '2026-01-01T00:00:00.000Z' }) };
  const remote = { A: entry({ camis: 'A', status: 'pending' }) };
  const merged = mergeCaches(local, remote);
  assert.equal(merged.A.status, 'verified');
});

test('mergeCaches: a final remote result wins over a pending local one', () => {
  // This is the exact scenario from the real incident: run #4's local
  // result for a camis was pending/incomplete, but run #3 had already
  // resolved it for real on the remote. The real result must NOT be
  // overwritten by the unfinished one.
  const local = { A: entry({ camis: 'A', status: 'pending' }) };
  const remote = { A: entry({ camis: 'A', status: 'verified', resolvedAt: '2026-01-01T00:00:00.000Z' }) };
  const merged = mergeCaches(local, remote);
  assert.equal(merged.A.status, 'verified');
});

test('mergeCaches: between two final results, the more recent resolvedAt wins', () => {
  const local = { A: entry({ camis: 'A', status: 'verified', resolvedAt: '2026-01-02T00:00:00.000Z' }) };
  const remote = { A: entry({ camis: 'A', status: 'unverified', resolvedAt: '2026-01-01T00:00:00.000Z' }) };
  const merged = mergeCaches(local, remote);
  assert.equal(merged.A.status, 'verified'); // local is newer
});

test('mergeCaches: older final result loses to newer one even if remote', () => {
  const local = { A: entry({ camis: 'A', status: 'unverified', resolvedAt: '2026-01-01T00:00:00.000Z' }) };
  const remote = { A: entry({ camis: 'A', status: 'verified', resolvedAt: '2026-01-02T00:00:00.000Z' }) };
  const merged = mergeCaches(local, remote);
  assert.equal(merged.A.status, 'verified'); // remote is newer
});

test('mergeCaches: both pending keeps one without crashing', () => {
  const local = { A: entry({ camis: 'A', status: 'pending' }) };
  const remote = { A: entry({ camis: 'A', status: 'pending' }) };
  const merged = mergeCaches(local, remote);
  assert.equal(merged.A.status, 'pending');
});

test('mergeCaches: a large realistic merge preserves entries from both sides', () => {
  const local = {
    A: entry({ camis: 'A', status: 'verified', resolvedAt: '2026-01-01T00:00:00.000Z' }),
    B: entry({ camis: 'B', status: 'pending' }), // ran out of quota mid-run
  };
  const remote = {
    C: entry({ camis: 'C', status: 'verified', resolvedAt: '2025-12-31T00:00:00.000Z' }),
    B: entry({ camis: 'B', status: 'verified', resolvedAt: '2025-12-30T00:00:00.000Z' }), // another run finished it
  };
  const merged = mergeCaches(local, remote);
  assert.equal(Object.keys(merged).length, 3);
  assert.equal(merged.A.status, 'verified');
  assert.equal(merged.B.status, 'verified'); // remote's finished result wins over local's pending
  assert.equal(merged.C.status, 'verified');
});

// --- mergeSuspiciousShifts ---------------------------------------------------

test('mergeSuspiciousShifts unions entries from both sides', () => {
  const local = [{ camis: 'A', distanceMeters: 150 }];
  const remote = [{ camis: 'B', distanceMeters: 200 }];
  const merged = mergeSuspiciousShifts(local, remote);
  assert.equal(merged.length, 2);
});

test('mergeSuspiciousShifts dedupes by camis, local wins', () => {
  const local = [{ camis: 'A', distanceMeters: 999 }];
  const remote = [{ camis: 'A', distanceMeters: 150 }];
  const merged = mergeSuspiciousShifts(local, remote);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].distanceMeters, 999);
});
