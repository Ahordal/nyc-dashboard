// fetch-all-rows-retry.test.mjs
//
// fetchAllRows() retries the whole paginated fetch on a row-count
// mismatch against Socrata's count(*) (e.g. the dataset changed
// mid-fetch), rather than aborting the build on the first mismatch.
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
