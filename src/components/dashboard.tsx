import DashboardTitle from "./DashboardTitle";
import GradeFilters from "./GradeFilters";
import BoroughFilters from "./BoroughFilters";
import StatsPanel from "./StatsPanel";
import GradeChart from "./GradeChart";
import RestaurantList from "./RestaurantList";
import RestaurantDetails from "./RestaurantDetails";
import MapView from "./MapView";
import PerformanceChart from "./PerformanceChart";
import type { Filters } from "../types/filters.ts";

import { useState } from "react";

export default function Dashboard() {
  const [filters, setFilters] = useState<Filters>({
    grades: [],
    boroughs: [],
  });

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

        <div className="restaurant-list">
          <RestaurantList />
        </div>

        <div className="map-view">
          <MapView />
        </div>

        <div className="grade-chart">
          <GradeChart />
        </div>

        <div className="restaurant-details">
          <RestaurantDetails />
        </div>

        <div className="performance-chart">
          <PerformanceChart />
        </div>
      </main>
    </div>
  );
}
