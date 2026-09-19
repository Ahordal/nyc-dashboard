// dashboard.tsx
//
// Root component: owns shared state, wires the child panels together.

import {
  Fragment,
  lazy,
  Suspense,
  useCallback,
  useId,
  useMemo,
  useReducer,
  useState,
} from "react";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChevronDown,
  faSliders,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";

import MobileDashboard from "./MobileDashboard";
import AppBar from "./AppBar";
import DashboardTitle from "./DashboardTitle";
import GradeFilters from "./GradeFilters";
import BoroughFilters from "./BoroughFilters";
import StatsPanel from "./StatsPanel";
import FilterSummary from "./FilterSummary";
import DashboardGuide from "./DashboardGuide";
import ExplorerSearch from "./ExplorerSearch";
import RestaurantList from "./RestaurantList";
import RestaurantDetails from "./RestaurantDetails";
import RestaurantReport from "./RestaurantReport";
import DashboardFooter from "./DashboardFooter";
import NoticeOverlay from "./NoticeOverlay";
import MapViewSkeleton from "./MapViewSkeleton";
import ChartSkeleton from "./ChartSkeleton";
import ErrorBoundary from "./ErrorBoundary";
import ErrorFallback from "./ErrorFallback";
import ExplorerTabs from "./ExplorerTabs";
import {
  tabButtonId,
  tabPanelId,
  type ExplorerTab,
} from "../utils/explorerTabs";
import {
  selectionReducer,
  INITIAL_SELECTION_STATE,
} from "./selectionReducer";

import { useMediaQuery } from "../hooks/useMediaQuery";
import { useUrlSync } from "../hooks/useUrlSync";
import type { InitialUrlState, InitialRadiusState } from "../hooks/useUrlSync";
import { useJsonFetch } from "../hooks/useJsonFetch";
import { useInspectionHistory } from "../hooks/useInspectionHistory";

import type { Filters } from "../types/filters";
import { SEARCH_RADIUS_LABELS } from "../types/searchRadius";
import type { SearchRadiusPoint, SearchRadiusMiles } from "../types/searchRadius";

import type {
  RestaurantProperties,
  ViolationCodeLookup,
} from "../types/restaurant";

import type { DashboardMeta } from "../types/dashboardMeta";
import { EMPTY_GRADE_COUNTS, type GradeCounts } from "../types/gradeCounts";

import { CATEGORY_COLORS } from "../utils/gradeCategory";
import { resolveReportInspectionId } from "../utils/reportInspection";
import { getFilterNoticeParts } from "../utils/filterNotice";

const MapView = lazy(() => import("./MapView"));

// Recharts + d3 were bloating the entry chunk, so these load lazily.
// Grid-sized layout areas mean the skeleton causes no shift.
const GradeChart = lazy(() => import("./GradeChart"));
const PerformanceChart = lazy(() => import("./PerformanceChart"));

const FILTER_NOTICE_DURATION_MS = 1300;

// Must stay referentially stable — useJsonFetch depends on that for its fallback.
const EMPTY_VIOLATION_CODES: ViolationCodeLookup = {};

const GRADE_FILTER_COLORS: Record<string, string> = {
  A: CATEGORY_COLORS.A,
  B: CATEGORY_COLORS.B,
  C: CATEGORY_COLORS.C,
  Pending: CATEGORY_COLORS.pending,
  Uninspected: CATEGORY_COLORS.uninspected,
  Closed: CATEGORY_COLORS.closed,
};

export default function Dashboard() {
  const [filters, setFilters] = useState<Filters>({
    grades: [],
    boroughs: [],
  });

  const [searchQuery, setSearchQuery] = useState("");

  // Below this, MobileDashboard's app-bar + sheet layout replaces the 3-pane grid.
  const isPhone = useMediaQuery(
    "(max-width: 750px), (max-height: 480px) and (orientation: landscape)",
  );

  // 751-1750px: two-column layout, using the shared AppBar drawers.
  const isTablet = useMediaQuery("(max-width: 1750px)") && !isPhone;
  const [activeDrawer, setActiveDrawer] = useState<
    "search" | "filters" | "info" | "grades" | null
  >(null);
  const gradeDrawerId = useId();

  // Below this, Grade/Borough buttons stop fitting one line — swap to a popover trigger instead.
  const isFullDesktop = useMediaQuery("(min-width: 2360px)");
  const desktopFiltersPopoverId = useId();
  const activeFilterCount = filters.grades.length + filters.boroughs.length;

  // Selection, hover, and tab state move together — rules live in selectionReducer.
  const [selection, dispatchSelection] = useReducer(
    selectionReducer,
    INITIAL_SELECTION_STATE,
  );
  const {
    selectedRestaurant,
    selectedInspectionId,
    hoveredInspectionId,
    hoveredRestaurantId,
    activeTab: activeExplorerTab,
  } = selection;

  // ?camis= from the URL. Matched against the full layer, not
  // visibleRestaurants, so off-screen shared links still resolve.
  const [pendingCamisFromUrl, setPendingCamisFromUrl] = useState<string | null>(
    null,
  );

  const [visibleRestaurants, setVisibleRestaurants] = useState<
    RestaurantProperties[]
  >([]);

  const [gradeCounts, setGradeCounts] =
    useState<GradeCounts>(EMPTY_GRADE_COUNTS);

  const [searchRadiusPoint, setSearchRadiusPoint] =
    useState<SearchRadiusPoint | null>(null);

  const [activeRadiusMiles, setActiveRadiusMiles] =
    useState<SearchRadiusMiles>(0.25);

  // Mobile GPS fix (in-NYC only), feeding per-card Distance outside
  // Search Radius's scoping. Not URL-synced — transient device state.
  const [userLocationPoint, setUserLocationPoint] =
    useState<SearchRadiusPoint | null>(null);

  // Radius restored from the URL, passed to MapView to re-place the point and re-frame.
  const [initialSearchRadius, setInitialSearchRadius] =
    useState<InitialRadiusState | null>(null);

  const { history, isLoadingHistory } = useInspectionHistory(
    selectedRestaurant?.camis ?? null,
  );

  const violationCodes = useJsonFetch<ViolationCodeLookup>(
    "/data/violation-codes.json",
    EMPTY_VIOLATION_CODES,
  );

  const dashboardMeta = useJsonFetch<DashboardMeta | null>(
    "/data/dashboard-meta.json",
    null,
  );

  // Stable reference needed here since RestaurantList is memoized too —
  // a fresh element every render would defeat that.
  const restaurantListFilterNotice = useMemo(
    () => (
      <NoticeOverlay
        triggerKey={`${filters.grades.join(",")}-${filters.boroughs.join(",")}-${searchQuery}-${
          searchRadiusPoint ? `radius-${activeRadiusMiles}` : ""
        }`}
        durationMs={FILTER_NOTICE_DURATION_MS}>
        {getFilterNoticeParts({
          grades: filters.grades,
          boroughs: filters.boroughs,
          searchQuery,
          hasSearchRadius: Boolean(searchRadiusPoint),
        }).map((part, index) => (
          <Fragment key={part.kind}>
            {index > 0 && (
              <span className="filter-notice-separator">, </span>
            )}
            <span className="filter-notice-group">
              {part.kind === "grades" && (
                <>
                  Grade:{" "}
                  {part.grades.map((grade, gradeIndex) => (
                    <span key={grade}>
                      <span style={{ color: GRADE_FILTER_COLORS[grade] }}>
                        {grade}
                      </span>
                      {gradeIndex < part.grades.length - 1 && ", "}
                    </span>
                  ))}
                </>
              )}
              {part.kind === "boroughs" && (
                <>Borough: {part.boroughs.join(", ")}</>
              )}
              {part.kind === "search" && (
                <>Search: &quot;{part.query}&quot;</>
              )}
              {part.kind === "radius" && (
                <>
                  Restaurants within{" "}
                  <span className="unit-mi">
                    {SEARCH_RADIUS_LABELS[activeRadiusMiles]}
                  </span>{" "}
                  of centre
                </>
              )}
              {part.kind === "all" && <>All Restaurants</>}
            </span>
          </Fragment>
        ))}
      </NoticeOverlay>
    ),
    [
      filters.grades,
      filters.boroughs,
      searchQuery,
      searchRadiusPoint,
      activeRadiusMiles,
    ],
  );

  const reportInspectionId = resolveReportInspectionId(
    selectedInspectionId,
    history,
  );

  const handleInitialUrlState = useCallback((initial: InitialUrlState) => {
    if (initial.grades.length > 0 || initial.boroughs.length > 0) {
      setFilters({
        grades: initial.grades,
        boroughs: initial.boroughs,
      });
    }

    if (initial.searchQuery) {
      setSearchQuery(initial.searchQuery);
    }

    if (initial.camis) {
      setPendingCamisFromUrl(initial.camis);
    }

    if (initial.radius) {
      setSearchRadiusPoint(initial.radius.point);
      setActiveRadiusMiles(initial.radius.miles);
      setInitialSearchRadius(initial.radius);
    }
  }, []);

  useUrlSync(
    {
      grades: filters.grades,
      boroughs: filters.boroughs,
      searchQuery,
      selectedRestaurantCamis: selectedRestaurant?.camis ?? null,
      searchRadiusPoint,
      searchRadiusMiles: activeRadiusMiles,
    },
    handleInitialUrlState,
  );

  // dispatchSelection is stable, so these never change identity — keeps
  // the memoized explorer panels from re-rendering needlessly.
  const handleSelectRestaurant = useCallback(
    (restaurant: RestaurantProperties | null) => {
      dispatchSelection({ type: "selectRestaurant", restaurant });
    },
    [],
  );

  const handleSelectInspection = useCallback((inspectionId: string) => {
    dispatchSelection({ type: "selectInspection", inspectionId });
  }, []);

  const handlePreviewInspection = useCallback((inspectionId: string) => {
    dispatchSelection({ type: "previewInspection", inspectionId });
  }, []);

  const handleHoverInspection = useCallback((inspectionId: string | null) => {
    dispatchSelection({ type: "hoverInspection", inspectionId });
  }, []);

  const handleHoverRestaurant = useCallback(
    (restaurant: RestaurantProperties | null) => {
      dispatchSelection({
        type: "hoverRestaurant",
        restaurantId: restaurant?.id ?? null,
      });
    },
    [],
  );

  const handleExplorerTabChange = useCallback((tab: ExplorerTab) => {
    dispatchSelection({ type: "changeTab", tab });
  }, []);

  const handleInitialSelectionResolved = useCallback(() => {
    setPendingCamisFromUrl(null);
  }, []);

  const handleSearchRadiusChange = useCallback(
    (point: SearchRadiusPoint | null, radius: SearchRadiusMiles) => {
      setSearchRadiusPoint(point);
      setActiveRadiusMiles(radius);
    },
    [],
  );

  if (isPhone) {
    return (
      <MobileDashboard
        filters={filters}
        setFilters={setFilters}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        selectedRestaurant={selectedRestaurant}
        reportInspectionId={reportInspectionId}
        hoveredInspectionId={hoveredInspectionId}
        hoveredRestaurantId={hoveredRestaurantId}
        activeExplorerTab={activeExplorerTab}
        onSelectRestaurant={handleSelectRestaurant}
        onSelectInspection={handleSelectInspection}
        onPreviewInspection={handlePreviewInspection}
        onHoverInspection={handleHoverInspection}
        onHoverRestaurant={handleHoverRestaurant}
        onExplorerTabChange={handleExplorerTabChange}
        visibleRestaurants={visibleRestaurants}
        onVisibleRestaurantsChange={setVisibleRestaurants}
        gradeCounts={gradeCounts}
        onGradeCountsChange={setGradeCounts}
        searchRadiusPoint={searchRadiusPoint}
        activeRadiusMiles={activeRadiusMiles}
        onSearchRadiusChange={handleSearchRadiusChange}
        userLocationPoint={userLocationPoint}
        onUserLocationChange={setUserLocationPoint}
        initialSearchRadius={initialSearchRadius}
        pendingCamisFromUrl={pendingCamisFromUrl}
        onInitialSelectionResolved={handleInitialSelectionResolved}
        history={history}
        isLoadingHistory={isLoadingHistory}
        violationCodes={violationCodes}
        dashboardMeta={dashboardMeta}
      />
    );
  }

  // Bare donut + share line, reused by the sidebar and tablet drawer.
  // Counts live in StatsPanel instead.
  const gradeDonut = (
    <ErrorBoundary
      context="GradeChart"
      fallback={
        <ErrorFallback message="The grade breakdown chart failed to load." />
      }>
      <Suspense fallback={<ChartSkeleton label="Loading grade breakdown…" />}>
        <GradeChart
          counts={gradeCounts}
          filters={filters}
          searchQuery={searchQuery}
          searchRadiusMiles={searchRadiusPoint ? activeRadiusMiles : null}
          showCenterLegend={false}
          showFilterNote={false}
        />
      </Suspense>
    </ErrorBoundary>
  );

  // Shared under the donut in both the sidebar and tablet drawer.
  const gradeFiltersSummary = (
    <>
      <hr className="mobile-filter-notice-rule" />
      <FilterSummary filters={filters} searchQuery={searchQuery} />
    </>
  );

  const statsPanel = (
    <div className="map-stats">
      <StatsPanel
        restaurants={visibleRestaurants}
        searchRadiusMiles={searchRadiusPoint ? activeRadiusMiles : null}
      />
    </div>
  );

  // Compact desktop only. Nested in StatsPanel, not an adjacent box, so
  // its inset matches the map's own control chips.
  const desktopFiltersButton = (
    <>
      <div className="desktop-filters-button-wrap">
        <button
          type="button"
          className="desktop-filters-button"
          aria-expanded={activeDrawer === "filters"}
          aria-controls={desktopFiltersPopoverId}
          aria-label={
            activeDrawer === "filters"
              ? "Close filters"
              : activeFilterCount > 0
                ? `Filters (${activeFilterCount} active)`
                : "Filters"
          }
          onClick={() =>
            setActiveDrawer(activeDrawer === "filters" ? null : "filters")
          }>
          <FontAwesomeIcon
            icon={activeDrawer === "filters" ? faXmark : faSliders}
            aria-hidden="true"
          />
          {activeFilterCount > 0 && (
            <span className="notification-badge desktop-filters-badge">{activeFilterCount}</span>
          )}
        </button>
      </div>

      {/* Anchored to .stats-panel, not the button, so it stays flush with the map edge. */}
      {activeDrawer === "filters" && (
        <div id={desktopFiltersPopoverId} className="desktop-filters-popover">
          <div className="panel-header">
            <h2 className="panel-header-title">Filters</h2>
          </div>

          <div className="dashboard-filters">
            <div className="dashboard-grade-filters">
              <GradeFilters filters={filters} setFilters={setFilters} />
            </div>

            <div className="dashboard-borough-filters">
              <BoroughFilters filters={filters} setFilters={setFilters} />
            </div>
          </div>
        </div>
      )}
    </>
  );

  const compactDesktopStatsPanel = (
    <div className="map-stats">
      <StatsPanel
        restaurants={visibleRestaurants}
        searchRadiusMiles={searchRadiusPoint ? activeRadiusMiles : null}
        filtersButton={desktopFiltersButton}
      />
    </div>
  );

  // Locate dot feeds Distance on tablet like phone; desktop has no locate control.
  const locateDistanceOrigin = isTablet ? userLocationPoint : null;
  const listDistanceOrigin = searchRadiusPoint ?? locateDistanceOrigin;

  return (
    <div className="dashboard-container">
      <main className="dashboard">
        {isTablet && (
          <div className="tablet-appbar-region">
            <AppBar
              filters={filters}
              setFilters={setFilters}
              meta={dashboardMeta}
              onSearchChange={setSearchQuery}
              searchActive={searchQuery.trim().length > 0}
              activeDrawer={activeDrawer}
              onDrawerChange={setActiveDrawer}
              tagline="Mapping Restaurant Health Inspections"
            />
          </div>
        )}

        <div className="left-sidebar">
          {!isTablet && (
            <>
              <div className="dashboard-title">
                <DashboardTitle />
              </div>

              <div className="dashboard-guide">
                <DashboardGuide meta={dashboardMeta} />
              </div>
            </>
          )}

          {!isTablet && (
            <div className="grade-chart">
              {gradeDonut}
              {gradeFiltersSummary}
            </div>
          )}
        </div>

        <div className="map-column">
          <div
            className={
              !isTablet && !isFullDesktop
                ? "map-top map-top-single-row"
                : "map-top"
            }>
            {!isTablet && isFullDesktop && (
              <div className="dashboard-filters">
                <div className="dashboard-grade-filters">
                  <GradeFilters filters={filters} setFilters={setFilters} />
                </div>

                <div className="dashboard-borough-filters">
                  <BoroughFilters filters={filters} setFilters={setFilters} />
                </div>
              </div>
            )}

            {isTablet ? (
              <div className="tablet-kpi-region">
                <div className="tablet-kpi-bar">
                  {statsPanel}
                  <button
                    type="button"
                    className="tablet-kpi-chevron-box"
                    data-open={activeDrawer === "grades"}
                    aria-expanded={activeDrawer === "grades"}
                    aria-controls={gradeDrawerId}
                    aria-label={
                      activeDrawer === "grades"
                        ? "Hide the grade breakdown"
                        : "Show the grade breakdown for the current view"
                    }
                    onClick={() =>
                      setActiveDrawer(
                        activeDrawer === "grades" ? null : "grades",
                      )
                    }>
                    <FontAwesomeIcon
                      icon={faChevronDown}
                      className="tablet-kpi-chevron"
                      aria-hidden="true"
                    />
                  </button>
                </div>
                <div
                  id={gradeDrawerId}
                  className="tablet-kpi-drawer"
                  data-open={activeDrawer === "grades"}>
                  {activeDrawer === "grades" && (
                    <div className="tablet-kpi-drawer-chart">
                      {gradeDonut}
                      {gradeFiltersSummary}
                    </div>
                  )}
                </div>
              </div>
            ) : isFullDesktop ? (
              statsPanel
            ) : (
              compactDesktopStatsPanel
            )}
          </div>

          <div className="map-view">
            <ErrorBoundary
              context="MapView"
              fallback={<ErrorFallback message="The map failed to load." />}>
              <Suspense fallback={<MapViewSkeleton />}>
                <MapView
                  filters={filters}
                  searchQuery={searchQuery}
                  selectedRestaurantId={selectedRestaurant?.id ?? null}
                  hoveredRestaurantId={hoveredRestaurantId}
                  onSelectRestaurant={handleSelectRestaurant}
                  onHoverRestaurant={handleHoverRestaurant}
                  onVisibleRestaurantsChange={setVisibleRestaurants}
                  onGradeCountsChange={setGradeCounts}
                  onSearchRadiusChange={handleSearchRadiusChange}
                  onUserLocationChange={setUserLocationPoint}
                  initialSearchRadius={initialSearchRadius}
                  initialSelectedCamis={pendingCamisFromUrl}
                  onInitialSelectionResolved={handleInitialSelectionResolved}
                  showLocateControl={isTablet}
                />
              </Suspense>
            </ErrorBoundary>
          </div>
        </div>

        {!isTablet && (
          <div className="search-panel">
            <ExplorerSearch onSearchChange={setSearchQuery} />
          </div>
        )}

        <div className="explorer">
          <ExplorerTabs
            activeTab={activeExplorerTab}
            onTabChange={handleExplorerTabChange}
          />

          <div className="explorer-content">
            <div
              id={tabPanelId("list")}
              role="tabpanel"
              aria-labelledby={tabButtonId("list")}
              className={`restaurant-list ${
                activeExplorerTab === "list" ? "" : "explorer-pane-hidden"
              }`}>
              <RestaurantList
                restaurants={visibleRestaurants}
                selectedRestaurantId={selectedRestaurant?.id ?? null}
                selectedRestaurant={selectedRestaurant}
                hoveredRestaurantId={hoveredRestaurantId}
                onSelectRestaurant={handleSelectRestaurant}
                onHoverRestaurant={handleHoverRestaurant}
                searchRadiusPoint={searchRadiusPoint}
                userLocationPoint={locateDistanceOrigin}>
                {restaurantListFilterNotice}
              </RestaurantList>
            </div>

            <div
              id={tabPanelId("details")}
              role="tabpanel"
              aria-labelledby={tabButtonId("details")}
              className={`restaurant-details ${
                activeExplorerTab === "details" ? "" : "explorer-pane-hidden"
              }`}>
              <RestaurantDetails
                restaurant={selectedRestaurant}
                distanceOrigin={listDistanceOrigin}
                distanceOriginKind={
                  searchRadiusPoint ? "search-radius" : "your-location"
                }
                history={history}
                isLoadingHistory={isLoadingHistory}
                selectedInspectionId={reportInspectionId}
                onSelectInspection={handleSelectInspection}
                onHoverInspection={handleHoverInspection}
              />
            </div>

            <div
              id={tabPanelId("report")}
              role="tabpanel"
              aria-labelledby={tabButtonId("report")}
              className={`restaurant-report ${
                activeExplorerTab === "report" ? "" : "explorer-pane-hidden"
              }`}>
              <RestaurantReport
                restaurant={selectedRestaurant}
                history={history}
                isLoadingHistory={isLoadingHistory}
                selectedInspectionId={reportInspectionId}
                violationCodes={violationCodes}
                onSelectInspection={handleSelectInspection}
              />
            </div>
          </div>
        </div>

        <div className="performance-chart">
          <ErrorBoundary
            context="PerformanceChart"
            resetKey={selectedRestaurant?.camis ?? null}
            fallback={
              <ErrorFallback message="The score history chart failed to load." />
            }>
            <Suspense
              fallback={<ChartSkeleton label="Loading score history…" />}>
              <PerformanceChart
                restaurant={selectedRestaurant}
                history={history}
                isLoadingHistory={isLoadingHistory}
                onSelectInspection={handleSelectInspection}
                hoveredInspectionId={hoveredInspectionId}
                selectedInspectionId={reportInspectionId}
              />
            </Suspense>
          </ErrorBoundary>
        </div>

        <div className="dashboard-footer">
          <DashboardFooter />
        </div>
      </main>
    </div>
  );
}
