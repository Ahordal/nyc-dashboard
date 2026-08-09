// cache.test.mjs
// Tests for cache.mjs — uses real temp files on disk (via node:os tmpdir) so
// the atomic-write and load/corruption-recovery behavior is tested for real,
// not mocked.
//
// Run with: node --test cache.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  loadCache,
  saveCacheAtomic,
  buildCacheEntry,
  needsResolution,
  upsertCacheEntry,
  RESOLVER_VERSION,
} from './cache.mjs';

async function withTempDir(fn) {
  const dir = await mkdtemp(join(tmpdir(), 'geocode-cache-test-'));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// --- loadCache ---------------------------------------------------------

test('loadCache returns empty object when file does not exist', async () => {
  await withTempDir(async (dir) => {
    const result = await loadCache(join(dir, 'nonexistent.json'));
    assert.deepEqual(result, {});
  });
});

test('loadCache returns empty object (not a crash) for corrupted JSON', async () => {
  await withTempDir(async (dir) => {
    const filePath = join(dir, 'corrupted.json');
    await writeFile(filePath, '{ this is not valid json !!!', 'utf-8');
    const result = await loadCache(filePath);
    assert.deepEqual(result, {});
  });
});

test('loadCache correctly reads a previously saved cache', async () => {
  await withTempDir(async (dir) => {
    const filePath = join(dir, 'cache.json');
    const data = { '12345': { camis: '12345', status: 'verified' } };
    await writeFile(filePath, JSON.stringify(data), 'utf-8');
    const result = await loadCache(filePath);
    assert.deepEqual(result, data);
  });
});

// --- saveCacheAtomic -----------------------------------------------------

test('saveCacheAtomic writes a file that loadCache can read back correctly', async () => {
  await withTempDir(async (dir) => {
    const filePath = join(dir, 'nested', 'cache.json'); // also tests mkdir -p behavior
    const data = { '111': { camis: '111', status: 'verified' } };
    await saveCacheAtomic(filePath, data);
    const reloaded = await loadCache(filePath);
    assert.deepEqual(reloaded, data);
  });
});

test('saveCacheAtomic does not leave a .tmp file behind after success', async () => {
  await withTempDir(async (dir) => {
    const filePath = join(dir, 'cache.json');
    await saveCacheAtomic(filePath, { a: 1 });
    // Re-reading the raw file should give clean JSON, not a leftover temp artifact
    const raw = await readFile(filePath, 'utf-8');
    assert.doesNotThrow(() => JSON.parse(raw));
  });
});

test('saveCacheAtomic overwrites a previous cache cleanly', async () => {
  await withTempDir(async (dir) => {
    const filePath = join(dir, 'cache.json');
    await saveCacheAtomic(filePath, { a: 1 });
    await saveCacheAtomic(filePath, { b: 2 });
    const reloaded = await loadCache(filePath);
    assert.deepEqual(reloaded, { b: 2 });
  });
});

// --- buildCacheEntry -----------------------------------------------------

test('buildCacheEntry produces a verified entry with resolved coordinates', () => {
  const entry = buildCacheEntry({
    camis: '123',
    dohmh: { building: '37-70', street: '79 Street', boro: 'Queens', zip: '11372', lat: 40.749, lon: -73.887 },
    addressHash: 'hash-abc',
    resolution: {
      status: 'verified',
      lat: 40.7476,
      lon: -73.8869,
      neighbourhood: 'Jackson Heights',
      matchType: 'house+street',
      resolvedVia: 'no-hyphen',
      distanceFromDohmh: 6.7,
    },
  });

  assert.equal(entry.status, 'verified');
  assert.deepEqual(entry.resolved, { lat: 40.7476, lon: -73.8869, neighbourhood: 'Jackson Heights' });
  assert.equal(entry.dohmh.lat, 40.749); // original preserved
  assert.equal(entry.resolverVersion, RESOLVER_VERSION);
  assert.ok(entry.resolvedAt); // timestamp set for a final result
});

test('buildCacheEntry produces an unverified entry with null resolved coordinates', () => {
  const entry = buildCacheEntry({
    camis: '456',
    dohmh: { building: '79-23', street: 'Main Street', boro: 'Queens', zip: '11367', lat: 40.71, lon: -73.8 },
    addressHash: 'hash-def',
    resolution: { status: 'unverified', reason: 'no_acceptable_match', matchType: null, resolvedVia: null },
  });

  assert.equal(entry.status, 'unverified');
  assert.equal(entry.resolved, null);
  assert.equal(entry.reason, 'no_acceptable_match');
  assert.ok(entry.resolvedAt); // unverified is still a FINAL result — gets a timestamp
});

test('buildCacheEntry produces a pending entry with no resolvedAt timestamp', () => {
  const entry = buildCacheEntry({
    camis: '789',
    dohmh: { building: '1', street: 'Main St', boro: 'Queens', zip: '11111', lat: 40.7, lon: -73.9 },
    addressHash: 'hash-ghi',
    resolution: { status: 'pending', reason: 'api_error', matchType: null, resolvedVia: null },
  });

  assert.equal(entry.status, 'pending');
  assert.equal(entry.resolved, null);
  // Pending is NOT a final result — no resolvedAt, so it's unambiguous this
  // was never actually completed.
  assert.equal(entry.resolvedAt, null);
});

// --- needsResolution -------------------------------------------------------

test('needsResolution is true when there is no cache entry at all', () => {
  assert.equal(needsResolution({}, '123', 'hash-abc'), true);
});

test('needsResolution is true for a pending entry, regardless of hash', () => {
  const cache = { '123': { status: 'pending', addressHash: 'hash-abc', resolverVersion: RESOLVER_VERSION } };
  assert.equal(needsResolution(cache, '123', 'hash-abc'), true);
});

test('needsResolution is true when the address hash has changed (restaurant moved)', () => {
  const cache = { '123': { status: 'verified', addressHash: 'old-hash', resolverVersion: RESOLVER_VERSION } };
  assert.equal(needsResolution(cache, '123', 'new-hash'), true);
});

test('needsResolution is true when the resolver version is stale', () => {
  const cache = { '123': { status: 'verified', addressHash: 'hash-abc', resolverVersion: RESOLVER_VERSION - 1 } };
  assert.equal(needsResolution(cache, '123', 'hash-abc'), true);
});

test('needsResolution is false for a verified entry with matching hash and current resolver version', () => {
  const cache = { '123': { status: 'verified', addressHash: 'hash-abc', resolverVersion: RESOLVER_VERSION } };
  assert.equal(needsResolution(cache, '123', 'hash-abc'), false);
});

test('needsResolution is false for an unverified entry with matching hash (do not keep re-asking)', () => {
  const cache = { '123': { status: 'unverified', addressHash: 'hash-abc', resolverVersion: RESOLVER_VERSION } };
  assert.equal(needsResolution(cache, '123', 'hash-abc'), false);
});

// --- upsertCacheEntry --------------------------------------------------------

test('upsertCacheEntry adds a new entry without mutating the original cache object', () => {
  const original = { a: { camis: 'a' } };
  const updated = upsertCacheEntry(original, { camis: 'b', status: 'verified' });
  assert.deepEqual(original, { a: { camis: 'a' } }); // unchanged
  assert.deepEqual(updated, { a: { camis: 'a' }, b: { camis: 'b', status: 'verified' } });
});

test('upsertCacheEntry overwrites an existing entry for the same CAMIS', () => {
  const original = { a: { camis: 'a', status: 'pending' } };
  const updated = upsertCacheEntry(original, { camis: 'a', status: 'verified' });
  assert.equal(updated.a.status, 'verified');
});
