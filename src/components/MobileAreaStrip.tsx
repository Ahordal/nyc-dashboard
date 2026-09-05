// MobileAreaStrip.tsx
//
// Thin summary bar pinned under the app bar on phones: the restaurant
// count for the current map view (or Search Radius) and a compact
// stacked grade bar. Tapping it slides a drawer down over the map with
// the full grade-breakdown donut and the per-grade tally — the top-area
// equivalent of the bottom sheet.

import { lazy, Suspense, useId, useMemo, useRef } from "react";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUtensils, faChevronDown } from "@fortawesome/free-solid-svg-icons";

import StatsPanel from "./StatsPanel";
import ChartSkeleton from "./ChartSkeleton";
import ErrorBoundary from "./ErrorBoundary";
import ErrorFallback from "./ErrorFallback";

import { CATEGORY_COLORS } from "../utils/gradeCategory";
import { scopeGradeCounts } from "../types/gradeCounts";
import type { GradeCounts } from "../types/gradeCounts";
import type { Filters } from "../types/filters";
import type { RestaurantProperties } from "../types/restaurant";
import type { SearchRadiusMiles } from "../types/searchRadius";

const GradeChart = lazy(() => import("./GradeChart"));

const SEGMENTS: (keyof GradeCounts)[] = [
  "A",
  "B",
  "C",
  "pending",
  "uninspected",
  "closed",
];

type MobileAreaStripProps = {
  gradeCounts: GradeCounts;
  visibleRestaurants: RestaurantProperties[];
  filters: Filters;
  searchRadiusMiles: SearchRadiusMiles | null;
  // Drawer open/closed, controlled by MobileDashboard (mutually exclusive
  // with the app-bar Filters / Info drawers).
  open: boolean;
  onToggle: () => void;
};

export default function MobileAreaStrip({
  gradeCounts,
  visibleRestaurants,
  filters,
  searchRadiusMiles,
  open,
  onToggle,
}: MobileAreaStripProps) {
  const isOpen = open;
  const drawerId = useId();

  const total = useMemo(
    () => SEGMENTS.reduce((sum, key) => sum + gradeCounts[key], 0),
    [gradeCounts],
  );

  // Selecting a restaurant zooms the map hard onto it, which can briefly
  // (or, in a sparse area, lastingly) drop the visible tally to zero.
  // Keep showing the last real distribution instead of blanking out.
  const lastCountsRef = useRef(gradeCounts);
  if (total > 0) lastCountsRef.current = gradeCounts;
  const displayCounts = total > 0 ? gradeCounts : lastCountsRef.current;

  // Restrict the bar + count to the selected grades so the strip matches
  // the map, the list, and the (also-scoped) donut.
  const barCounts = scopeGradeCounts(displayCounts, filters.grades);
  const displayTotal = SEGMENTS.reduce((sum, key) => sum + barCounts[key], 0);

  return (
    <>
      <button
        type="button"
        className="mobile-area-strip"
        data-open={isOpen}
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={drawerId}
        aria-label={
          isOpen
            ? "Hide the grade breakdown"
            : "Show the grade breakdown for the current view"
        }>
        <FontAwesomeIcon
          icon={faUtensils}
          className="mobile-area-strip-icon"
          aria-hidden="true"
        />
        <span className="mobile-area-strip-count">
          {displayTotal.toLocaleString()}
        </span>
        <span className="mobile-area-strip-scope">
          {searchRadiusMiles != null ? "in radius" : "in view"}
        </span>

        <span className="mobile-area-strip-bar" aria-hidden="true">
          {SEGMENTS.map((key) => (
            <span
              key={key}
              style={{
                flexGrow: barCounts[key],
                backgroundColor: CATEGORY_COLORS[key],
              }}
            />
          ))}
        </span>

        <span className="mobile-area-strip-chevron-box">
          <FontAwesomeIcon
            icon={faChevronDown}
            className="mobile-area-strip-chevron"
            aria-hidden="true"
          />
        </span>
      </button>

      <div id={drawerId} className="mobile-area-drawer" data-open={isOpen}>
        {isOpen && (
          <div className="mobile-area-drawer-chart">
            <ErrorBoundary
              context="GradeChart"
              fallback={
                <ErrorFallback message="The grade breakdown chart failed to load." />
              }>
              <Suspense
                fallback={<ChartSkeleton label="Loading grade breakdown…" />}>
                <GradeChart
                  counts={displayCounts}
                  filters={filters}
                  searchRadiusMiles={searchRadiusMiles}
                />
              </Suspense>
            </ErrorBoundary>

            <StatsPanel
              restaurants={visibleRestaurants}
              searchRadiusMiles={searchRadiusMiles}
            />
          </div>
        )}
      </div>
    </>
  );
}
