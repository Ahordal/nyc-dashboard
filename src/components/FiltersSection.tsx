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
  // First option label found here starts a fresh row in the mobile
  // drawers: it and the options after it render in a second flex row.
  // No effect on desktop, where both rows are display:contents and flow
  // inline.
  breakBefore?: readonly string[];
};

export default function FilterSection({
  label,
  icon,
  options,
  selected,
  onChange,
  getActiveColor,
  breakBefore,
}: FilterSectionProps) {
  const breakIndex = breakBefore
    ? options.findIndex((option) => breakBefore.includes(option))
    : -1;
  const firstRow = breakIndex >= 0 ? options.slice(0, breakIndex) : options;
  const secondRow = breakIndex >= 0 ? options.slice(breakIndex) : [];

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
           mobile drawer each becomes a flex row -- the first hangs Clear
           into the gutter, and a `breakBefore` split adds a second row. */}
        <div className="filter-options">
          <span className="filter-clear">
            <FilterButton onClick={() => onChange([])}>Clear</FilterButton>
          </span>
          {firstRow.map(renderButton)}
        </div>
        {secondRow.length > 0 && (
          <div className="filter-options">{secondRow.map(renderButton)}</div>
        )}
      </div>
    </section>
  );
}
