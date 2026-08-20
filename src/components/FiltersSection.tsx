// FilterSection.tsx
//
// Generic multi-select filter panel with toggle buttons, optional custom active 
// colors, and a clear-all action.

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import FilterButton from "./FilterButton";

type FilterSectionProps = {
  label: string;
  icon: IconDefinition;
  options: readonly string[];
  selected: string[];
  onChange: (next: string[]) => void;
  getActiveColor?: (option: string) => string | undefined;
};

export default function FilterSection({
  label,
  icon,
  options,
  selected,
  onChange,
  getActiveColor,
}: FilterSectionProps) {
  return (
    <section className="panel">
      <div className="filter-group">
        <span className="filter-label">
          <FontAwesomeIcon icon={icon} />
          <span>{label}</span>
        </span>
        <span className="filter-clear">
          <FilterButton onClick={() => onChange([])}>Clear</FilterButton>
        </span>
        {options.map((option) => {
          const isActive = selected.includes(option);
          const activeColor = isActive ? getActiveColor?.(option) : undefined;

          return (
            <FilterButton
              key={option}
              active={isActive}
              aria-pressed={isActive}
              style={
                activeColor
                  ? { backgroundColor: activeColor, borderColor: activeColor }
                  : undefined
              }
              onClick={() =>
                onChange(
                  isActive
                    ? selected.filter((o) => o !== option)
                    : [...selected, option]
                )
              }
            >
              {option}
            </FilterButton>
          );
        })}
      </div>
    </section>
  );
}