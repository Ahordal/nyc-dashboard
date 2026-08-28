// dashboard-meta.test.mjs
//
// buildDashboardMeta() must report the LAST DAILY geocode-backfill run,
// never the build that happens to be running. counts-snapshot.json
// (written once per day by run-geocode-backfill.mjs) is the source of
// truth for all five fields; the build's own live totals are only a
// pre-first-snapshot fallback.
//
// Run with: node --test dashboard-meta.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDashboardMeta } from './fetch-inspection.mjs';

// Two restaurants, 3 + 2 history points => live inspectionCount of 5.
const HISTORY = {
  '1': [{}, {}, {}],
  '2': [{}, {}],
};

test('passes the snapshot through verbatim, ignoring this build\'s live totals', () => {
  const snapshot = {
    generatedAt: '2026-08-27T08:05:00.000Z',
    restaurantCount: 30596,
    inspectionCount: 82955,
    restaurantDelta: 56,
    inspectionDelta: 127,
  };

  const meta = buildDashboardMeta('2026-08-28T14:00:00.000Z', 99999, HISTORY, snapshot);

  assert.deepEqual(meta, {
    lastUpdated: '2026-08-27T08:05:00.000Z',
    restaurantCount: 30596,
    inspectionCount: 82955,
    restaurantDelta: 56,
    inspectionDelta: 127,
  });
});

test('keeps a genuine zero-change delta as 0, not null', () => {
  const snapshot = {
    generatedAt: '2026-08-27T08:05:00.000Z',
    restaurantCount: 30596,
    inspectionCount: 82955,
    restaurantDelta: 0,
    inspectionDelta: 0,
  };

  const meta = buildDashboardMeta('2026-08-28T14:00:00.000Z', 30596, HISTORY, snapshot);

  assert.equal(meta.restaurantDelta, 0);
  assert.equal(meta.inspectionDelta, 0);
});

test('null deltas when the snapshot has counts but no delta fields yet', () => {
  const snapshot = { generatedAt: '2026-08-27T08:05:00.000Z', restaurantCount: 100, inspectionCount: 200 };

  const meta = buildDashboardMeta('2026-08-28T14:00:00.000Z', 999, HISTORY, snapshot);

  assert.equal(meta.restaurantCount, 100);
  assert.equal(meta.inspectionCount, 200);
  assert.equal(meta.restaurantDelta, null);
  assert.equal(meta.inspectionDelta, null);
});

test('falls back to this build\'s live totals with null deltas when no snapshot exists', () => {
  const meta = buildDashboardMeta('2026-08-28T14:00:00.000Z', 1234, HISTORY, null);

  assert.deepEqual(meta, {
    lastUpdated: '2026-08-28T14:00:00.000Z',
    restaurantCount: 1234,
    inspectionCount: 5,
    restaurantDelta: null,
    inspectionDelta: null,
  });
});

test('falls back to the build timestamp when the snapshot omits generatedAt', () => {
  const snapshot = { restaurantCount: 100, inspectionCount: 200, restaurantDelta: 1, inspectionDelta: 2 };

  const meta = buildDashboardMeta('2026-08-28T14:00:00.000Z', 999, HISTORY, snapshot);

  assert.equal(meta.lastUpdated, '2026-08-28T14:00:00.000Z');
});
