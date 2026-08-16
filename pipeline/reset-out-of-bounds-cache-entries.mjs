// reset-out-of-bounds-cache-entries.mjs
//
// ONE-OFF cleanup script. Run once after deploying the scoring.mjs fix.
//
// Scans geocode-cache.json for entries marked "verified" whose resolved
// coordinate falls outside the NYC bounding box -- these were accepted
// under the old scoring logic, which skipped the distance-from-DOHMH
// sanity check entirely whenever DOHMH's own coordinate was missing or
// invalid (see scoring.mjs history). Resets each one to "pending" so
// run-geocode-backfill.mjs's normal needsResolution() check picks them
// up and re-geocodes them under the corrected scoring logic on its next
// scheduled run -- without needing to reprocess the entire cache (and
// burn the whole daily LocationIQ quota) via a RESOLVER_VERSION bump.
//
// Usage: node reset-out-of-bounds-cache-entries.mjs [path-to-geocode-cache.json]

import { loadCache, saveCacheAtomic } from "./cache.mjs";
import { isWithinNYC } from "./normalize.mjs";

const CACHE_PATH = process.argv[2] || "./geocode-cache.json";

async function main() {
  const cache = await loadCache(CACHE_PATH);
  const camisIds = Object.keys(cache);

  console.log(
    `Loaded ${camisIds.length} cache entr${camisIds.length === 1 ? "y" : "ies"} from ${CACHE_PATH}.`,
  );

  if (camisIds.length === 0) {
    console.log(
      "Cache is empty or the file wasn't found at this path -- nothing to check. " +
        "If you expected entries here, confirm you're running this from the right " +
        "directory and that your local branch is up to date (git pull).",
    );
    return;
  }

  let resetCount = 0;

  for (const camis of camisIds) {
    const entry = cache[camis];

    if (entry.status !== "verified" || !entry.resolved) {
      continue;
    }

    const { lat, lon } = entry.resolved;

    if (!isWithinNYC(lat, lon)) {
      console.log(
        `Resetting ${camis}: verified coordinate (${lat}, ${lon}) is outside NYC bounds.`,
      );

      cache[camis] = {
        ...entry,
        status: "pending",
        resolved: null,
        matchType: null,
        resolvedVia: null,
        distanceFromDohmh: null,
        reason: "reset_outside_nyc_bounds",
        resolvedAt: null,
      };

      resetCount += 1;
    }
  }

  if (resetCount === 0) {
    console.log("No out-of-bounds verified entries found. Nothing to reset.");
    return;
  }

  await saveCacheAtomic(CACHE_PATH, cache);

  console.log(
    `\nDone. Reset ${resetCount} out-of-bounds entr${resetCount === 1 ? "y" : "ies"} to "pending" ` +
      `out of ${camisIds.length} total cache entries. These will be re-geocoded on the next backfill run.`,
  );
}

main().catch((err) => {
  console.error("Cache cleanup failed:", err);
  process.exit(1);
});
