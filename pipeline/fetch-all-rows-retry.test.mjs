// fetch-all-rows-retry.test.mjs
//
// fetchAllRows() retries the whole paginated fetch on a row-count
// mismatch against Socrata's count(*) (e.g. the dataset changed
// mid-fetch), rather than aborting the build on the first mismatch. It
// also covers fetchWithRetry's retry of a malformed-but-200 JSON body,
// the same as any other transient Socrata failure.
//
// Run with: node --test fetch-all-rows-retry.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchAllRows } from './fetch-inspection.mjs';

function isCountQuery(url) {
  return url.includes('count(*)');
}

test('fetchAllRows retries and succeeds once the count matches', async () => {
  const originalFetch = global.fetch;
  let pageCalls = 0;
  global.fetch = async (url) => {
    if (isCountQuery(url.toString())) {
      return { ok: true, json: async () => [{ count: '2' }] };
    }
    pageCalls += 1;
    // First attempt "loses" a row (mismatch); second attempt returns both.
    const rows = pageCalls === 1 ? [{ camis: '1' }] : [{ camis: '1' }, { camis: '2' }];
    return { ok: true, json: async () => rows };
  };

  try {
    const rows = await fetchAllRows({ retryDelayMs: 1 });
    assert.equal(rows.length, 2);
    assert.equal(pageCalls, 2); // one page fetch per attempt
  } finally {
    global.fetch = originalFetch;
  }
});

test('fetchAllRows throws after the count mismatch persists across all attempts', async () => {
  const originalFetch = global.fetch;
  let pageCalls = 0;
  global.fetch = async (url) => {
    if (isCountQuery(url.toString())) {
      return { ok: true, json: async () => [{ count: '2' }] };
    }
    pageCalls += 1;
    return { ok: true, json: async () => [{ camis: '1' }] }; // always short by one
  };

  try {
    await assert.rejects(() => fetchAllRows({ retryDelayMs: 1 }), /Row count mismatch persisted after 3 attempts/);
    assert.equal(pageCalls, 3); // one page fetch per attempt, all 3 attempts used
  } finally {
    global.fetch = originalFetch;
  }
});

test('fetchAllRows retries a malformed-but-200 JSON body the same as a retryable HTTP error', async () => {
  const originalFetch = global.fetch;
  let countCalls = 0;
  global.fetch = async (url) => {
    if (isCountQuery(url.toString())) {
      countCalls += 1;
      if (countCalls === 1) {
        // Simulates a 200 response whose body is truncated/invalid JSON.
        return { ok: true, json: async () => { throw new SyntaxError('Unexpected end of JSON input'); } };
      }
      return { ok: true, json: async () => [{ count: '1' }] };
    }
    return { ok: true, json: async () => [{ camis: '1' }] };
  };

  try {
    const rows = await fetchAllRows({ retryDelayMs: 1 });
    assert.equal(rows.length, 1);
    assert.equal(countCalls, 2); // malformed on the first attempt, retried and succeeded
  } finally {
    global.fetch = originalFetch;
  }
});
