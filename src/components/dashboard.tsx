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

import { useEffect, useRef, useState } from "react";

type ExplorerTab = "list" | "details" | "report";

export default function Dashboard() {
  const [filters, setFilters] = useState<Filters>({
    grades: [],
    boroughs: [],
  });
  const [selectedRestaurant, setSelectedRestaurant] =
    useState<RestaurantProperties | null>(null);
  const [activeExplorerTab, setActiveExplorerTab] =
    useState<ExplorerTab>("list");
  const [visibleRestaurants, setVisibleRestaurants] = useState<
    RestaurantProperties[]
  >([]);

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
            selectedRestaurantId={selectedRestaurant?.id ?? null}
            onSelectRestaurant={handleSelectRestaurant}
            onVisibleRestaurantsChange={setVisibleRestaurants}
          />
        </div>

        <div className="grade-chart">
          <GradeChart />
        </div>

        <div className="search-panel">
          <ExplorerSearch />
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
          </div>
        </div>

        <div className="performance-chart">
          <PerformanceChart />
        </div>
      </main>
    </div>
  );
}
