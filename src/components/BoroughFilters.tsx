// BoroughFilters.tsx
import { faCity } from "@fortawesome/free-solid-svg-icons";
import FilterSection from "./FiltersSection";
import type { Filters, SetFilters } from "../types/filters.tsx";

const boroughs = ["Bronx", "Brooklyn", "Manhattan", "Queens", "Staten Island"] as const;

export default function BoroughFilters({
  filters,
  setFilters,
}: {
  filters: Filters;
  setFilters: SetFilters;
}) {
  return (
    <FilterSection
      label="Borough"
      icon={faCity}
      options={boroughs}
      selected={filters.boroughs}
      onChange={(boroughs) => setFilters({ ...filters, boroughs })}
    />
  );
}