// suspicious-shifts.test.mjs
//
// runGeocodeBackfill() flags a verified match for suspicious-shifts.json
// review not just when it lands far from DOHMH's own coordinates, but
// also when it's only shakily confirmed (both the borough and ZIP
// scoring bonuses missed) - otherwise that match is cached as plain
// "verified", indistinguishable from a fully-confirmed one.
//
// Run with: node --test suspicious-shifts.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runGeocodeBackfill } from './backfill-core.mjs';

async function withTempDir(fn) {
  const dir = await mkdtemp(join(tmpdir(), 'suspicious-shifts-test-'));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const RESTAURANT = {
  camis: '1',
  dba: 'Test Place',
  building: '1',
  street: 'Main St',
  boro: 'Queens',
  zip: '11111',
  dohmhLat: 40.7,
  dohmhLon: -73.9,
};

test('flags a shakily-confirmed match (borough + ZIP both unconfirmed) even when it is not far from DOHMH', async () => {
  await withTempDir(async (dir) => {
    const originalFetch = global.fetch;
    global.fetch = async () => ({
      status: 200,
      ok: true,
      json: async () => [
        {
          lat: '40.7',
          lon: '-73.9', // same as DOHMH's point, so no distance-based flag
          address: { house_number: '1', road: 'Main St', suburb: 'Brooklyn', postcode: '99999' }, // wrong boro/zip
        },
      ],
    });

    try {
      const logPath = join(dir, 'shifts.json');
      const result = await runGeocodeBackfill([RESTAURANT], {
        apiKey: 'fake-key',
        cachePath: join(dir, 'cache.json'),
        logPath,
      });

      assert.equal(result.resolvedCount, 1);
      assert.equal(result.suspiciousShiftsLogged, 1);

      const logged = JSON.parse(await readFile(logPath, 'utf-8'));
      assert.equal(logged.length, 1);
      assert.deepEqual(logged[0].flagReasons, ['low_confidence_match']);
      assert.equal(logged[0].distanceMeters < 1, true); // confirms this wasn't the distance trigger
    } finally {
      global.fetch = originalFetch;
    }
  });
});

test('does not flag a fully-confirmed nearby match', async () => {
  await withTempDir(async (dir) => {
    const originalFetch = global.fetch;
    global.fetch = async () => ({
      status: 200,
      ok: true,
      json: async () => [
        {
          lat: '40.7',
          lon: '-73.9',
          address: { house_number: '1', road: 'Main St', suburb: 'Queens', postcode: '11111' }, // matches boro/zip
        },
      ],
    });

    try {
      const result = await runGeocodeBackfill([RESTAURANT], {
        apiKey: 'fake-key',
        cachePath: join(dir, 'cache.json'),
        logPath: join(dir, 'shifts.json'),
      });

      assert.equal(result.resolvedCount, 1);
      assert.equal(result.suspiciousShiftsLogged, 0);
    } finally {
      global.fetch = originalFetch;
    }
  });
});
