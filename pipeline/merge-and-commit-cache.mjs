// merge-and-commit-cache.mjs
//
// Safe reconcile-then-push, replacing naive git add/commit/push: a run's
// results must never be silently lost when the remote moved since
// checkout (overlapping run, manual push, anything) - the exact failure
// that lost run #4's results on 2026-08-10.
//
// Targets `data` (cache/snapshot files live there, not `main`; this
// script predates that split). Pushes an incremental commit rather than
// force-replacing an orphan branch, so there's real history to merge against.
//
// Sequence:
//   1. Read this run's local cache/log/snapshot into memory.
//   2. git fetch + reset --hard origin/<branch>: working tree now matches
//      remote exactly (in-memory data from step 1 is untouched).
//   3. Read the (now-reset) remote versions.
//   4. Merge local + remote at the DATA level (cache.mjs), never a raw
//      git text merge - that could corrupt JSON or pick one side whole.
//   5. Write the merged result, restore counts-snapshot.json (corrected
//      for any restaurant whose count-eligibility changed in the merge),
//      commit, push. A non-fast-forward rejection (another run landed on
//      `data` first) retries steps 2-5 from a fresh fetch - step-1 data
//      stays in memory, so nothing already captured is lost.
//
// Usage: node merge-and-commit-cache.mjs, from pipeline/, after
// run-geocode-backfill.mjs has written its output files locally.

import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { mergeCaches, mergeSuspiciousShifts, readJsonTolerant, saveCacheAtomic } from './cache.mjs';
import { isWithinNYC } from '../shared/nycBounds.mjs';

const CACHE_PATH = './geocode-cache.json';
const LOG_PATH = './suspicious-shifts.json';
const COUNTS_SNAPSHOT_PATH = './counts-snapshot.json';
// Restaurants whose DOHMH coordinate is invalid - the only ones whose
// count depends on cache state (see findRestaurantsWithInvalidDohmhCoords).
// Never committed to `data`, only read here to correct the snapshot.
const DOHMH_INVALID_CAMIS_PATH = './dohmh-invalid-camis.json';
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

export function countVerifiedInBounds(cache, camisList) {
  let count = 0;
  for (const camis of camisList) {
    const entry = cache[camis];
    if (entry?.status === 'verified' && entry.resolved && isWithinNYC(entry.resolved.lat, entry.resolved.lon)) {
      count += 1;
    }
  }
  return count;
}

// restaurantCount only reflects the pre-merge local cache; a restaurant
// only counts once it has a verified, in-bounds entry. If the merge
// changed that for any DOHMH-invalid-coordinate restaurant, correct the
// snapshot to match what's actually being committed.
export function correctSnapshotForMerge(snapshot, localCache, mergedCache, invalidDohmhCamis) {
  if (!snapshot || invalidDohmhCamis.length === 0) return snapshot;

  const correction =
    countVerifiedInBounds(mergedCache, invalidDohmhCamis) - countVerifiedInBounds(localCache, invalidDohmhCamis);
  if (correction === 0) return snapshot;

  console.warn(
    `Correcting restaurant count by ${correction} after merge (cache differed for DOHMH-invalid-coordinate restaurants).`,
  );

  return {
    ...snapshot,
    restaurantCount: snapshot.restaurantCount + correction,
    restaurantDelta: snapshot.restaurantDelta != null ? snapshot.restaurantDelta + correction : null,
  };
}

async function main() {
  // Step 1: capture this run's own results before touching git at all.
  const localCache = await readJsonTolerant(CACHE_PATH, {});
  const localShifts = await readJsonTolerant(LOG_PATH, []);
  // Tracked on `data`, so the step-2 reset reverts run-geocode-backfill.mjs's
  // fresh copy - hold it in memory so step 5 can restore it.
  const localSnapshot = await readJsonTolerant(COUNTS_SNAPSHOT_PATH, null);
  const invalidDohmhCamis = await readJsonTolerant(DOHMH_INVALID_CAMIS_PATH, []);

  console.log(`Local run: ${Object.keys(localCache).length} cache entries, ${localShifts.length} suspicious shifts.`);

  for (let attempt = 1; attempt <= MAX_PUSH_ATTEMPTS; attempt++) {
    const pushed = await mergeAndPush({ localCache, localShifts, localSnapshot, invalidDohmhCamis });
    if (pushed) return;

    if (attempt === MAX_PUSH_ATTEMPTS) {
      throw new Error(`git push rejected after ${MAX_PUSH_ATTEMPTS} attempts; remote kept moving.`);
    }
    console.warn(`Push rejected (remote moved); retrying from a fresh fetch (attempt ${attempt + 1}/${MAX_PUSH_ATTEMPTS})...`);
    await sleep(RETRY_DELAY_MS);
  }
}

// One attempt at steps 2-5. Returns true on success (including "nothing
// to push"), false if rejected because the remote moved - caller retries.
async function mergeAndPush({ localCache, localShifts, localSnapshot, invalidDohmhCamis }) {
  // Step 2: bring the working tree to exactly what's on the remote.
  run(`git fetch origin ${BRANCH}`);
  run(`git reset --hard origin/${BRANCH}`);

  // Step 3: read the remote's versions (readJsonTolerant handles a
  // brand-new repo with no prior backfill gracefully).
  const remoteCache = await readJsonTolerant(CACHE_PATH, {});
  const remoteShifts = await readJsonTolerant(LOG_PATH, []);

  console.log(`Remote state: ${Object.keys(remoteCache).length} cache entries, ${remoteShifts.length} suspicious shifts.`);

  // Step 4: merge at the data level.
  const mergedCache = mergeCaches(localCache, remoteCache);
  const mergedShifts = mergeSuspiciousShifts(localShifts, remoteShifts);

  console.log(`Merged: ${Object.keys(mergedCache).length} cache entries, ${mergedShifts.length} suspicious shifts.`);

  const correctedSnapshot = correctSnapshotForMerge(localSnapshot, localCache, mergedCache, invalidDohmhCamis);

  // Step 5: write the merged cache/shifts and this run's own snapshot
  // (not merged, just corrected above) - the reset wiped the on-disk
  // copies. Add whichever files exist; a missing one means an earlier
  // step failed partway, which shouldn't block committing the rest.
  await saveCacheAtomic(CACHE_PATH, mergedCache);
  await saveCacheAtomic(LOG_PATH, mergedShifts);
  if (correctedSnapshot?.restaurantCount != null) {
    await saveCacheAtomic(COUNTS_SNAPSHOT_PATH, correctedSnapshot);
  }

  for (const path of [CACHE_PATH, LOG_PATH, COUNTS_SNAPSHOT_PATH]) {
    try {
      await readFile(path);
      run(`git add ${path}`);
    } catch {
      console.warn(`Skipping ${path}; not found on disk.`);
    }
  }

  // Almost always non-empty by design (fresh generatedAt every run) -
  // this is a safety net, not a real gate. Still correctly no-ops if an
  // earlier step failed and nothing actually changed.
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

// Only runs when invoked directly, not when imported by a test - mirrors
// run-geocode-backfill.mjs. Without it, importing this module's helpers
// for testing would run main() for real: git fetch/reset/push.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    // Loud on purpose: a genuine failure here strands results on the
    // soon-to-be-destroyed runner disk, same as the original bug.
    console.error('merge-and-commit-cache failed:', err.message);
    process.exit(1);
  });
}
