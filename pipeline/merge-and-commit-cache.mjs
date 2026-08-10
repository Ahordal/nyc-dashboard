// merge-and-commit-cache.mjs
// Replaces a naive "git add / commit / push" with a safe reconcile-then-push
// flow, so a run's geocoding results can never be silently lost if the
// remote has moved on since checkout (an overlapping run, a manual push of
// unrelated frontend changes, anything) -- the exact failure mode that lost
// run #4's results on 2026-08-10.
//
// Sequence:
//   1. Read THIS run's local cache/log files into memory (already on disk,
//      written by backfill-core.mjs before this script runs).
//   2. git fetch + git reset --hard origin/<branch> -- discards this run's
//      own uncommitted git state (NOT the in-memory data from step 1) and
//      brings the working tree to exactly what's on the remote right now.
//   3. Read the (now-reset) remote versions of both files.
//   4. Merge local + remote at the DATA level (cache.mjs's mergeCaches /
//      mergeSuspiciousShifts) -- never a raw git text merge, which risks
//      corrupting the JSON or silently picking one side's version wholesale.
//   5. Write the merged result, commit, push. Because the commit's parent
//      is now exactly origin/<branch>, the push is guaranteed to succeed
//      (nothing else can have moved origin between step 2 and step 5,
//      since this script does not await anything network-bound in between).
//
// Usage: node merge-and-commit-cache.mjs
// Run from within pipeline/, after run-geocode-backfill.mjs has already
// written geocode-cache.json / suspicious-shifts.json locally.

import { readFile, writeFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { mergeCaches, mergeSuspiciousShifts } from './cache.mjs';

const CACHE_PATH = './geocode-cache.json';
const LOG_PATH = './suspicious-shifts.json';
const BRANCH = 'main';

function run(cmd) {
  return execSync(cmd, { encoding: 'utf-8' });
}

async function readJsonOrDefault(path, fallback) {
  try {
    return JSON.parse(await readFile(path, 'utf-8'));
  } catch {
    return fallback;
  }
}

async function main() {
  // Step 1: capture this run's own results before touching git at all.
  const localCache = await readJsonOrDefault(CACHE_PATH, {});
  const localShifts = await readJsonOrDefault(LOG_PATH, []);

  console.log(`Local run: ${Object.keys(localCache).length} cache entries, ${localShifts.length} suspicious shifts.`);

  // Step 2: bring the working tree to exactly what's on the remote.
  run(`git fetch origin ${BRANCH}`);
  run(`git reset --hard origin/${BRANCH}`);

  // Step 3: read the remote's versions (git reset just placed them on disk,
  // if they exist -- a brand-new repo before the first-ever backfill won't
  // have them yet, which readJsonOrDefault handles gracefully).
  const remoteCache = await readJsonOrDefault(CACHE_PATH, {});
  const remoteShifts = await readJsonOrDefault(LOG_PATH, []);

  console.log(`Remote state: ${Object.keys(remoteCache).length} cache entries, ${remoteShifts.length} suspicious shifts.`);

  // Step 4: merge at the data level.
  const mergedCache = mergeCaches(localCache, remoteCache);
  const mergedShifts = mergeSuspiciousShifts(localShifts, remoteShifts);

  console.log(`Merged: ${Object.keys(mergedCache).length} cache entries, ${mergedShifts.length} suspicious shifts.`);

  // Step 5: write, commit, push.
  await writeFile(CACHE_PATH, JSON.stringify(mergedCache, null, 2), 'utf-8');
  await writeFile(LOG_PATH, JSON.stringify(mergedShifts, null, 2), 'utf-8');

  run(`git add ${CACHE_PATH} ${LOG_PATH}`);

  // Only commit if the merge actually produced a real change (e.g. this
  // run resolved nothing new AND remote already had everything local had --
  // avoids empty no-op commits).
  let hasChanges = false;
  try {
    run('git diff --cached --quiet');
  } catch {
    hasChanges = true; // non-zero exit from `git diff --quiet` means there IS a diff
  }

  if (!hasChanges) {
    console.log('No changes to commit after merge.');
    return;
  }

  run(`git commit -m "chore: update geocode cache [automated]"`);
  run(`git push origin ${BRANCH}`);
  console.log('Pushed merged cache successfully.');
}

main().catch((err) => {
  // A failure here should be loud -- if the merge/push genuinely fails,
  // that run's results stay only on the (soon-to-be-destroyed) runner disk,
  // same as the original bug. Surfacing this clearly matters so it doesn't
  // silently repeat.
  console.error('merge-and-commit-cache failed:', err.message);
  process.exit(1);
});
