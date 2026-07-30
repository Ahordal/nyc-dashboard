// RestaurantList.tsx
import PanelHeader from "./PanelHeader";

const RESTAURANT_LIST_INFO_CONTENT = (
  <div className="info-popup-section">
    <p>
      Shows restaurants currently visible in the map view, respecting any
      active Grade and Borough filters and the search field above.
    </p>
  </div>
);

export default function RestaurantList() {
  return (
    <section className="panel restaurant-list-panel">
      <PanelHeader
        title="Restaurant List"
        infoContent={RESTAURANT_LIST_INFO_CONTENT}
      />

      <div className="panel-scroll-content">{/* list items go here */}</div>
    </section>
  );
}