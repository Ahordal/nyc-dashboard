// Dashboard.tsx
//
// Top-level dashboard component.
//
// Owns the dashboard's shared state, assembles the application layout,
// and coordinates data flow between the dashboard's child components.

import DashboardTitle from "./DashboardTitle";
import GradeFilters from "./GradeFilters";
import BoroughFilters from "./BoroughFilters";
import StatsPanel from "./StatsPanel";
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

import { useEffect, useRef, useState } from "react";

type ExplorerTab = "list" | "details" | "report";

// How long the filter-change overlay stays visible before fading out.
const FILTER_NOTICE_DURATION_MS = 2500;

// Maps the Grade filter's button labels ("Pending", "Closed") to the
// corresponding CATEGORY_COLORS keys, same mapping GradeFilters.tsx uses
// for its own buttons -- needed here too so the overlay can color each
// grade letter individually.
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
  const [restaurantCount, setRestaurantCount] = useState<number>(0);

  // Inspection history for the currently selected restaurant, and which
  // single inspection (if any) is selected for the Report tab. Lifted up
  // here -- rather than owned inside RestaurantDetails -- because both
  // RestaurantDetails (the history list) and RestaurantReport (the report
  // detail view) need to read the same data.
  const [history, setHistory] = useState<InspectionEvent[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [selectedInspectionId, setSelectedInspectionId] = useState<
    string | null
  >(null);
  const historyCache = useRef<Map<string, InspectionEvent[]>>(new Map());

  // Violation code descriptions -- fetched once, shared by both Details
  // and Report.
  const [violationCodes, setViolationCodes] = useState<ViolationCodeLookup>({});

  // Transient overlay shown across the whole explorer panel (regardless
  // of which tab is active) whenever the Grade/Borough filters OR the
  // search query change -- just a visibility flag. The restaurant count
  // is provided directly via `onCountChange` from RestaurantList so that
  // the overlay always mirrors the exact total shown in the pagination
  // footer.
  const [showFilterNotice, setShowFilterNotice] = useState(false);
  const isFirstFilterRender = useRef(true);
  const filterNoticeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  // Convert array state to string keys so React detects ANY addition/removal
  const gradesKey = filters.grades.join(",");
  const boroughsKey = filters.boroughs.join(",");

  useEffect(() => {
    if (isFirstFilterRender.current) {
      isFirstFilterRender.current = false;
      return;
    }

    if (filterNoticeTimeoutRef.current) {
      clearTimeout(filterNoticeTimeoutRef.current);
    }

    // Briefly reset to trigger re-render / animation update on rapid succession
    setShowFilterNotice(false);

    // Request animation frame ensures DOM acknowledges the state reset before showing again
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

    fetch("/data/violation-codes.json", { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : {}))
      .then((data: ViolationCodeLookup) => setViolationCodes(data))
      .catch((err) => {
        if (err.name !== "AbortError") setViolationCodes({});
      });

    return () => controller.abort();
  }, []);

  // Load inspection history whenever the selected restaurant changes.
  useEffect(() => {
    setSelectedInspectionId(null);

    if (!selectedRestaurant) {
      setHistory([]);
      setIsLoadingHistory(false);
      return;
    }

    const cached = historyCache.current.get(selectedRestaurant.camis);
    if (cached) {
      setHistory(cached);
      setIsLoadingHistory(false);
      return;
    }

    setHistory([]);
    setIsLoadingHistory(true);

    const controller = new AbortController();

    fetch(`/data/history/${selectedRestaurant.camis}.json`, {
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((data: InspectionEvent[]) => {
        historyCache.current.set(selectedRestaurant.camis, data);
        setHistory(data);
        setIsLoadingHistory(false);
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          setHistory([]);
          setIsLoadingHistory(false);
        }
      });

    return () => controller.abort();
  }, [selectedRestaurant?.camis]);

  // Map clicks (and list-row clicks) should both select the
  // restaurant and bring the person to the tab that actually shows it --
  // selecting one without switching would silently update a panel
  // nobody's looking at.
  function handleSelectRestaurant(restaurant: RestaurantProperties | null) {
    setSelectedRestaurant(restaurant);

    if (restaurant) {
      setActiveExplorerTab("details");
    } else {
      setActiveExplorerTab("list"); // Swaps back to list view when deselected
    }
  }

  // Clicking a row in Inspection History selects that inspection AND
  // jumps straight to the Report tab.
  function handleSelectInspection(inspectionId: string) {
    setSelectedInspectionId(inspectionId);
    setActiveExplorerTab("report");
  }

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <div className="dashboard-title">
          <DashboardTitle />
        </div>

        <div className="dashboard-grade-filters">
          <GradeFilters filters={filters} setFilters={setFilters} />
        </div>

        <div className="dashboard-borough-filters">
          <BoroughFilters filters={filters} setFilters={setFilters} />
        </div>
      </header>

      <main className="dashboard">
        <div className="stats">
          <StatsPanel />
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

        <div className="grade-chart">
          <GradeChart />
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
              onClick={() => setActiveExplorerTab("list")}>
              Restaurant List
            </button>
            <button
              type="button"
              className={
                activeExplorerTab === "details"
                  ? "explorer-tab active"
                  : "explorer-tab"
              }
              onClick={() => setActiveExplorerTab("details")}>
              Restaurant Details
            </button>
            <button
              type="button"
              className={
                activeExplorerTab === "report"
                  ? "explorer-tab active"
                  : "explorer-tab"
              }
              onClick={() => setActiveExplorerTab("report")}>
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

            {/* Transient overlay confirming a filter or search change --
                key forces React to tear down and re-render the element
                on filter/search changes */}
            {showFilterNotice && (
              <div
                key={`${gradesKey}-${boroughsKey}-${searchQuery}`}
                className="filter-notice-overlay"
              >
                <div className="filter-notice-text">
                  {filters.grades.length > 0 && (
                    <span className="filter-notice-group">
                      Grade:{" "}
                      {filters.grades.map((grade, i) => (
                        <span key={grade}>
                          <span
                            style={{ color: GRADE_FILTER_COLORS[grade] }}>
                            {grade}
                          </span>
                          {i < filters.grades.length - 1 && ", "}
                        </span>
                      ))}
                    </span>
                  )}

                  {filters.grades.length > 0 &&
                    filters.boroughs.length > 0 && (
                      <span className="filter-notice-separator"> · </span>
                    )}

                  {filters.boroughs.length > 0 && (
                    <span className="filter-notice-group">
                      Borough: {filters.boroughs.join(", ")}
                    </span>
                  )}

                  {(filters.grades.length > 0 ||
                    filters.boroughs.length > 0) &&
                    searchQuery && (
                      <span className="filter-notice-separator"> · </span>
                    )}

                  {searchQuery && (
                    <span className="filter-notice-group">
                      Search: "{searchQuery}"
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
          <PerformanceChart />
        </div>
      </main>
    </div>
  );
}