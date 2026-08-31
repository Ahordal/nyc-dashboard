// prebuild.test.mjs
//
// Tests for prebuild.mjs's seedFile: writes on a 200, and on any
// failure clears a stale local copy and warns instead of throwing.
//
// Run with: node --test prebuild.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { seedFile } from './prebuild.mjs';

async function withTempDir(fn) {
  const dir = await mkdtemp(join(tmpdir(), 'prebuild-test-'));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function silenceWarn() {
  const original = console.warn;
  const calls = [];
  console.warn = (msg) => calls.push(msg);
  return { calls, restore: () => (console.warn = original) };
}

const okResponse = (body) => ({ ok: true, status: 200, text: async () => body });

test('writes the fetched body on a 200', async () => {
  await withTempDir(async (dir) => {
    const wrote = await seedFile('geocode-cache.json', {
      destDir: dir,
      fetchImpl: async () => okResponse('{"a":1}'),
    });
    assert.equal(wrote, true);
    assert.equal(await readFile(join(dir, 'geocode-cache.json'), 'utf-8'), '{"a":1}');
  });
});

test('requests the file from the data branch', async () => {
  await withTempDir(async (dir) => {
    let requested;
    await seedFile('counts-snapshot.json', {
      destDir: dir,
      fetchImpl: async (url) => {
        requested = url;
        return okResponse('{}');
      },
    });
    assert.equal(
      requested,
      'https://raw.githubusercontent.com/Ahordal/nyc-dashboard/data/pipeline/counts-snapshot.json',
    );
  });
});

test('non-200 removes a stale local copy and warns, does not throw', async () => {
  await withTempDir(async (dir) => {
    const stale = join(dir, 'geocode-cache.json');
    await writeFile(stale, 'STALE');
    const warn = silenceWarn();
    try {
      const wrote = await seedFile('geocode-cache.json', {
        destDir: dir,
        fetchImpl: async () => ({ ok: false, status: 404, text: async () => '' }),
      });
      assert.equal(wrote, false);
      await assert.rejects(access(stale));
      assert.match(warn.calls[0], /could not fetch geocode-cache\.json.*HTTP 404/);
    } finally {
      warn.restore();
    }
  });
});

test('a thrown fetch error is caught and warned, does not throw', async () => {
  await withTempDir(async (dir) => {
    const warn = silenceWarn();
    try {
      const wrote = await seedFile('geocode-cache.json', {
        destDir: dir,
        fetchImpl: async () => {
          throw new Error('ECONNREFUSED');
        },
      });
      assert.equal(wrote, false);
      assert.match(warn.calls[0], /ECONNREFUSED/);
    } finally {
      warn.restore();
    }
  });
});
