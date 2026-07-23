// verify-has-history.mjs
//
// Sanity check: finds one restaurant with has_history: true and one with
// has_history: false, and confirms a history/{camis}.json file actually
// exists for the first and does NOT exist for the second. Run this from
// the pipeline/ folder after running fetch-inspections.mjs.
//
// Usage: node verify-has-history.mjs

import { readFile, access } from "node:fs/promises";
import path from "node:path";

const OUTPUT_DIR = path.resolve(import.meta.dirname, "../public/data");
const HISTORY_DIR = path.join(OUTPUT_DIR, "history");

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const raw = await readFile(path.join(OUTPUT_DIR, "latest-inspections.geojson"), "utf-8");
  const geojson = JSON.parse(raw);

  const withHistory = geojson.features.find((f) => f.properties.has_history === true);
  const withoutHistory = geojson.features.find((f) => f.properties.has_history === false);

  console.log(`Total features: ${geojson.features.length}`);

  if (withHistory) {
    const camis = withHistory.properties.camis;
    const filePath = path.join(HISTORY_DIR, `${camis}.json`);
    const exists = await fileExists(filePath);
    console.log(
      `\n${withHistory.properties.name} (camis ${camis}, has_history: true)`
    );
    console.log(
      exists
        ? `PASS: history/${camis}.json exists`
        : `FAIL: expected history/${camis}.json to exist, but it doesn't`
    );
  } else {
    console.log("\nNo has_history: true restaurant found -- unexpected, worth investigating.");
  }

  if (withoutHistory) {
    const camis = withoutHistory.properties.camis;
    const filePath = path.join(HISTORY_DIR, `${camis}.json`);
    const exists = await fileExists(filePath);
    console.log(
      `\n${withoutHistory.properties.name} (camis ${camis}, has_history: false)`
    );
    console.log(
      !exists
        ? `PASS: history/${camis}.json correctly does not exist`
        : `FAIL: expected no file, but history/${camis}.json exists`
    );
  } else {
    console.log("\nNo has_history: false restaurant found -- every restaurant has history, which is plausible but worth a second look.");
  }
}

main().catch((err) => {
  console.error("Verification script failed:", err);
  process.exit(1);
});
