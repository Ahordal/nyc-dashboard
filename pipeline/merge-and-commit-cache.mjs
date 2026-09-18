// merge-and-commit-cache.mjs
//
// Replaces a naive "git add / commit / push" with a safe
// reconcile-then-push flow, so a run's geocoding results can never be
// silently lost when the remote has moved on since checkout (an
// overlapping run, a manual push of unrelated changes, anything). That
// is the exact failure mode that lost run #4's results on 2026-08-10.
//
// Targets the `data` branch (the cache/snapshot files live there now,
// not on `main`; this script predates that split and was never
// repointed). It pushes a normal incremental commit onto `data` rather
// than force-replacing an orphan branch, so `data` gains real history,
// which the merge step below needs to have anything to reconcile against.
//
// Sequence:
//   1. Read THIS run's local cache/log files into memory (already on
//      disk, written by backfill-core.mjs before this script runs).
//   2. git fetch, then git reset --hard origin/<branch>: discards this
//      run's own uncommitted git state (NOT the in-memory data from
//      step 1) and brings the working tree to exactly the remote.
//   3. Read the (now-reset) remote versions of both files.
//   4. Merge local + remote at the DATA level (cache.mjs's mergeCaches /
//      mergeSuspiciousShifts), never a raw git text merge, which could
//      corrupt the JSON or silently pick one side wholesale.
//   5. Write the merged result, restore counts-snapshot.json (this run's
//      fresh snapshot from step 1, re-written because the step-2 reset
//      reverts it to the committed version; it's tracked on `data`),
//      commit, push. If another run's push landed on `data` between
//      steps 2 and 5, this push is rejected as non-fast-forward; steps
//      2-5 then retry from a fresh fetch (this run's own step-1 results
//      are held in memory, so nothing already captured is lost).
//
// Usage: node merge-and-commit-cache.mjs
// Run from within pipeline/, after run-geocode-backfill.mjs has written
// geocode-cache.json / suspicious-shifts.json / counts-snapshot.json
// locally.

import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { mergeCaches, mergeSuspiciousShifts, readJsonTolerant, saveCacheAtomic } from './cache.mjs';

const CACHE_PATH = './geocode-cache.json';
const LOG_PATH = './suspicious-shifts.json';
const COUNTS_SNAPSHOT_PATH = './counts-snapshot.json';
const BRANCH = 'data';
const MAX_PUSH_ATTEMPTS = 3;
const RETRY_DELAY_MS = 2000;

function run(cmd) {
  return execSync(cmd, { encoding: 'utf-8' });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Distinguishes "remote moved, retry" from a real failure (auth, network,
// etc) that retrying can't fix.
function isPushConflict(err) {
  const text = `${err.stderr || ''} ${err.message || ''}`.toLowerCase();
  return ['rejected', 'non-fast-forward', 'fetch first', 'stale info'].some((s) => text.includes(s));
}

async function main() {
  // Step 1: capture this run's own results before touching git at all.
  const localCache = await readJsonTolerant(CACHE_PATH, {});
  const localShifts = await readJsonTolerant(LOG_PATH, []);
  // counts-snapshot.json is tracked on `data`, so the step-2 reset below
  // reverts the copy run-geocode-backfill.mjs just wrote back to the
  // committed version. Hold this run's in memory so step 5 can restore it.
  const localSnapshot = await readJsonTolerant(COUNTS_SNAPSHOT_PATH, null);

  console.log(`Local run: ${Object.keys(localCache).length} cache entries, ${localShifts.length} suspicious shifts.`);

  for (let attempt = 1; attempt <= MAX_PUSH_ATTEMPTS; attempt++) {
    const pushed = await mergeAndPush({ localCache, localShifts, localSnapshot });
    if (pushed) return;

    if (attempt === MAX_PUSH_ATTEMPTS) {
      throw new Error(`git push rejected after ${MAX_PUSH_ATTEMPTS} attempts; remote kept moving.`);
    }
    console.warn(`Push rejected (remote moved); retrying from a fresh fetch (attempt ${attempt + 1}/${MAX_PUSH_ATTEMPTS})...`);
    await sleep(RETRY_DELAY_MS);
  }
}

// One attempt at steps 2-5: reconcile against the current remote and try to
// push. Returns true on success (including "nothing to push"), false if the
// push was rejected because the remote moved and should be retried.
async function mergeAndPush({ localCache, localShifts, localSnapshot }) {
  // Step 2: bring the working tree to exactly what's on the remote.
  run(`git fetch origin ${BRANCH}`);
  run(`git reset --hard origin/${BRANCH}`);

  // Step 3: read the remote's versions (git reset just placed them on
  // disk, if they exist; a brand-new repo before the first-ever backfill
  // won't have them yet, which readJsonTolerant handles gracefully).
  const remoteCache = await readJsonTolerant(CACHE_PATH, {});
  const remoteShifts = await readJsonTolerant(LOG_PATH, []);

  console.log(`Remote state: ${Object.keys(remoteCache).length} cache entries, ${remoteShifts.length} suspicious shifts.`);

  // Step 4: merge at the data level.
  const mergedCache = mergeCaches(localCache, remoteCache);
  const mergedShifts = mergeSuspiciousShifts(localShifts, remoteShifts);

  console.log(`Merged: ${Object.keys(mergedCache).length} cache entries, ${mergedShifts.length} suspicious shifts.`);

  // Step 5: write the merged cache/shifts and restore this run's
  // snapshot (step-2's `git reset --hard` reverted the on-disk copy to
  // the committed version; counts-snapshot.json isn't merged, it's just
  // this run's own fresh per-run snapshot). Then add whichever of the
  // three files exist; a missing file means an earlier step failed
  // partway through, which shouldn't block committing whatever did make it.
  await saveCacheAtomic(CACHE_PATH, mergedCache);
  await saveCacheAtomic(LOG_PATH, mergedShifts);
  if (localSnapshot?.restaurantCount != null) {
    await saveCacheAtomic(COUNTS_SNAPSHOT_PATH, localSnapshot);
  }

  for (const path of [CACHE_PATH, LOG_PATH, COUNTS_SNAPSHOT_PATH]) {
    try {
      await readFile(path);
      run(`git add ${path}`);
    } catch {
      console.warn(`Skipping ${path}; not found on disk.`);
    }
  }

  // A successful run restores a snapshot with a fresh generatedAt above,
  // so this is almost always non-empty by design; it's kept as a safety
  // net rather than a real gate, since diff --quiet across all three
  // still correctly no-ops the case where an earlier step failed and
  // nothing actually changed.
  let hasChanges = false;
  try {
    run('git diff --cached --quiet');
  } catch {
    hasChanges = true; // non-zero exit from `git diff --quiet` means there IS a diff
  }

  if (!hasChanges) {
    console.log('No changes to commit after merge.');
    return true;
  }

  run(`git commit -m "chore: update geocode cache and counts snapshot [automated]"`);

  try {
    run(`git push origin HEAD:${BRANCH}`);
  } catch (err) {
    if (!isPushConflict(err)) throw err;
    return false;
  }

  console.log('Pushed merged cache successfully.');
  return true;
}

main().catch((err) => {
  // A failure here should be loud: if the merge/push genuinely fails,
  // that run's results stay only on the (soon-to-be-destroyed) runner
  // disk, same as the original bug. Surfacing it clearly matters so it
  // doesn't silently repeat.
  console.error('merge-and-commit-cache failed:', err.message);
  process.exit(1);
});
