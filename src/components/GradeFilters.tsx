import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faGraduationCap } from "@fortawesome/free-solid-svg-icons";
import FilterButton from "./FilterButton";

export default function GradeFilters() {
  return (
    <section className="panel">
      <div className="filter-group">
        <span className="filter-label">
          <FontAwesomeIcon icon={faGraduationCap} />
          <span>Grade</span>
        </span>

        <FilterButton>Clear</FilterButton>

        <FilterButton active>A</FilterButton>
        <FilterButton>B</FilterButton>
        <FilterButton>C</FilterButton>
        <FilterButton>N</FilterButton>
        <FilterButton>Z</FilterButton>
      </div>
    </section>
  );
}
