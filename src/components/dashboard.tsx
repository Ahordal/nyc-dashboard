// Dashboard.tsx
//
// Top-level dashboard component.
//
// Owns the dashboard's shared state, assembles the application layout,
// and coordinates data flow between the dashboard's child components.

import { useEffect, useRef, useState } from "react";

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
import MapView from "./MapView";
import PerformanceChart from "./PerformanceChart";

import type { Filters } from "../types/filters";

import type {
  RestaurantProperties,
  InspectionEvent,
  ViolationCodeLookup,
} from "../types/restaurant";

import { CATEGORY_COLORS } from "../utils/gradeCategory";

type ExplorerTab = "list" | "details" | "report";

// How long the filter-change overlay stays visible before fading out.
const FILTER_NOTICE_DURATION_MS = 2500;

// Maps the Grade filter's button labels to the corresponding category colours.
const GRADE_FILTER_COLORS: Record<string, string> = {
  A: CATEGORY_COLORS.A,
  B: CATEGORY_COLORS.B,
  C: CATEGORY_COLORS.C,
  Pending: CATEGORY_COLORS.pending,
  Closed: CATEGORY_COLORS.closed,
};

export default function Dashboard() {
  const [filters, setFilters] = useState<Filters>({
    grades: [],
    boroughs: [],
  });

  const [searchQuery, setSearchQuery] = useState("");

  const [selectedRestaurant, setSelectedRestaurant] =
    useState<RestaurantProperties | null>(null);

  const [activeExplorerTab, setActiveExplorerTab] =
    useState<ExplorerTab>("list");

  const [visibleRestaurants, setVisibleRestaurants] = useState<
    RestaurantProperties[]
  >([]);

  const [restaurantCount, setRestaurantCount] = useState(0);

  // Inspection history for the currently selected restaurant.
  const [history, setHistory] = useState<InspectionEvent[]>([]);

  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // The inspection currently displayed in the Inspection Reports tab.
  const [selectedInspectionId, setSelectedInspectionId] = useState<
    string | null
  >(null);

  // The inspection currently hovered or keyboard-focused in the Details
  // history list. This previews the matching chart point without selecting it.
  const [hoveredInspectionId, setHoveredInspectionId] = useState<string | null>(
    null,
  );

  const historyCache = useRef<Map<string, InspectionEvent[]>>(new Map());

  // Violation code descriptions are fetched once and shared by the report.
  const [violationCodes, setViolationCodes] = useState<ViolationCodeLookup>({});

  // Transient overlay shown when filters or search terms change.
  const [showFilterNotice, setShowFilterNotice] = useState(false);

  const isFirstFilterRender = useRef(true);

  const filterNoticeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const gradesKey = filters.grades.join(",");

  const boroughsKey = filters.boroughs.join(",");

  // A report is pinned on the chart only while the Inspection Reports tab
  // is active. Changing to Restaurant List or Restaurant Details removes the
  // pinned chart popup without forgetting which report was last selected.
  const pinnedInspectionId =
    activeExplorerTab === "report" ? selectedInspectionId : null;

  useEffect(() => {
    if (isFirstFilterRender.current) {
      isFirstFilterRender.current = false;

      return;
    }

    if (filterNoticeTimeoutRef.current) {
      clearTimeout(filterNoticeTimeoutRef.current);
    }

    setShowFilterNotice(false);

    const animationFrame = requestAnimationFrame(() => {
      setShowFilterNotice(true);

      filterNoticeTimeoutRef.current = setTimeout(() => {
        setShowFilterNotice(false);
      }, FILTER_NOTICE_DURATION_MS);
    });

    return () => {
      cancelAnimationFrame(animationFrame);
    };
  }, [gradesKey, boroughsKey, searchQuery]);

  useEffect(() => {
    return () => {
      if (filterNoticeTimeoutRef.current) {
        clearTimeout(filterNoticeTimeoutRef.current);
      }
    };
  }, []);

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

  // Load inspection history whenever the selected restaurant changes.
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
        historyCache.current.set(selectedRestaurant.camis, data);

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
  }, [selectedRestaurant?.camis]);

  // Selecting a restaurant from the list or map opens its Details tab.
  function handleSelectRestaurant(restaurant: RestaurantProperties | null) {
    setHoveredInspectionId(null);

    setSelectedRestaurant(restaurant);

    if (restaurant) {
      setActiveExplorerTab("details");
    } else {
      setActiveExplorerTab("list");
    }
  }

  // Selecting an inspection opens its report and pins the matching chart point.
  function handleSelectInspection(inspectionId: string) {
    setHoveredInspectionId(null);

    setSelectedInspectionId(inspectionId);

    setActiveExplorerTab("report");
  }

  // Preview an inspection from the Details history list without opening it.
  function handleHoverInspection(inspectionId: string | null) {
    setHoveredInspectionId(inspectionId);
  }

  // Clear transient and pinned chart popups when moving away from Report.
  // selectedInspectionId remains stored so returning to Report restores it.
  function handleExplorerTabChange(tab: ExplorerTab) {
    setHoveredInspectionId(null);

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
            <DashboardGuide />
          </div>

          <div className="grade-chart">
            <GradeChart />
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
              <StatsPanel />
            </div>
          </div>

          <div className="map-view">
            <MapView
              filters={filters}
              searchQuery={searchQuery}
              selectedRestaurantId={selectedRestaurant?.id ?? null}
              onSelectRestaurant={handleSelectRestaurant}
              onVisibleRestaurantsChange={setVisibleRestaurants}
            />
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
                onCountChange={setRestaurantCount}
              />
            </div>

            <div
              className={`restaurant-details ${
                activeExplorerTab === "details" ? "" : "explorer-pane-hidden"
              }`}>
              <RestaurantDetails
                restaurant={selectedRestaurant}
                history={history}
                isLoadingHistory={isLoadingHistory}
                selectedInspectionId={selectedInspectionId}
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
                selectedInspectionId={selectedInspectionId}
                violationCodes={violationCodes}
                onSelectInspection={handleSelectInspection}
              />
            </div>

            {showFilterNotice && (
              <div
                key={`${gradesKey}-${boroughsKey}-${searchQuery}`}
                className="filter-notice-overlay">
                <div className="filter-notice-text">
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
                    <span className="filter-notice-separator"> · </span>
                  )}

                  {filters.boroughs.length > 0 && (
                    <span className="filter-notice-group">
                      Borough: {filters.boroughs.join(", ")}
                    </span>
                  )}

                  {(filters.grades.length > 0 || filters.boroughs.length > 0) &&
                    searchQuery && (
                      <span className="filter-notice-separator"> · </span>
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

                  <span className="filter-notice-separator"> — </span>

                  <span className="filter-notice-group">
                    {restaurantCount.toLocaleString()} restaurants
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="performance-chart">
          <PerformanceChart
            restaurant={selectedRestaurant}
            history={history}
            isLoadingHistory={isLoadingHistory}
            onSelectInspection={handleSelectInspection}
            hoveredInspectionId={hoveredInspectionId}
            selectedInspectionId={pinnedInspectionId}
          />
        </div>
      </main>
    </div>
  );
}
