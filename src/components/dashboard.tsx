// dashboard.tsx
//
// Top-level dashboard component. Owns the shared state, assembles the
// layout, and coordinates data flow between the child panels.

import {
  Fragment,
  lazy,
  Suspense,
  useCallback,
  useReducer,
  useState,
} from "react";

import DashboardTitle from "./DashboardTitle";
import GradeFilters from "./GradeFilters";
import BoroughFilters from "./BoroughFilters";
import StatsPanel from "./StatsPanel";
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

  return (
    <div className="dashboard-container">
      <main className="dashboard">
        <div className="left-sidebar">
          <div className="dashboard-title">
            <DashboardTitle />
          </div>

          <div className="dashboard-guide">
            <DashboardGuide meta={dashboardMeta} />
          </div>

          <div className="grade-chart">
            <ErrorBoundary
              context="GradeChart"
              fallback={
                <ErrorFallback message="The grade breakdown chart failed to load." />
              }>
              <Suspense
                fallback={<ChartSkeleton label="Loading grade breakdown…" />}>
                <GradeChart
                  counts={gradeCounts}
                  filters={filters}
                  searchRadiusMiles={
                    searchRadiusPoint ? activeRadiusMiles : null
                  }
                />
              </Suspense>
            </ErrorBoundary>
          </div>
        </div>

        <div className="map-column">
          <div className="map-top">
            <div className="dashboard-filters">
              <div className="dashboard-grade-filters">
                <GradeFilters filters={filters} setFilters={setFilters} />
              </div>

              <div className="dashboard-borough-filters">
                <BoroughFilters filters={filters} setFilters={setFilters} />
              </div>
            </div>

            <div className="map-stats">
              <StatsPanel
                restaurants={visibleRestaurants}
                searchRadiusMiles={searchRadiusPoint ? activeRadiusMiles : null}
              />
            </div>
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
                  onSearchRadiusChange={(point, radius) => {
                    setSearchRadiusPoint(point);
                    setActiveRadiusMiles(radius);
                  }}
                  initialSearchRadius={initialSearchRadius}
                  initialSelectedCamis={pendingCamisFromUrl}
                  onInitialSelectionResolved={() =>
                    setPendingCamisFromUrl(null)
                  }
                />
              </Suspense>
            </ErrorBoundary>
          </div>
        </div>

        <div className="search-panel">
          <ExplorerSearch onSearchChange={setSearchQuery} />
        </div>

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
                searchRadiusPoint={searchRadiusPoint}>
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
