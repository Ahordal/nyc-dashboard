import FiltersPanel from "./FiltersPanel";
import StatsPanel from "./StatsPanel";
import GradeChart from "./GradeChart";
import RestaurantList from "./RestaurantList";
import RestaurantDetails from "./RestaurantDetails";
import MapView from "./MapView";
import PerformanceChart from "./PerformanceChart";

export default function Dashboard() {
  return (
    <main className="dashboard">
      <div className="filters">
        <FiltersPanel />
      </div>

      <div className="stats">
        <StatsPanel />
      </div>

      <div className="grade-chart">
        <GradeChart />
      </div>

      <div className="restaurant-list">
        <RestaurantList />
      </div>

      <div className="restaurant-details">
        <RestaurantDetails />
      </div>

      <div className="map-view">
        <MapView />
      </div>

      <div className="performance-chart">
        <PerformanceChart />
      </div>
    </main>
  );
}