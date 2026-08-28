// counts-snapshot.test.mjs
// The delta plumbing in run-geocode-backfill.mjs: computeCountDeltas() does
// the once-a-day subtraction, readSnapshotOrNull() tolerates a missing or
// junk previous snapshot, and formatDelta() renders the console line.
//
// Run with: node --test counts-snapshot.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  computeCountDeltas,
  readSnapshotOrNull,
  formatDelta,
} from './run-geocode-backfill.mjs';

test('computeCountDeltas subtracts the previous daily run', () => {
  assert.deepEqual(
    computeCountDeltas(
      { restaurantCount: 30596, inspectionCount: 82955 },
      { restaurantCount: 30540, inspectionCount: 82828 },
    ),
    { restaurantDelta: 56, inspectionDelta: 127 },
  );
});

test('computeCountDeltas keeps a genuine zero-change day as 0, not null', () => {
  assert.deepEqual(
    computeCountDeltas(
      { restaurantCount: 100, inspectionCount: 200 },
      { restaurantCount: 100, inspectionCount: 200 },
    ),
    { restaurantDelta: 0, inspectionDelta: 0 },
  );
});

test('computeCountDeltas reports a shrinking count as a negative delta', () => {
  const { restaurantDelta } = computeCountDeltas(
    { restaurantCount: 90, inspectionCount: 200 },
    { restaurantCount: 100, inspectionCount: 200 },
  );
  assert.equal(restaurantDelta, -10);
});

test('computeCountDeltas returns null deltas when there is no previous snapshot', () => {
  assert.deepEqual(
    computeCountDeltas({ restaurantCount: 100, inspectionCount: 200 }, null),
    { restaurantDelta: null, inspectionDelta: null },
  );
});

test('computeCountDeltas nulls only the field the previous snapshot is missing', () => {
  assert.deepEqual(
    computeCountDeltas(
      { restaurantCount: 100, inspectionCount: 200 },
      { inspectionCount: 180 },
    ),
    { restaurantDelta: null, inspectionDelta: 20 },
  );
});

test('formatDelta renders sign, zero, and the no-baseline case', () => {
  assert.equal(formatDelta(56), '+56');
  assert.equal(formatDelta(0), '+0');
  assert.equal(formatDelta(-3), '-3');
  assert.equal(formatDelta(null), 'no baseline');
  assert.equal(formatDelta(undefined), 'no baseline');
});

test('readSnapshotOrNull round-trips a real snapshot file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'counts-snapshot-'));
  try {
    const path = join(dir, 'counts-snapshot.json');
    const snapshot = {
      generatedAt: '2026-08-27T08:05:00.000Z',
      restaurantCount: 30596,
      inspectionCount: 82955,
    };
    await writeFile(path, JSON.stringify(snapshot), 'utf-8');
    assert.deepEqual(await readSnapshotOrNull(path), snapshot);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('readSnapshotOrNull returns null for a missing file', async () => {
  assert.equal(
    await readSnapshotOrNull(join(tmpdir(), 'does-not-exist-counts.json')),
    null,
  );
});

test('readSnapshotOrNull returns null for corrupt JSON', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'counts-snapshot-'));
  try {
    const path = join(dir, 'counts-snapshot.json');
    await writeFile(path, '{ not valid json', 'utf-8');
    assert.equal(await readSnapshotOrNull(path), null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('readSnapshotOrNull returns null for a file that is just `null`', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'counts-snapshot-'));
  try {
    const path = join(dir, 'counts-snapshot.json');
    await writeFile(path, 'null', 'utf-8');
    assert.equal(await readSnapshotOrNull(path), null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
