# NYC Restaurant Inspection Dashboard

An interactive map and analytics dashboard for exploring NYC DOHMH restaurant inspection data — built with Vite, React, TypeScript, the ArcGIS Maps SDK, and Recharts.

**Live site:** [nyc-teal.vercel.app](https://nyc-teal.vercel.app)

## Features

### Map & Visualization
- **Interactive Web Map:** High-performance mapping of NYC restaurants, color-coded by official DOHMH inspection grades (A, B, C, N, P, Z) and operating status.
- **Hover Cards:** At close-in zoom levels, hovering a restaurant point shows a lightweight card with its name, grade, and score, without needing to click into the full details panel.
- **Dynamic KPIs & Mapview Statistics:** Real-time metrics panel calculating
  at-a-glance restaurant counts (Total, A, B, C, Pending, Uninspected, Closed) scoped
  directly to the current map bounding box.
- **Grade Breakdown Chart:** Interactive Recharts-powered donut chart providing a visual proportional breakdown of graded restaurants within the active map view.
- **Cross-Component Interactivity:** Synchronized hover states and selection indicators linking map points, list items, and chart data seamlessly.
- **Map Scale:** Bottom-left readout of the current scale denominator (1:x) that doubles as a text input — click it to type a scale and jump straight there.
- **Zoom Level:** Bottom-left readout of the current zoom level, also click-to-type for jumping to a specific level.
- **Zoom Buttons:** Top-left +/- buttons for stepping the zoom level in/out, replacing Esri's default `Zoom` widget so it matches the dashboard's own control styling.
- **Compass:** Top-left reorient-to-north button stacked below the zoom buttons, its icon passively tracking the map's current rotation (right-click-drag to rotate); disabled at true north since there's nothing to reset.
- **Scale Bar:** Bottom-right graphical bar showing ground distance in feet/miles, snapping to round values (10, 20, 50 ft ... 1, 2, 5 mi) and correcting for Web Mercator distortion via `resolution × cos(latitude)`.
- **Satellite Toggle:** Top-right button that overlays dimmed Esri World Imagery (a keyless `WebTileLayer` off `services.arcgisonline.com`, kept as the bottom operational layer) on top of the permanent dark-gray basemap, rather than swapping `map.basemap` — the basemap-styles `arcgis/imagery/*` variants need an entitlement this app's key lacks and `Basemap.fromId("satellite")` fails once `esriConfig.apiKey` is set. Each mode's labels come from its labels style split into street-name (below the restaurant markers) and place-name (above) `VectorTileLayer`s, rather than relying on Esri's composited hybrid styles, whose reference/label layers always render above every operational layer.
- Map Scale, Zoom Level, and Zoom Buttons are custom React components built directly against `view.scale`/`view.zoom`; the Scale Bar is likewise custom rather than Esri's `esri/widgets/ScaleBar`, which is deprecated.
- **Search Radius:** Top-right crosshair tool for scoping to a walkable area instead of the map viewport. Activate it, click the map to drop a center point, and concentric 0.25 / 0.50 / 1 mi rings are drawn as a `GraphicsLayer` (so the restaurant points are never spatially filtered — every dot stays visible); a segmented picker switches the active ring and the view auto-frames to it, clamped so hover cards stay live. While a point is set, the Restaurant List, KPI panel, and Grade Breakdown chart re-scope from "what's in view" to "what's inside the active ring" — computed client-side with a haversine distance against the list the sidebar already holds in memory — and map pan/zoom stops re-running the viewport query. The list gains a **Distance** column and sort field (closest-first, auto-selected while the radius is active, reverting to the previous sort field when the point is cleared), and the KPI panel's scope label switches from "in map view" to "within 0.25 mi".

### Search & Filtering
- **Smart Dataset Search:** Custom client-side search index that supports queries by name, cuisine, or address, featuring automatic diacritic stripping, corporate suffix removal, and street abbreviation expansion (e.g., matching "St" to "Street").
- **Viewport-Scoped List:** A dynamic Restaurant List panel that updates automatically as the map moves, showing name, address, cuisine type, last inspection date, and recent score/grade.
- **Multi-Parameter Filtering & Sorting:** Quick-filter combinations by grade and borough (e.g., "Grade A, Brooklyn"), alongside robust list sorting (by date, name, cuisine, grade, score, or — when a Search Radius point is set — distance, in ascending/descending order).
- **Shareable Views:** Active grade/borough filters, search query, the selected restaurant, and a placed Search Radius (centre + distance, as `?radius=<lat>,<lng>,<miles>`) are all synced to the URL, so a link can be copied or bookmarked straight back to that exact view — reloading re-drops the radius pin, redraws the rings, and re-frames the map.

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

### Accessibility

The dashboard is built to be operable by keyboard and screen reader:

- **Focus system** — one shared `--focus-ring` token drives a `:focus-visible` outline on every interactive element (native controls plus the `role="button"` / `role="tab"` / `role="option"` custom ones). The outline is suppressed only on the ArcGIS view internals (`.map-view .esri-view`), never on the custom map control buttons.
- **Restaurant explorer** is a proper ARIA tab set (`ExplorerTabs` + `src/utils/explorerTabs.ts`): `role="tablist"`/`tab`/`tabpanel`, roving `tabindex`, and Arrow/Home/End moving between tabs with wraparound (`nextTabIndex`, unit-tested).
- **Restaurant list cards** are `role="button"` with `tabindex`, an `aria-label` summary (name, grade, score, address, distance), `aria-current` for the selected card, and Enter/Space activation; keyboard focus previews the card on the map, matching the mouse-hover behaviour.
- **Sort dropdown** (`SortDropdown`) follows the APG listbox model — the open menu takes focus, Arrow/Home/End move the active option, Enter/Space commit, Escape cancels, focus returns to the trigger.
- **Info modal** (`PanelInfoModal`) traps Tab within the dialog and restores focus to the trigger on close; the score-history chart (`useChartKeyboardNav`) has full arrow-key navigation.
- Panel titles render as `<h2>`; the search field, icon-only map controls, and the grade-breakdown donut (`role="img"` with a text summary) carry accessible names; filter/sort notices announce via a polite live region.
- A `prefers-reduced-motion` media query neutralises CSS transitions and animations.

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
* Each daily geocode-backfill run records its restaurant/inspection totals to `counts-snapshot.json` on the `data` branch, along with `restaurantDelta` / `inspectionDelta` — the change from the run before it. `dashboard-meta.json` passes those five figures straight through, so the Dashboard Information panel always reflects the last daily refresh; site rebuilds from `main` pushes in between never move the numbers.
* If no prior snapshot exists yet, the deltas return as `null` (and the build falls back to its own live totals) rather than displaying an inaccurate zero-change metric.

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

Frontend logic is tested with Vitest, colocated with the source it covers (`src/**/*.test.{ts,tsx}`). Pure logic (grade categorization, the ArcGIS query/where-clause builders, the visible-restaurants query shape and grade-category filter, the map hit-test lookup, the Restaurant List's two-level sort, the Search Radius haversine helper and ring-graphics builder, and `useUrlSync`'s URL parse/serialize helpers) runs under Vitest's default `node` environment; the hook tests below drive real DOM (SVG refs, focus/keyboard events) or React effects via `@testing-library/react`'s `renderHook`, so those files opt into `jsdom` per-file with a `// @vitest-environment jsdom` docblock rather than paying that cost project-wide. `useSelectionHighlight` and `useMapHover` are tested against small hand-stubbed slices of the ArcGIS SDK (the `FeatureEffect`/`FeatureFilter` constructors, a fake layer view, a fake `MapView` exposing `on`/`hitTest`/`scale`/`container`); full component/integration tests against `MapView.tsx` itself (and the effect side of `useUrlSync`) aren't planned — they'd need a broad SDK fake that couples to MapView's imperative wiring, and jsdom can't exercise the WebGL/hit-test parts anyway.

| File | Purpose |
|---|---|
| `src/utils/gradeCategory.test.ts` | Verifies grade-category precedence: closures win over grade, the uninspected sentinel, administrative Z/P/N grades, null-score handling, and the A/B/C score-band boundaries |
| `src/queries/mapQueries.test.ts` | Verifies search-query normalization/escaping, borough+search `definitionExpression` combination, that the grade `WHERE`-clause builders match `CATEGORY_CLAUSES`, that `queryVisibleRestaurants` shapes its query as extent-vs-point+distance and pages until `exceededTransferLimit` clears, that `filterRestaurantsByGradeCategory` routes each filter label to its computed category, and that `findRestaurantGraphicHit` picks the restaurant-layer graphic out of a hit-test result |
| `src/hooks/useSelectionHighlight.test.ts` | Verifies the selected/hovered glow: the shared effect is installed with the no-selection sentinel, a selected restaurant's object ID is looked up and filtered to, selected + hovered IDs union into one filter, and clearing the selection restores the sentinel (against a stubbed `FeatureEffect`/`FeatureFilter` and fake layer view) |
| `src/hooks/useMapHover.test.ts` | Verifies pointer-move handling: a burst of moves coalesces into one trailing hit test, the hover card shows at the max scale and hides once zoomed further out, no-dot and placement-mode cases, cursor styling, `mouseleave` clearing, and that a stale hit-test response resolving after a newer one is dropped (against a fake `MapView`) |
| `src/hooks/useChartKeyboardNav.test.ts` | Verifies arrow/Home/End navigation and clamping, Enter/Space selection, Tab passthrough, focus/blur keyboard-mode transitions, and resets on new chart data or a newly selected report |
| `src/hooks/useTooltipPriority.test.ts` | Verifies the tooltip priority order (pointer hover > history preview > keyboard point > pinned selection), dot-ref registration/lookup against rendered `cx`/`cy`, and resets on new chart data |
| `src/utils/distance.test.ts` | Verifies the Search Radius haversine helper: zero distance for a point against itself, symmetry, exact along-meridian distance, and that points just inside/outside a 0.25 mi radius land on the correct side of the cutoff |
| `src/utils/searchRadiusRings.test.ts` | Verifies the ring-graphics builder: one ring + one label per radius option plus a centre pin, fills drawn largest-first, the heavier outline and bold label on the active ring only, label text/placement north of the centre |
| `src/utils/restaurantSort.test.ts` | Verifies the two-level list sort: numeric vs `localeCompare` ordering, grade-category ranking, nulls always last in both directions, the distance key (inert without a point), secondary-key tie-breaking sharing one direction, and the name-then-id stable fallback |
| `src/hooks/useUrlSync.test.ts` | Verifies the URL parse/serialize helpers: `?radius=<lat>,<lng>,<miles>` parsing with range/arity/value guards, comma-list and `id`/`camis` handling, 5-dp coordinate rounding on write, and a placed-radius round-trip |
| `src/utils/explorerTabs.test.ts` | Verifies the Explorer tab helpers: the button/panel id builders and `nextTabIndex`'s Arrow/Home/End index resolution with wraparound and a null for unhandled keys |

### Scripts

| Command | Action |
|---|---|
| `npm run test:pipeline` | Run the pipeline test suite (`node --test pipeline/*.test.mjs`) |
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
| `npm run build` | Runs `prebuild` automatically, then the data pipeline, then builds the frontend for production |
| `npm run preview` | Preview a production build locally|

See [Testing](#testing) for the `npm run test:pipeline` / `npm run test:frontend` scripts.

`prebuild` (runs automatically before `build`, not meant to be invoked directly) pulls `pipeline/geocode-cache.json` and `pipeline/counts-snapshot.json` down from the `data` branch via `curl` before `fetch-inspection.mjs` runs, since that's how the pipeline gets the committed geocode cache locally rather than checking out the branch itself.

## Deployment

Running `npm run build` regenerates the `public/data/` directory directly from
live DOHMH data on every build, ensuring no static dataset files ever need to be
committed to the `main` branch.

To keep the dashboard fresh, the scheduled `geocode-backfill` Action (and `reset-out-of-bounds-cache`, when manually triggered) automatically triggers a Vercel rebuild via a Deploy Hook (configured as a `VERCEL_DEPLOY_HOOK_URL` repository secret) whenever the cache is updated.

## Known limitations

- Aggregate stats are scoped to the current map view (or the active Search Radius ring) rather than an independent citywide/borough breakdown (achievable today via zoom/filters)
- Map hover cards and name labels rely on mouse hover, with no touch equivalent yet; the dashboard is not currently optimized for mobile/touch devices

## Credits

Built by [Alex Hordal](https://alexhordal.ca). Data from [NYC Open Data](https://opendata.cityofnewyork.us/).

&copy; Alex Hordal 2026