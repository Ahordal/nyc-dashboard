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
import MapView from "./MapView";
import PerformanceChart from "./PerformanceChart";
import type { Filters } from "../types/filters";
import type { RestaurantProperties } from "../types/restaurant";

import { useState } from "react";

export default function Dashboard() {
  const [filters, setFilters] = useState<Filters>({
    grades: [],
    boroughs: [],
  });
  const [selectedRestaurant, setSelectedRestaurant] = useState<RestaurantProperties | null>(
    null
  );
  const [activeExplorerTab, setActiveExplorerTab] = useState<"list" | "details">(
    "list"
  );

  // Map clicks should both select the restaurant and bring the person to
  // the tab that actually shows it -- selecting one without switching
  // would silently update a panel nobody's looking at.
function handleSelectRestaurant(restaurant: RestaurantProperties | null) {
  setSelectedRestaurant(restaurant);
  
  if (restaurant) {
    setActiveExplorerTab("details");
  } else {
    setActiveExplorerTab("list"); // Swaps back to list view when deselected
  }
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
          <MapView filters={filters} onSelectRestaurant={handleSelectRestaurant} />
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
          </div>

          <div className="explorer-content">
            {activeExplorerTab === "list" ? (
              <div className="restaurant-list">
                <RestaurantList />
              </div>
            ) : (
              <div className="restaurant-details">
                <RestaurantDetails restaurant={selectedRestaurant} />
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