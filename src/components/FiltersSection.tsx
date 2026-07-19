// FiltersSection.tsx
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import FilterButton from "./FilterButton";

type FilterSectionProps = {
  label: string;
  icon: IconDefinition;
  options: readonly string[];
  selected: string[];
  onChange: (next: string[]) => void;
};

export default function FilterSection({
  label,
  icon,
  options,
  selected,
  onChange,
}: FilterSectionProps) {
  const labelId = `filter-label-${label.toLowerCase().replace(/\s+/g, "-")}`;

  return (
    <section className="panel">
      <div className="filter-group" role="group" aria-labelledby={labelId}>
        <span className="filter-label" id={labelId}>
          <FontAwesomeIcon icon={icon} />
          <span>{label}</span>
        </span>
        <span className="filter-clear">
          <FilterButton onClick={() => onChange([])}>Clear</FilterButton>
        </span>
        {options.map((option) => (
          <FilterButton
            key={option}
            active={selected.includes(option)}
            aria-pressed={selected.includes(option)}
            onClick={() =>
              onChange(
                selected.includes(option)
                  ? selected.filter((o) => o !== option)
                  : [...selected, option]
              )
            }>
            {option}
          </FilterButton>
        ))}
      </div>
    </section>
  );
}