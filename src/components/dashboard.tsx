import DashboardTitle from "./DashboardTitle";
import FiltersPanel from "./FiltersPanel";
import StatsPanel from "./StatsPanel";
import GradeChart from "./GradeChart";
import RestaurantList from "./RestaurantList";
import RestaurantDetails from "./RestaurantDetails";
import MapView from "./MapView";
import PerformanceChart from "./PerformanceChart";

export default function Dashboard() {
  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <div className="dashboard-title">
          <DashboardTitle />
        </div>

        <div className="dashboard-filters">
          <FiltersPanel />
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