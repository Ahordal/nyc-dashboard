// GradeFilters.tsx
import { faGraduationCap } from "@fortawesome/free-solid-svg-icons";
import FilterSection from "./FiltersSection";
import type { Filters, SetFilters } from "../types/filters";
import { CATEGORY_COLORS } from "../utils/gradeCategory";

const gradeCategories = ["A", "B", "C", "Pending", "Closed"] as const;

// Maps this filter's button labels to CATEGORY_COLORS' keys -- note the
// casing difference (CATEGORY_COLORS uses lowercase "pending"/"closed",
// these buttons are capitalized for display).
const GRADE_FILTER_COLORS: Record<string, string> = {
  A: CATEGORY_COLORS.A,
  B: CATEGORY_COLORS.B,
  C: CATEGORY_COLORS.C,
  Pending: CATEGORY_COLORS.pending,
  Closed: CATEGORY_COLORS.closed,
};

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
      getActiveColor={(option) => GRADE_FILTER_COLORS[option]}
    />
  );
}