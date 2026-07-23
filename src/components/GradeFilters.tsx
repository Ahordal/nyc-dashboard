// GradeFilters.tsx
import { faGraduationCap } from "@fortawesome/free-solid-svg-icons";
import FilterSection from "./FiltersSection";
import type { Filters, SetFilters } from "../types/filters";

// These match the map's actual color categories (see MapView.tsx's
// gradeCategoryExpression), not the raw `grade` field -- a restaurant
// colored "A" on the map might have grade: null, since color is driven
// by score, with Pending/Closed as overrides. Filtering on raw grade
// values would disagree with what's actually shown.
const gradeCategories = ["A", "B", "C", "Pending", "Closed"] as const;

export default function GradeFilters({
  filters,
  setFilters,
}: {
  filters: Filters;
  setFilters: SetFilters;
}) {
  return (
    <FilterSection
      label="Grade"
      icon={faGraduationCap}
      options={gradeCategories}
      selected={filters.grades}
      onChange={(grades) => setFilters({ ...filters, grades })}
    />
  );
}