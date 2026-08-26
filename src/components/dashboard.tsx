// Dashboard.tsx
//
// Top-level dashboard component.
//
// Owns the dashboard's shared state, assembles the application layout,
// and coordinates data flow between the dashboard's child components.

import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import DashboardTitle from "./DashboardTitle";
import GradeFilters from "./GradeFilters";
import BoroughFilters from "./BoroughFilters";
import StatsPanel from "./StatsPanel";
import DashboardGuide from "./DashboardGuide";
import GradeChart from "./GradeChart";
import ExplorerSearch from "./ExplorerSearch";
import RestaurantList from "./RestaurantList";
import RestaurantDetails from "./RestaurantDetails";
import RestaurantReport from "./RestaurantReport";
import PerformanceChart from "./PerformanceChart";
import DashboardFooter from "./DashboardFooter";
import NoticeOverlay from "./NoticeOverlay";
import MapViewSkeleton from "./MapViewSkeleton";

import { useUrlSync } from "../hooks/useUrlSync";
import type { InitialUrlState } from "../hooks/useUrlSync";

import type { Filters } from "../types/filters";

import type {
  RestaurantProperties,
  InspectionEvent,
  ViolationCodeLookup,
} from "../types/restaurant";

import type { DashboardMeta } from "../types/dashboardMeta";
import type { GradeCounts } from "./MapView";

import { CATEGORY_COLORS } from "../utils/gradeCategory";

const MapView = lazy(() => import("./MapView"));

type ExplorerTab = "list" | "details" | "report";

const FILTER_NOTICE_DURATION_MS = 1300;

const MAX_HISTORY_CACHE_ENTRIES = 50;

const GRADE_FILTER_COLORS: Record<string, string> = {
  A: CATEGORY_COLORS.A,
  B: CATEGORY_COLORS.B,
  C: CATEGORY_COLORS.C,
  Pending: CATEGORY_COLORS.pending,
  Uninspected: CATEGORY_COLORS.uninspected,
  Closed: CATEGORY_COLORS.closed,
};

const EMPTY_GRADE_COUNTS: GradeCounts = {
  A: 0,
  B: 0,
  C: 0,
  pending: 0,
  uninspected: 0,
  closed: 0,
};

export default function Dashboard() {
  const [filters, setFilters] = useState<Filters>({
    grades: [],
    boroughs: [],
  });

  const [searchQuery, setSearchQuery] = useState("");

  const [selectedRestaurant, setSelectedRestaurant] =
    useState<RestaurantProperties | null>(null);



  const [pendingCamisFromUrl, setPendingCamisFromUrl] = useState<string | null>(
    null,
  );

  const [activeExplorerTab, setActiveExplorerTab] =
    useState<ExplorerTab>("list");

  const [visibleRestaurants, setVisibleRestaurants] = useState<
    RestaurantProperties[]
  >([]);

  const [gradeCounts, setGradeCounts] =
    useState<GradeCounts>(EMPTY_GRADE_COUNTS);

  const [history, setHistory] = useState<InspectionEvent[]>([]);

  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const [selectedInspectionId, setSelectedInspectionId] = useState<
    string | null
  >(null);

  const [hoveredInspectionId, setHoveredInspectionId] = useState<string | null>(
    null,
  );

  const [hoveredListRestaurantId, setHoveredListRestaurantId] = useState<
    string | null
  >(null);

  const historyCache = useRef<Map<string, InspectionEvent[]>>(new Map());

  const [violationCodes, setViolationCodes] = useState<ViolationCodeLookup>({});

  const [dashboardMeta, setDashboardMeta] = useState<DashboardMeta | null>(
    null,
  );

  const gradesKey = filters.grades.join(",");

  const boroughsKey = filters.boroughs.join(",");

  const reportInspectionId =
    selectedInspectionId !== null &&
    history.some((event) => event.id === selectedInspectionId)
      ? selectedInspectionId
      : (history[history.length - 1]?.id ?? null);

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
  }, []);

  // Sync state back to URL parameters
  useUrlSync(
    {
      grades: filters.grades,
      boroughs: filters.boroughs,
      searchQuery,
      selectedRestaurantCamis: selectedRestaurant?.camis ?? null,
    },
    handleInitialUrlState,
  );

  // If a restaurant was specified in the initial URL, select it once visible
  useEffect(() => {
    if (!pendingCamisFromUrl || visibleRestaurants.length === 0) {
      return;
    }

    const match = visibleRestaurants.find(
      (restaurant) =>
        restaurant.camis === pendingCamisFromUrl ||
        restaurant.id === pendingCamisFromUrl,
    );

    if (match) {
      handleSelectRestaurant(match);
      setPendingCamisFromUrl(null);
    }
  }, [pendingCamisFromUrl, visibleRestaurants]);

  useEffect(() => {
    const controller = new AbortController();

    fetch("/data/violation-codes.json", {
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : {}))
      .then((data: ViolationCodeLookup) => {
        setViolationCodes(data);
      })
      .catch((error) => {
        if (error.name !== "AbortError") {
          setViolationCodes({});
        }
      });

    return () => {
      controller.abort();
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    fetch("/data/dashboard-meta.json", {
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: DashboardMeta | null) => {
        setDashboardMeta(data);
      })
      .catch((error) => {
        if (error.name !== "AbortError") {
          setDashboardMeta(null);
        }
      });

    return () => {
      controller.abort();
    };
  }, []);

  useEffect(() => {
    setSelectedInspectionId(null);

    setHoveredInspectionId(null);

    if (!selectedRestaurant) {
      setHistory([]);
      setIsLoadingHistory(false);

      return;
    }

    const cachedHistory = historyCache.current.get(selectedRestaurant.camis);

    if (cachedHistory) {
      historyCache.current.delete(selectedRestaurant.camis);
      historyCache.current.set(selectedRestaurant.camis, cachedHistory);

      setHistory(cachedHistory);

      setIsLoadingHistory(false);

      return;
    }

    setHistory([]);
    setIsLoadingHistory(true);

    const controller = new AbortController();

    fetch(`/data/history/${selectedRestaurant.camis}.json`, {
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : []))
      .then((data: InspectionEvent[]) => {
        const cache = historyCache.current;
        if (cache.size >= MAX_HISTORY_CACHE_ENTRIES) {
          const oldestKey = cache.keys().next().value;
          if (oldestKey !== undefined) cache.delete(oldestKey);
        }
        cache.set(selectedRestaurant.camis, data);

        setHistory(data);

        setIsLoadingHistory(false);
      })
      .catch((error) => {
        if (error.name !== "AbortError") {
          setHistory([]);

          setIsLoadingHistory(false);
        }
      });

    return () => {
      controller.abort();
    };
    // Key on camis rather than object identity: map queries can return fresh
    // object refs for the same restaurant, causing unnecessary cache refetches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRestaurant?.camis]);

  function handleSelectRestaurant(restaurant: RestaurantProperties | null) {
    setHoveredInspectionId(null);

    setHoveredListRestaurantId(null);

    setSelectedRestaurant(restaurant);

    if (restaurant) {
      setActiveExplorerTab("details");
    } else {
      setActiveExplorerTab("list");
    }
  }

  function handleSelectInspection(inspectionId: string) {
    setHoveredInspectionId(null);

    setSelectedInspectionId(inspectionId);

    setActiveExplorerTab("report");
  }

  function handleHoverInspection(inspectionId: string | null) {
    setHoveredInspectionId(inspectionId);
  }

  function handleHoverRestaurantInList(
    restaurant: RestaurantProperties | null,
  ) {
    setHoveredListRestaurantId(restaurant?.id ?? null);
  }

  function handleExplorerTabChange(tab: ExplorerTab) {
    setHoveredInspectionId(null);

    setHoveredListRestaurantId(null);

    setActiveExplorerTab(tab);
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
            <GradeChart
              counts={gradeCounts}
              filters={filters}
              setFilters={setFilters}
            />
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
              <StatsPanel restaurants={visibleRestaurants} />
            </div>
          </div>

          <div className="map-view">
            <Suspense fallback={<MapViewSkeleton />}>
              <MapView
                filters={filters}
                searchQuery={searchQuery}
                selectedRestaurantId={selectedRestaurant?.id ?? null}
                hoveredRestaurantId={hoveredListRestaurantId}
                onSelectRestaurant={handleSelectRestaurant}
                onVisibleRestaurantsChange={setVisibleRestaurants}
                onGradeCountsChange={setGradeCounts}
              />
            </Suspense>
          </div>
        </div>

        <div className="search-panel">
          <ExplorerSearch onSearchChange={setSearchQuery} />
        </div>

        <div className="explorer">
          <div className="explorer-tabs">
            <button
              type="button"
              className={
                activeExplorerTab === "list"
                  ? "explorer-tab active"
                  : "explorer-tab"
              }
              onClick={() => {
                handleExplorerTabChange("list");
              }}>
              Restaurant List
            </button>

            <button
              type="button"
              className={
                activeExplorerTab === "details"
                  ? "explorer-tab active"
                  : "explorer-tab"
              }
              onClick={() => {
                handleExplorerTabChange("details");
              }}>
              Restaurant Details
            </button>

            <button
              type="button"
              className={
                activeExplorerTab === "report"
                  ? "explorer-tab active"
                  : "explorer-tab"
              }
              onClick={() => {
                handleExplorerTabChange("report");
              }}>
              Inspection Reports
            </button>
          </div>

          <div className="explorer-content">
            <div
              className={`restaurant-list ${
                activeExplorerTab === "list" ? "" : "explorer-pane-hidden"
              }`}>
              <RestaurantList
                restaurants={visibleRestaurants}
                selectedRestaurantId={selectedRestaurant?.id ?? null}
                onSelectRestaurant={handleSelectRestaurant}
                onHoverRestaurant={handleHoverRestaurantInList}>
                <NoticeOverlay
                  triggerKey={`${gradesKey}-${boroughsKey}-${searchQuery}`}
                  durationMs={FILTER_NOTICE_DURATION_MS}>
                  {filters.grades.length > 0 && (
                    <span className="filter-notice-group">
                      Grade:{" "}
                      {filters.grades.map((grade, index) => (
                        <span key={grade}>
                          <span
                            style={{
                              color: GRADE_FILTER_COLORS[grade],
                            }}>
                            {grade}
                          </span>

                          {index < filters.grades.length - 1 && ", "}
                        </span>
                      ))}
                    </span>
                  )}

                  {filters.grades.length > 0 && filters.boroughs.length > 0 && (
                    <span className="filter-notice-separator">, </span>
                  )}

                  {filters.boroughs.length > 0 && (
                    <span className="filter-notice-group">
                      Borough: {filters.boroughs.join(", ")}
                    </span>
                  )}

                  {(filters.grades.length > 0 || filters.boroughs.length > 0) &&
                    searchQuery && (
                      <span className="filter-notice-separator">, </span>
                    )}

                  {searchQuery && (
                    <span className="filter-notice-group">
                      Search: &quot;
                      {searchQuery}
                      &quot;
                    </span>
                  )}

                  {filters.grades.length === 0 &&
                    filters.boroughs.length === 0 &&
                    !searchQuery && (
                      <span className="filter-notice-group">
                        All Restaurants
                      </span>
                    )}
                </NoticeOverlay>
              </RestaurantList>
            </div>

            <div
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
              className={`restaurant-report ${
                activeExplorerTab === "report" ? "" : "explorer-pane-hidden"
              }`}>
              <RestaurantReport
                restaurant={selectedRestaurant}
                history={history}
                selectedInspectionId={reportInspectionId}
                violationCodes={violationCodes}
                onSelectInspection={handleSelectInspection}
              />
            </div>
          </div>
        </div>

        <div className="performance-chart">
          <PerformanceChart
            restaurant={selectedRestaurant}
            history={history}
            isLoadingHistory={isLoadingHistory}
            onSelectInspection={handleSelectInspection}
            hoveredInspectionId={hoveredInspectionId}
            selectedInspectionId={reportInspectionId}
          />
        </div>

        <div className="dashboard-footer">
          <DashboardFooter />
        </div>
      </main>
    </div>
  );
}
