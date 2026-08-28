// BoroughFilters.tsx
//
// Filter section for selecting NYC boroughs, synced to dashboard filter
// state.

import { faCity } from "@fortawesome/free-solid-svg-icons";
import FilterSection from "./FiltersSection";
import type { Filters, SetFilters } from "../types/filters";

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