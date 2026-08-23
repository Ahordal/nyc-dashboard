// GradeFilters.tsx
//
// Configures the dashboard's grade filter.
//
// Supplies the available grade categories, display colors, and state
// bindings for the reusable FilterSection component.

import { faGraduationCap } from "@fortawesome/free-solid-svg-icons";
import FilterSection from "./FiltersSection";
import type { Filters, SetFilters } from "../types/filters";
import { CATEGORY_COLORS } from "../utils/gradeCategory";

const gradeCategories = [
  "A",
  "B",
  "C",
  "Pending",
  "Uninspected",
  "Closed",
] as const;

// Maps the displayed button labels to the corresponding
// CATEGORY_COLORS keys ("Pending" → "pending", etc.).

const GRADE_FILTER_COLORS: Record<string, string> = {
  A: CATEGORY_COLORS.A,
  B: CATEGORY_COLORS.B,
  C: CATEGORY_COLORS.C,
  Pending: CATEGORY_COLORS.pending,
  Uninspected: CATEGORY_COLORS.uninspected,
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