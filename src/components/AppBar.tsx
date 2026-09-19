// AppBar.tsx
//
// Slim top bar for phone and 751-1750px tablet: wordmark, Search/Filters/
// Info drawers. Search filters live at half detent; Info folds in dataset
// meta, map legend, and the footer.

import { useId } from "react";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faSliders,
  faCircleInfo,
  faMagnifyingGlass,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";

import GradeFilters from "./GradeFilters";
import BoroughFilters from "./BoroughFilters";
import ExplorerSearch from "./ExplorerSearch";
import DashboardGuideMeta from "./DashboardGuideMeta";
import DashboardFooter from "./DashboardFooter";
import MOBILE_INFO_CONTENT from "./MobileInfoContent";

import type { Filters, SetFilters } from "../types/filters";
import type { DashboardMeta } from "../types/dashboardMeta";

type MobileDrawer = "search" | "filters" | "info" | "grades" | null;

type AppBarProps = {
  filters: Filters;
  setFilters: SetFilters;
  meta: DashboardMeta | null;
  onSearchChange: (query: string) => void;
  // Committed search — badges the button as a live filter even when closed.
  searchActive: boolean;
  // Tertiary "what this is" line under the subtitle. Both layouts pass it.
  tagline?: string;
  // One open top drawer for the whole mobile layout (MobileDashboard).
  // "grades" is the area-strip drawer — none of these three open.
  activeDrawer: MobileDrawer;
  onDrawerChange: (drawer: MobileDrawer) => void;
};

export default function AppBar({
  filters,
  setFilters,
  meta,
  onSearchChange,
  searchActive,
  activeDrawer,
  onDrawerChange,
  tagline,
}: AppBarProps) {
  const searchDrawerId = useId();
  const filterDrawerId = useId();
  const infoDrawerId = useId();

  const searchOpen = activeDrawer === "search";
  const filtersOpen = activeDrawer === "filters";
  const infoOpen = activeDrawer === "info";

  function toggleSearch() {
    onDrawerChange(searchOpen ? null : "search");
  }

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
          <h1 className="mobile-appbar-subtitle">
            Dining Under the Microscope
          </h1>
          {tagline && (
            <span className="mobile-appbar-tagline">{tagline}</span>
          )}
        </div>

        <div className="mobile-appbar-actions">
          <button
            type="button"
            className="mobile-appbar-button"
            data-active={searchOpen || undefined}
            aria-expanded={searchOpen}
            aria-controls={searchDrawerId}
            aria-label={
              searchOpen
                ? "Close search"
                : searchActive
                  ? "Search (active) — edit or clear"
                  : "Search"
            }
            onClick={toggleSearch}>
            <FontAwesomeIcon icon={searchOpen ? faXmark : faMagnifyingGlass} />
            {searchActive && !searchOpen && (
              <span
                className="notification-badge mobile-appbar-badge mobile-appbar-badge-dot"
                aria-hidden="true"
              />
            )}
          </button>

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
              <span className="notification-badge mobile-appbar-badge">{activeFilterCount}</span>
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
        id={searchDrawerId}
        className="mobile-search-drawer"
        data-open={searchOpen}>
        <div className="mobile-search-drawer-card">
          <ExplorerSearch onSearchChange={onSearchChange} />
        </div>
      </div>

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
