// FiltersSection.tsx
//
// Generic multi-select filter panel: toggle buttons, an optional custom
// active colour per option, and a clear-all action.

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import FilterButton from "./FilterButton";

type FilterSectionProps = {
  label: string;
  icon: IconDefinition;
  options: readonly string[];
  selected: string[];
  onChange: (next: string[]) => void;
  getActiveColor?: (option: string) => string | undefined;
  // For light active colours (gold) that white text can't sit on.
  activeTextColor?: string;
  // Off for single-option toggles, where the option already clears itself.
  showClear?: boolean;
};

export default function FilterSection({
  label,
  icon,
  options,
  selected,
  onChange,
  getActiveColor,
  activeTextColor,
  showClear = true,
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
            ? { backgroundColor: activeColor, borderColor: activeColor, color: activeTextColor }
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
        {/* display:contents on desktop; on the mobile drawer it becomes a
           flex row hanging Clear into the gutter. */}
        <div className="filter-options">
          {showClear && (
            <span className="filter-clear">
              <FilterButton onClick={() => onChange([])}>Clear</FilterButton>
            </span>
          )}
          {options.map(renderButton)}
          {/* Desktop popover's clear; CSS shows one of the two per layout. */}
          {showClear && (
            <FilterButton
              className="filter-clear-x"
              aria-label={`Clear ${label} filter`}
              onClick={() => onChange([])}
            >
              <FontAwesomeIcon icon={faXmark} aria-hidden="true" />
            </FilterButton>
          )}
        </div>
      </div>
    </section>
  );
}
