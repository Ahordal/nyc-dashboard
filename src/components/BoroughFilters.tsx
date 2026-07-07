import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCity } from "@fortawesome/free-solid-svg-icons";
import FilterButton from "./FilterButton";

type BoroughFiltersProps = {
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

const boroughs = ["Bronx", "Brooklyn", "Manhattan", "Queens", "Staten Island"];

export default function BoroughFilters({
  filters,
  setFilters,
}: BoroughFiltersProps) {
  return (
    <section className="panel">
      <div className="filter-group">
        <span className="filter-label">
          <FontAwesomeIcon icon={faCity} />
          <span>Borough</span>
        </span>
<span className="filter-clear">
        <FilterButton
          onClick={() =>
            setFilters({
              ...filters,
              boroughs: [],
            })
          }>
          Clear
        </FilterButton>
</span>
        {boroughs.map((borough) => (
          <FilterButton
            key={borough}
            active={filters.boroughs.includes(borough)}
            onClick={() => {
              if (filters.boroughs.includes(borough)) {
                setFilters({
                  ...filters,
                  boroughs: filters.boroughs.filter((b) => b !== borough),
                });
              } else {
                setFilters({
                  ...filters,
                  boroughs: [...filters.boroughs, borough],
                });
              }
            }}>
            {borough}
          </FilterButton>
        ))}
      </div>
    </section>
  );
}
