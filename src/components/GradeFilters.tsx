import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faGraduationCap } from "@fortawesome/free-solid-svg-icons";
import FilterButton from "./FilterButton";

const grades = ["A", "B", "C", "N", "Z"];

type GradeFiltersProps = {
  filters: {
    grades: string[];
    boroughs: string[];
  };

  setFilters: React.Dispatch<
    React.SetStateAction<{
      grades: string[];
      boroughs: string[];
    }>
  >;
};

export default function GradeFilters({
  filters,
  setFilters,
}: GradeFiltersProps) {
  return (
    <section className="panel">
      <div className="filter-group">
        <span className="filter-label">
          <FontAwesomeIcon icon={faGraduationCap} />
          <span>Grade</span>
        </span>
        <span className="filter-clear">
          <FilterButton
            onClick={() =>
              setFilters({
                ...filters,
                grades: [],
              })
            }>
            Clear
          </FilterButton>
        </span>
        {grades.map((grade) => (
          <FilterButton
            key={grade}
            active={filters.grades.includes(grade)}
            onClick={() => {
              if (filters.grades.includes(grade)) {
                setFilters({
                  ...filters,
                  grades: filters.grades.filter((g) => g !== grade),
                });
              } else {
                setFilters({
                  ...filters,
                  grades: [...filters.grades, grade],
                });
              }
            }}>
            {grade}
          </FilterButton>
        ))}
      </div>
    </section>
  );
}
