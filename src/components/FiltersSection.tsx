// FilterSection.tsx
//
// Generic multi-select filter panel: toggle buttons, an optional custom
// active colour per option, and a clear-all action.

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
  function renderButton(option: string) {
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
  }

  return (
    <section className="panel">
      <div className="filter-group">
        <span className="filter-label">
          <FontAwesomeIcon icon={icon} />
          <span>{label}</span>
        </span>
        {/* Wrapper is display:contents on desktop (no layout effect); on the
           mobile drawer it becomes a flex row that hangs Clear into the
           gutter and wraps the options as space runs out. */}
        <div className="filter-options">
          <span className="filter-clear">
            <FilterButton onClick={() => onChange([])}>Clear</FilterButton>
          </span>
          {options.map(renderButton)}
        </div>
      </div>
    </section>
  );
}
