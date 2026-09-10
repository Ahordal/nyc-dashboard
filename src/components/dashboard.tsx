// dashboard.tsx
//
// Top-level dashboard component. Owns the shared state, assembles the
// layout, and coordinates data flow between the child panels.

import {
  Fragment,
  lazy,
  Suspense,
  useCallback,
  useId,
  useReducer,
  useState,
} from "react";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChevronRight,
  faChevronDown,
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

// GradeChart and PerformanceChart both pull in Recharts (+ its d3
// dependency tree), which was landing in the render-blocking entry
// chunk. Loading them lazily keeps that weight off the critical path;
// their layout areas are grid-sized, so the skeleton fallback causes no
// layout shift.
const GradeChart = lazy(() => import("./GradeChart"));
const PerformanceChart = lazy(() => import("./PerformanceChart"));

const FILTER_NOTICE_DURATION_MS = 1300;

// Stable fallback for the violation-codes fetch (see useJsonFetch).
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

  // The inline filter bar only fits on one line at ~2360px+; below that
  // it collapses into a <details> disclosure. At/above it the bar is
  // always shown and the summary is hidden via CSS.
  const isFilterBarInline = useMediaQuery("(min-width: 2360px)");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersExpanded = isFilterBarInline || filtersOpen;

  // Below this width the desktop 3-pane grid is replaced by the phone
  // layout (app bar + full-bleed map + bottom sheet); see MobileDashboard.
  // The short-landscape clause keeps a phone turned sideways on the phone
  // layout rather than flipping it to the stacked tablet grid.
  const isPhone = useMediaQuery(
    "(max-width: 750px), (max-height: 480px) and (orientation: landscape)",
  );

  // 751–1750px: the stacked two-column layout, which swaps the big title
  // panel, the <details> filter bar, the Search row and the Dashboard
  // Information panel for the shared AppBar (Search/Filters/Info drawers).
  const isTablet = useMediaQuery("(max-width: 1750px)") && !isPhone;
  const [activeDrawer, setActiveDrawer] = useState<
    "search" | "filters" | "info" | "grades" | null
  >(null);
  const gradeDrawerId = useId();

  // Selection, hover, and the active Explorer tab move together — see
  // selectionReducer for the "selecting X clears Y, switches tab" rules.
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

  // A restaurant named in the initial URL (?camis=). MapView resolves it
  // against the full layer once its layer is ready, hands it back via
  // onSelectRestaurant, then reports done so this clears. Resolving it
  // there (not by scanning visibleRestaurants) is what lets a shared
  // link land on a restaurant that's off-screen or off the active grade.
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

  // The mobile "locate me" dot's position (in-NYC fixes only), reported
  // up from MapView. Drives the per-card Distance line without the Search
  // Radius tool's scoping/sort behaviour. Not URL-synced -- transient
  // device state.
  const [userLocationPoint, setUserLocationPoint] =
    useState<SearchRadiusPoint | null>(null);

  // A radius restored from the URL on first load. Passed to MapView so
  // its Search Radius hook can re-place the point, redraw the rings, and
  // re-frame the map; null unless the initial URL carried a ?radius.
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

  const gradesKey = filters.grades.join(",");

  const boroughsKey = filters.boroughs.join(",");

  const radiusKey = searchRadiusPoint ? `radius-${activeRadiusMiles}` : "";

  // Active grade/borough filters, summarised for the collapsed filter
  // bar. Grade names carry their category colour; boroughs stay muted.
  const hasGradeFilter = filters.grades.length > 0;
  const hasBoroughFilter = filters.boroughs.length > 0;

  const filterSummary =
    !hasGradeFilter && !hasBoroughFilter ? (
      "All grades & boroughs"
    ) : (
      <>
        {hasGradeFilter && (
          <>
            Grade:{" "}
            {filters.grades.map((grade, index) => (
              <Fragment key={grade}>
                {index > 0 && ", "}
                <span style={{ color: GRADE_FILTER_COLORS[grade] }}>
                  {grade}
                </span>
              </Fragment>
            ))}
          </>
        )}
        {hasGradeFilter && hasBoroughFilter && " · "}
        {hasBoroughFilter && `Borough: ${filters.boroughs.join(", ")}`}
      </>
    );

  const reportInspectionId = resolveReportInspectionId(
    selectedInspectionId,
    history,
  );

  // Initialize state from URL params on first mount
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

  // Sync state back to URL parameters
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

  function handleSelectRestaurant(restaurant: RestaurantProperties | null) {
    dispatchSelection({ type: "selectRestaurant", restaurant });
  }

  function handleSelectInspection(inspectionId: string) {
    dispatchSelection({ type: "selectInspection", inspectionId });
  }

  function handlePreviewInspection(inspectionId: string) {
    dispatchSelection({ type: "previewInspection", inspectionId });
  }

  function handleHoverInspection(inspectionId: string | null) {
    dispatchSelection({ type: "hoverInspection", inspectionId });
  }

  function handleHoverRestaurant(restaurant: RestaurantProperties | null) {
    dispatchSelection({
      type: "hoverRestaurant",
      restaurantId: restaurant?.id ?? null,
    });
  }

  function handleExplorerTabChange(tab: ExplorerTab) {
    dispatchSelection({ type: "changeTab", tab });
  }

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
        onInitialSelectionResolved={() => setPendingCamisFromUrl(null)}
        history={history}
        isLoadingHistory={isLoadingHistory}
        violationCodes={violationCodes}
        dashboardMeta={dashboardMeta}
      />
    );
  }

  // Bare donut + the per-grade share line, shared by the desktop sidebar
  // and the tablet KPI drawer. Neither shows the absolute counts -- those
  // live in the stats panel above the map (desktop) / in the KPI bar
  // (tablet).
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
          showCenterCount={false}
          showFilterNote={false}
        />
      </Suspense>
    </ErrorBoundary>
  );

  // Rule + "Filters applied: …" line that sits under the donut in both
  // the desktop sidebar and the tablet KPI drawer.
  const gradeFiltersSummary = (
    <>
      <hr className="mobile-filter-notice-rule" />
      <FilterSummary filters={filters} />
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

  // The "locate me" dot feeds the per-card / details Distance readout and
  // the Distance sort on tablet, exactly as on phone. Desktop has no
  // locate control, so it never contributes a distance origin there.
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
              tagline="Restaurant Inspection Trends and Insights"
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
          <div className="map-top">
            {!isTablet && (
              <details
                className="filters-disclosure"
                open={filtersExpanded}
                onToggle={(event) => {
                  if (!isFilterBarInline) {
                    setFiltersOpen(event.currentTarget.open);
                  }
                }}>
                <summary className="filters-disclosure-summary">
                  <FontAwesomeIcon
                    icon={faChevronRight}
                    className="filters-disclosure-chevron"
                    aria-hidden="true"
                  />
                  <span className="filters-disclosure-label">Filters</span>
                  <span className="filters-disclosure-active">
                    {filterSummary}
                  </span>
                </summary>

                <div className="dashboard-filters">
                  <div className="dashboard-grade-filters">
                    <GradeFilters filters={filters} setFilters={setFilters} />
                  </div>

                  <div className="dashboard-borough-filters">
                    <BoroughFilters filters={filters} setFilters={setFilters} />
                  </div>
                </div>
              </details>
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
            ) : (
              statsPanel
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
                  onInitialSelectionResolved={() =>
                    setPendingCamisFromUrl(null)
                  }
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
                <NoticeOverlay
                  triggerKey={`${gradesKey}-${boroughsKey}-${searchQuery}-${radiusKey}`}
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
                                <span
                                  style={{ color: GRADE_FILTER_COLORS[grade] }}>
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
