// SearchRadiusPicker.tsx
//
// Single-select 3-button segmented control for the Search Radius tool's
// flyout panel. Built directly on FilterButton rather than FilterSection
// -- FilterSection is a multi-select array-toggle contract (selected:
// string[], onChange(next: string[])), which doesn't fit a single active
// radius value.

import FilterButton from "./FilterButton";
import {
  SEARCH_RADIUS_OPTIONS_MILES,
  SEARCH_RADIUS_LABELS,
} from "../types/searchRadius";
import type { SearchRadiusMiles } from "../types/searchRadius";

type SearchRadiusPickerProps = {
  value: SearchRadiusMiles;
  onChange: (miles: SearchRadiusMiles) => void;
};

export default function SearchRadiusPicker({
  value,
  onChange,
}: SearchRadiusPickerProps) {
  return (
    <div
      className="search-radius-picker"
      role="group"
      aria-label="Search radius">
      {SEARCH_RADIUS_OPTIONS_MILES.map((miles) => (
        <FilterButton
          key={miles}
          active={value === miles}
          aria-pressed={value === miles}
          onClick={() => onChange(miles)}>
          {SEARCH_RADIUS_LABELS[miles]}
        </FilterButton>
      ))}
    </div>
  );
}
