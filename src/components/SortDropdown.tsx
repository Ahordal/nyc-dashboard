// SortDropdown.tsx
//
// Custom dropdown replacing a native <select>, used for the Restaurant
// List's "Sort by" controls.

import { useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronDown } from "@fortawesome/free-solid-svg-icons";

type SortDropdownOption<T extends string> = {
  value: T;
  label: string;
};

type SortDropdownProps<T extends string> = {
  value: T;
  options: SortDropdownOption<T>[];
  onChange: (value: T) => void;
  labelId?: string;
};

export default function SortDropdown<T extends string>({
  value,
  options,
  onChange,
  labelId,
}: SortDropdownProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const selectedOption = options.find((o) => o.value === value);

  // Close on click outside, the same pattern PanelHeader.tsx uses for its
  // info popup.
  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // Close on Escape, for basic keyboard support.
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsOpen(false);
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  return (
    <div className="sort-dropdown" ref={containerRef}>
      <button
        type="button"
        className="sort-dropdown-trigger"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-labelledby={labelId}
        onClick={() => setIsOpen((v) => !v)}>
        <span className="sort-dropdown-trigger-label">
          {selectedOption?.label ?? ""}
        </span>
        <FontAwesomeIcon
          icon={faChevronDown}
          className={`sort-dropdown-chevron ${isOpen ? "open" : ""}`}
          aria-hidden="true"
        />
      </button>

      {isOpen && (
        <ul className="sort-dropdown-menu" role="listbox">
          {options.map((option) => (
            <li
              key={option.value}
              role="option"
              aria-selected={option.value === value}
              className={`sort-dropdown-option ${
                option.value === value ? "selected" : ""
              }`}
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}>
              {option.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
