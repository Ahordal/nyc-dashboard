import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCity } from "@fortawesome/free-solid-svg-icons";
import FilterButton from "./FilterButton";

export default function BoroughFilters() {
  return (
    <section className="panel">
      <div className="filter-group">
        <span className="filter-label">
          <FontAwesomeIcon icon={faCity} />
          <span>Borough</span>
        </span>

        <FilterButton>Clear</FilterButton>

        <FilterButton>Bronx</FilterButton>
        <FilterButton>Brooklyn</FilterButton>
        <FilterButton>Manhattan</FilterButton>
        <FilterButton>Queens</FilterButton>
        <FilterButton>Staten Island</FilterButton>
      </div>
    </section>
  );
}
