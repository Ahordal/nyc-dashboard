# NYC Restaurant Inspection Dashboard

An interactive map and analytics dashboard for exploring NYC DOHMH restaurant inspection data — built with Vite, React, TypeScript, the ArcGIS Maps SDK, and Recharts.

**Live site:** [nyc-teal.vercel.app](https://nyc-teal.vercel.app)

## Features

### Map & Visualization
- **Interactive Web Map:** High-performance mapping of NYC restaurants, color-coded by official DOHMH inspection grades (A, B, C, N, P, Z) and operating status.
- **Hover Cards:** At close-in zoom levels, hovering a restaurant point shows a lightweight card with its name, grade, and score, without needing to click into the full details panel.
- **Restaurant Name Labels:** Zooming in further reveals persistent name labels directly on the map canvas.
- **Dynamic KPIs & Mapview Statistics:** Real-time metrics panel calculating at-a-glance restaurant counts (Total, A, B, C, Pending, Closed) scoped directly to the current map bounding box.
- **Grade Breakdown Chart:** Interactive Recharts-powered donut chart providing a visual proportional breakdown of graded restaurants within the active map view.
- **Cross-Component Interactivity:** Synchronized hover states and selection indicators linking map points, list items, and chart data seamlessly.

### Search & Filtering
- **Smart Dataset Search:** Custom client-side search index that supports queries by name, cuisine, or address, featuring automatic diacritic stripping, corporate suffix removal, and street abbreviation expansion (e.g., matching "St" to "Street").
- **Viewport-Scoped List:** A dynamic Restaurant List panel that updates automatically as the map moves, showing name, address, cuisine type, last inspection date, and recent score/grade.
- **Multi-Parameter Filtering & Sorting:** Quick-filter combinations by grade and borough (e.g., "Grade A, Brooklyn"), alongside robust list sorting (by date, name, cuisine, grade, or score in ascending/descending order).
- **Shareable Views:** Active grade/borough filters, search query, and the selected restaurant are all synced to the URL, so a link can be copied or bookmarked straight back to that exact view.

### Details & History
- **On-Demand Restaurant Profiles:** Lazy-loaded details panel that fetches individual historical data (like CAMIS and exact addresses) only when a restaurant is selected, keeping the initial application payload extremely lightweight. 
- **Operational Status:** The details panel displays the restaurant's current operational status as "Open", "Closed by DOHMH", or "Unknown". The "Open" status strictly reflects the dataset's recorded status rather than live business operations, while "Closed by DOHMH" indicates the most recent inspection resulted in a closure.
- **Interactive Score Over Time:** Time-series charts plotting historical inspection results to visualize long-term compliance trends.
- **Comprehensive Inspection Reports:** Detailed breakdowns of past inspections including the inspection type, DOHMH action taken, and specific violation codes. 
- **Report Badges:** Inspection reports utilize visual UI badges to contextually categorize individual violations as "Critical" (higher risk to food safety) or "Not Critical" (general sanitation and maintenance). Additional badges display the official NYC violation code, the broader violation category, and whether that specific historical inspection resulted in a "Closed by DOHMH" status.

### Data Integrity & UI
- **Automated Geocoding Verification:** A persistent, background-cached LocationIQ pipeline that verifies and corrects raw DOHMH coordinates against actual house numbers and street addresses.
- **Location Status Badges:** Visual indicators across the dashboard that instantly communicate a restaurant's geocoding confidence level (**Verified**, **Unverified**, or **Pending**).

## Architecture

The project is split across two branches:

- **`main`** — the dashboard app (this code). `public/data/` is generated fresh on every build and is not committed.
- **`data`** — an orphan branch holding only the geocode cache (`pipeline/geocode-cache.json`) and related pipeline state. Kept separate so scheduled cache updates never conflict with in-progress dashboard work.

The map view (`MapView.tsx`) is lazy-loaded via a dynamic `import()`, with a lightweight `MapViewSkeleton` shown while it loads — the ArcGIS SDK is the heaviest single dependency in the app, so this keeps it out of the initial bundle.

## Data Pipeline

`pipeline/fetch-inspection.mjs` runs as part of every build (`npm run build`) — whenever `main` is pushed, not on a fixed schedule — and pulls the full NYC DOHMH Restaurant Inspection Results dataset from the Socrata API, producing:

- `public/data/latest-inspections.geojson` — one point per restaurant, its most recent scored inspection, drives the map/KPIs/grade chart
- `public/data/history/{camis}.json` — per-restaurant scored inspection history, fetched on demand when a restaurant is selected
- `public/data/violation-codes.json` — violation code → description/category lookup
- `public/data/dashboard-meta.json` — builds dashboard metadata

Geocoding (via LocationIQ, with a house-number-match filter against DOHMH's own coordinates to confirm accuracy) happens separately, **not** during the build:

- `.github/workflows/geocode-backfill.yml` runs daily on a fixed schedule (approximately 0500 ADT), resolving new/changed restaurants against LocationIQ up to a cap of ~4,900/day (under the free-tier limit), commits the updated cache to the `data` branch, and triggers a Vercel rebuild. That cap is really only reached during the initial backfill (about a week to cover the full dataset); afterward, daily runs only need to resolve the small trickle of new/changed restaurants and use a fraction of the quota.
- `fetch-inspection.mjs` only ever reads whatever's already committed on `data` — it never calls LocationIQ itself
- `.github/workflows/reset-out-of-bounds-cache.yml` is a one-off cleanup workflow for cache entries that were incorrectly accepted under an older scoring pass

### Pipeline Mechanics & Data Processing

**Scale and Volume Validation**
* The pipeline requests data from the Socrata API in paginated batches of 50,000 records to handle the full dataset.
* To guarantee data integrity across paginated requests, the total number of fetched rows is strictly validated against Socrata's `count(*)` aggregate.
* If the final fetched row count does not perfectly match the expected dataset count, the script intentionally aborts to prevent writing an incomplete dataset.

**Data Cleaning and Transformation**
* Restaurants lacking any scored inspections, including those using Socrata's "1900-01-01T00:00:00.000" placeholder date, are completely excluded from the processed output.
* If a restaurant's most recent visit was an administrative check lacking a score, the pipeline automatically falls back to their last valid scored inspection.
* Coordinate points are verified against a strict NYC bounding box (latitudes 40.4 to 41.0, longitudes -74.3 to -73.65) to catch illogical coordinates like (0,0) or swapped values.
* Text fields undergo deep normalization for the search index, which includes stripping diacritics, dropping corporate suffixes (like "INC" or "LLC"), and explicitly expanding abbreviations (e.g., expanding "ST" to both "STREET" and "SAINT").

**Dynamic Delta-Tracking**
* `dashboard-meta.json` calculates `restaurantDelta` and `inspectionDelta` metrics by diffing current processing totals against the `counts-snapshot.json` baseline committed daily by the geocode backfill workflow.
* If no baseline snapshot exists yet, the delta values gracefully return as `null` rather than displaying inaccurate zero-change metrics.

**Error Handling and Fallbacks**
* Network requests to the Socrata API utilize an exponential backoff strategy, automatically retrying up to four times for transient server errors (429, 500, 502, 503, and 504 status codes).
* If the `geocode-cache.json` file is missing prior to the first backfill run, the system gracefully falls back to using the default DOHMH coordinates and assigns the location a "pending" status.
* If the local CSV containing violation categories fails to load or parse, the script catches the error and assigns affected violations an "Uncategorized" fallback label to ensure the build completes successfully.

### Geocoding & Location Resolution

**API Handling and Quota Management**
* The pipeline acts as a wrapper around the LocationIQ API and enforces a strict 1,000ms delay between calls to safely stay under per-second rate limits.
* It tracks daily API usage with a default limit of 4,900 requests, automatically stopping the backfill loop when the quota is exhausted so the remainder can be processed during the next run. In practice this cap is only actually reached during the initial backfill; once the dataset is fully resolved, daily runs use only a fraction of it.
* If a 429 rate-limit error is encountered, the script throws a custom `RateLimitedError` to immediately halt the entire run, preventing wasted processing time and further rejected requests.

**Query Optimization**
* The script constructs targeted search queries using the restaurant's business name, building number, street, borough, and ZIP code.
* To handle Queens-style addresses, it automatically generates a secondary fallback query with hyphens removed from the building number.
* To conserve API quota and avoid unnecessary rate-limit delays, this secondary query is skipped completely if the original building string did not contain a hyphen.

**Cache Management and Synchronization**
* Each processed restaurant is assigned a specific cache status: **`verified`** if an acceptable LocationIQ match is found, **`unverified`** if the API ran cleanly but no candidate passed the strict matching criteria, or **`pending`** if the request failed due to rate limits or API errors.
* The system saves the cache atomically (by writing to a temporary file and instantly renaming it) every 25 processed items to prevent file corruption in the event of a crash.
* Cache entries are stamped with a `RESOLVER_VERSION` (currently version 1). If the address matching rules are updated and this version is bumped, the system knows to invalidate the cache and automatically force a re-geocode.
* To prevent silent data loss caused by overlapping remote states, a dedicated script handles a safe reconcile-then-push flow targeting the `data` branch.
* This script resets the working tree to match the remote `data` branch, reads both the local and remote cache files, and merges them structurally at the JSON level. 
* If a restaurant's status shifts more than 100 meters from its DOHMH-reported location, the entry is flagged and written to `suspicious-shifts.json` for manual review rather than silently accepted.

---

### Key Pipeline Files

| File | Purpose |
|---|---|
| `fetch-inspection.mjs` | Main build-time entry point; fetches + shapes the dataset |
| `run-geocode-backfill.mjs` | Only place LocationIQ is called; run by the scheduled Action |
| `backfill-core.mjs` | Runs the main geocoding loop, manages API quotas, and saves incremental progress |
| `backfill.mjs` | Local test entry point for running the geocoding pipeline manually against a static JSON file |
| `resolve.mjs` | Orchestrates single-restaurant resolution, combining network calls, scoring, and quota checks |
| `geocode.mjs` | Thin wrapper around LocationIQ API; makes HTTP calls and handles rate-limit delays |
| `cache.mjs` | Geocode cache load/save logic and atomic writing capabilities |
| `scoring.mjs` | Geocode result confidence scoring and validation logic |
| `normalize.mjs` | Address display formatting and search token normalization |
| `merge-and-commit-cache.mjs` | Safely merges a backfill run's results into the `data` branch and pushes |
| `violation-categories.csv` | Local mapping of violation codes to plain-text categories |
| `reset-out-of-bounds-cache-entries.mjs` | One-off script resetting cache entries with out-of-bounds coordinates back to `pending` for re-resolution |

## Testing

Two independent suites, run separately and both wired into `.github/workflows/test.yml` on every pull request and push to `main`.

### Pipeline (`node:test`)

The geocoding pipeline is rigorously verified using Node's native `node:test` runner, with no external testing library.

* **Cache Integrity:** Tests in `cache.test.mjs` execute against real temporary files on disk to confirm that atomic writes work safely and that corrupted JSON files do not crash the application.
* **Merge Conflicts:** `merge.test.mjs` simulates overlapping dataset commits, verifying that final remote results are never overwritten by incomplete or pending local runs (a regression test for a known data loss incident).
* **Rate Limiting:** `rate-limit.test.mjs` verifies that a 429 response is caught as a distinct `RateLimitedError` (never treated as a generic failure or an "unverified" match), and that it halts the entire backfill run immediately rather than continuing to burn quota on restaurants that would fail the same way.
* **Scoring Logic:** Pure address scoring is tested deterministically using `fixtures.mjs`, which provides real, historically captured LocationIQ responses so logic can be tested in CI without exhausting live API quota.
* **Local Sandboxing:** A dedicated `backfill.mjs` script (see Key Pipeline Files above) allows developers to safely run the geocoding logic against a static JSON file of restaurants (`real-test-restaurants.json`) for manual regression testing, separately from the automated suite below.

| File | Purpose |
|---|---|
| `cache.test.mjs` | Native unit tests verifying atomic file writing, corruption recovery, and status logic |
| `merge.test.mjs` | Native unit tests verifying remote vs. local cache merge logic and conflict resolution |
| `normalize.test.mjs` | Native unit tests verifying address matching and display-formatting logic |
| `rate-limit.test.mjs` | Native unit tests verifying a 429 response halts the backfill run safely, without burning quota on further requests |
| `scoring.test.mjs` | Native unit tests verifying geocode candidate scoring and match/reject decisions against real captured responses |
| `fixtures.mjs` | Captured LocationIQ API responses used for deterministic, offline testing |
| `real-test-restaurants.json` | Static sample dataset used by `backfill.mjs` for local manual testing |

### Frontend (Vitest)

Frontend logic is tested with Vitest, colocated with the source it covers (`src/**/*.test.{ts,tsx}`). Coverage so far is limited to pure logic — grade categorization and the ArcGIS query/where-clause builders — since those are exactly where a hand-mirrored SQL twin of the same precedence logic (`CATEGORY_CLAUSES` in `mapQueries.ts` vs. `getGradeCategory()`) can silently drift out of sync. Component, hook, and integration tests (e.g. `MapView.tsx`, `useUrlSync`) aren't set up yet — they'd need mocking the ArcGIS SDK.

| File | Purpose |
|---|---|
| `src/utils/gradeCategory.test.ts` | Verifies grade-category precedence: closures win over grade, the uninspected sentinel, administrative Z/P/N grades, null-score handling, and the A/B/C score-band boundaries |
| `src/queries/mapQueries.test.ts` | Verifies search-query normalization/escaping, borough+search `definitionExpression` combination, and that the grade `WHERE`-clause builders match `CATEGORY_CLAUSES` |

### Scripts

| Command | Action |
|---|---|
| `npm test` | Run the pipeline test suite (`node --test pipeline/*.test.mjs`) |
| `npm run test:frontend` | Run the frontend test suite (`vitest run`) |
| `npm run test:frontend:watch` | Run the frontend test suite in watch mode |

## Tech Stack

### Frontend
- **[Vite](https://vitejs.dev/) + [React 19](https://react.dev/) + TypeScript:** Core application framework and bundler.
- **[ArcGIS Maps SDK for JavaScript](https://developers.arcgis.com/javascript/):** High-performance rendering for the interactive restaurant map.
- **[Recharts](https://recharts.org/):** Data visualization library powering the grade breakdown donut chart and historical score time-series.
- **[Font Awesome](https://fontawesome.com/):** UI iconography.

### Data Pipeline & Automation
- **Node.js:** Powers the custom build-time data fetching, coordinate validation, and pure-logic geocoding scripts.
- **GitHub Actions:** Runs the daily LocationIQ geocoding backfill and handles safe, automated cache commits back to the repository. The Socrata data fetch itself runs as part of every Vercel build, not on a GitHub Actions schedule.
- **Data Sources:** [NYC DOHMH Restaurant Inspection Results](https://opendata.cityofnewyork.us/) via the Socrata API, with location verification powered by [LocationIQ](https://locationiq.com/).

### Hosting
- **[Vercel](https://vercel.com/):** Application hosting and automated continuous deployment triggered by the pipeline's daily updates.

## Getting started

```bash
npm install
npm run dev
```

Requires Node ≥ 22.12.0.

### Environment variables

Create a `.env` file in the project root:

| Variable | Used by | Notes |
|---|---|---|
| `PUBLIC_ARCGIS_API_KEY` | `src/components/MapView.tsx` | ArcGIS map rendering |
| `LOCATIONIQ_API_KEY` | `pipeline/run-geocode-backfill.mjs` | Only needed to run the geocode backfill locally |
| `SOCRATA_APP_TOKEN` | `pipeline/fetch-inspection.mjs` | Optional; raises the Socrata API rate limit |

Note: `import.meta.env` in Vite only exposes `VITE_`-prefixed vars by default — `PUBLIC_ARCGIS_API_KEY` is explicitly added via `envPrefix` in `vite.config.ts`.

### Scripts

| Command | Action |
|---|---|
| `npm run dev` | Start the local development server |
| `npm run build` | Run the data pipeline, then build the frontend for production |
| `npm run preview` | Preview a production build locally|

See [Testing](#testing) for the `npm test` / `npm run test:frontend` scripts.

## Deployment

Running `npm run build` regenerates the `public/data/` directory directly from
live DOHMH data on every build, ensuring no static dataset files ever need to be
committed to the `main` branch.

To keep the dashboard fresh, the scheduled `geocode-backfill` Action (and `reset-out-of-bounds-cache`, when manually triggered) automatically triggers a Vercel rebuild via a Deploy Hook (configured as a `VERCEL_DEPLOY_HOOK_URL` repository secret) whenever the cache is updated.

## Known limitations

- Aggregate stats are scoped to the current map view rather than an independent citywide/borough breakdown (achievable today via zoom/filters)
- Map hover cards and name labels rely on mouse hover, with no touch equivalent yet; the dashboard is not currently optimized for mobile/touch devices

## Credits

Built by [Alex Hordal](https://alexhordal.ca). Data from [NYC Open Data](https://opendata.cityofnewyork.us/).

&copy; Alex Hordal 2026