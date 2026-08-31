// prebuild.mjs
//
// Runs automatically before `npm run build`. Pulls the committed
// geocode cache and counts snapshot down from the `data` branch so
// fetch-inspection.mjs can read them without checking the branch out.
//
// Best-effort: a download failure clears any stale local copy, logs a
// warning, and lets the build continue (fetch-inspection.mjs runs fine
// with no cache, it just emits un-geocoded output). Replaces a
// curl/`|| rm -f` shell line that didn't run on Windows and swallowed
// every failure silently.

import { rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const RAW_BASE =
  'https://raw.githubusercontent.com/Ahordal/nyc-dashboard/data/pipeline';

const FILES = ['geocode-cache.json', 'counts-snapshot.json'];

const PIPELINE_DIR = fileURLToPath(new URL('.', import.meta.url));

/**
 * Downloads one file from the `data` branch to <destDir>/<name>. On any
 * failure, removes a stale local copy and logs a warning; never throws.
 *
 * @param {string} name - File name, relative to pipeline/ on both ends
 * @param {object} [opts]
 * @param {string} [opts.destDir] - Where to write (defaults to pipeline/)
 * @param {typeof fetch} [opts.fetchImpl] - Injectable for tests
 * @returns {Promise<boolean>} true if the file was written
 */
export async function seedFile(name, { destDir = PIPELINE_DIR, fetchImpl = fetch } = {}) {
  const dest = join(destDir, name);
  try {
    const res = await fetchImpl(`${RAW_BASE}/${name}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    writeFileSync(dest, await res.text());
    return true;
  } catch (err) {
    rmSync(dest, { force: true });
    console.warn(
      `prebuild: could not fetch ${name} from data branch (${err.message}); continuing without it`,
    );
    return false;
  }
}

export async function seedFromDataBranch(opts) {
  await Promise.all(FILES.map((name) => seedFile(name, opts)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await seedFromDataBranch();
}
