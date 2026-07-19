// GradeFilters.tsx
import { faGraduationCap } from "@fortawesome/free-solid-svg-icons";
import FilterSection from "./FiltersSection";
import type { Filters, SetFilters } from "../types/filters";

const grades = ["A", "B", "C", "N", "Z"] as const;

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
      options={grades}
      selected={filters.grades}
      onChange={(grades) => setFilters({ ...filters, grades })}
    />
  );
}