// MobileAppBar.tsx
//
// Slim top bar for the phone layout: compact wordmark, a Filters button
// (badged with the active filter count) and an Info button — each slides
// down its own drawer. The Info drawer is the single info surface on
// phones: dataset meta, the map legend / how-to (folded in from
// MapView), then the attribution footer as a detached panel.

import { Fragment, useId } from "react";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faSliders,
  faCircleInfo,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";

import GradeFilters from "./GradeFilters";
import BoroughFilters from "./BoroughFilters";
import DashboardGuideMeta from "./DashboardGuideMeta";
import DashboardFooter from "./DashboardFooter";
import MOBILE_INFO_CONTENT from "./MobileInfoContent";

import { getFilterNoticeParts } from "../utils/filterNotice";
import { CATEGORY_COLORS } from "../utils/gradeCategory";
import type { Filters, SetFilters } from "../types/filters";
import type { DashboardMeta } from "../types/dashboardMeta";

// Grade-filter labels -> their category colour (boroughs stay muted),
// matching the desktop filter-change notice.
const GRADE_LABEL_COLORS: Record<string, string> = {
  A: CATEGORY_COLORS.A,
  B: CATEGORY_COLORS.B,
  C: CATEGORY_COLORS.C,
  Pending: CATEGORY_COLORS.pending,
  Uninspected: CATEGORY_COLORS.uninspected,
  Closed: CATEGORY_COLORS.closed,
};

// The same summary the desktop RestaurantList flashes as an overlay when
// filters change, rendered here as static (coloured) text so a mobile
// user gets confirmation their selection took effect.
function FilterSummary({ filters }: { filters: Filters }) {
  const parts = getFilterNoticeParts({
    grades: filters.grades,
    boroughs: filters.boroughs,
    searchQuery: "",
    hasSearchRadius: false,
  });

  return (
    <>
      <span className="mobile-filter-notice-lead">Filters applied:</span>{" "}
      {parts.map((part, index) => (
        <Fragment key={part.kind}>
          {index > 0 && " · "}
          {part.kind === "grades" && (
            <>
              <span className="mobile-filter-notice-label">Grade:</span>{" "}
              {part.grades.map((grade, gradeIndex) => (
                <Fragment key={grade}>
                  {gradeIndex > 0 && ", "}
                  <span style={{ color: GRADE_LABEL_COLORS[grade] }}>
                    {grade}
                  </span>
                </Fragment>
              ))}
            </>
          )}
          {part.kind === "boroughs" && (
            <>
              <span className="mobile-filter-notice-label">Borough:</span>{" "}
              <span className="mobile-filter-notice-borough">
                {part.boroughs.join(", ")}
              </span>
            </>
          )}
          {part.kind === "all" && <>All Restaurants</>}
        </Fragment>
      ))}
    </>
  );
}

type MobileAppBarProps = {
  filters: Filters;
  setFilters: SetFilters;
  meta: DashboardMeta | null;
  // The one open top drawer across the whole mobile layout (see
  // MobileDashboard). Filters/Info live here; "grades" is the area-strip
  // drawer and just means neither of these is open.
  activeDrawer: "filters" | "info" | "grades" | null;
  onDrawerChange: (drawer: "filters" | "info" | "grades" | null) => void;
};

export default function MobileAppBar({
  filters,
  setFilters,
  meta,
  activeDrawer,
  onDrawerChange,
}: MobileAppBarProps) {
  const filterDrawerId = useId();
  const infoDrawerId = useId();

  const filtersOpen = activeDrawer === "filters";
  const infoOpen = activeDrawer === "info";

  function toggleFilters() {
    onDrawerChange(filtersOpen ? null : "filters");
  }

  function toggleInfo() {
    onDrawerChange(infoOpen ? null : "info");
  }

  const activeFilterCount = filters.grades.length + filters.boroughs.length;

  return (
    <>
      <header className="mobile-appbar">
        <div className="mobile-appbar-brand">
          <span className="mobile-appbar-wordmark" aria-hidden="true">
            NYC
          </span>
          <span className="mobile-appbar-subtitle">
            Dining Under the Microscope
          </span>
        </div>

        <div className="mobile-appbar-actions">
          <button
            type="button"
            className="mobile-appbar-button"
            data-active={filtersOpen || undefined}
            aria-expanded={filtersOpen}
            aria-controls={filterDrawerId}
            aria-label={
              filtersOpen
                ? "Close filters"
                : activeFilterCount > 0
                  ? `Filters (${activeFilterCount} active)`
                  : "Filters"
            }
            onClick={toggleFilters}>
            <FontAwesomeIcon icon={filtersOpen ? faXmark : faSliders} />
            {activeFilterCount > 0 && !filtersOpen && (
              <span className="mobile-appbar-badge">{activeFilterCount}</span>
            )}
          </button>

          <button
            type="button"
            className="mobile-appbar-button"
            data-active={infoOpen || undefined}
            aria-expanded={infoOpen}
            aria-controls={infoDrawerId}
            aria-label={infoOpen ? "Close information" : "Information"}
            onClick={toggleInfo}>
            <FontAwesomeIcon icon={infoOpen ? faXmark : faCircleInfo} />
          </button>
        </div>
      </header>

      <div
        id={filterDrawerId}
        className="mobile-filter-drawer"
        data-open={filtersOpen}>
        <div className="mobile-filter-drawer-card">
          <div className="panel-header">
            <h2 className="panel-header-title">Filters</h2>
          </div>

          <div className="mobile-filter-groups">
            <GradeFilters filters={filters} setFilters={setFilters} />
            <BoroughFilters filters={filters} setFilters={setFilters} />
          </div>

          <hr className="mobile-filter-notice-rule" />
          <p className="mobile-filter-notice" aria-live="polite">
            <FilterSummary filters={filters} />
          </p>
        </div>
      </div>

      <div
        id={infoDrawerId}
        className="mobile-info-drawer"
        data-open={infoOpen}>
        <div className="mobile-info-drawer-panel">
          <div className="mobile-info-drawer-panel-body">
            <div className="panel-header">
              <h2 className="panel-header-title">Dashboard Information</h2>
            </div>

            <DashboardGuideMeta meta={meta} compact />
            {MOBILE_INFO_CONTENT}
          </div>
        </div>

        <div className="mobile-info-drawer-panel mobile-info-drawer-footer-panel">
          <div className="mobile-info-drawer-panel-body">
            <DashboardFooter />
          </div>
        </div>
      </div>
    </>
  );
}
