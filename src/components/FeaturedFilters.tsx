// FeaturedFilters.tsx
//
// The Filters panel's view of the map's gold chip: today's featured
// restaurants. One toggle, so no Clear: "Today" clears itself.

import { faCertificate } from "@fortawesome/free-solid-svg-icons";
import FilterSection from "./FiltersSection";
import type { Filters, SetFilters } from "../types/filters";

const TODAY = "Today";

export default function FeaturedFilters({
  filters,
  setFilters,
}: {
  filters: Filters;
  setFilters: SetFilters;
}) {
  return (
    <FilterSection
      label="Featured"
      icon={faCertificate}
      options={[TODAY]}
      selected={filters.featured ? [TODAY] : []}
      onChange={(next) => {
        const featured = next.includes(TODAY);
        // Featured and Grade cancel out (see GradeFilters).
        setFilters({ ...filters, featured, grades: featured ? [] : filters.grades });
      }}
      getActiveColor={() => "var(--award-gold)"}
      activeTextColor="var(--status-warning-text)"
      showClear={false}
    />
  );
}
