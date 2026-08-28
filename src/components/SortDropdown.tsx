// SortDropdown.tsx
//
// Custom dropdown replacing a native <select>, used for the Restaurant
// List's "Sort by" controls. Implements the APG listbox keyboard model:
// the open menu takes focus, arrow/Home/End move the active option,
// Enter/Space commit it, Escape cancels, and focus returns to the
// trigger either way.

import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
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
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);

  const baseId = useId();
  const optionId = (index: number) => `${baseId}-option-${index}`;

  const selectedIndex = Math.max(
    options.findIndex((o) => o.value === value),
    0,
  );
  const selectedOption = options[selectedIndex];

  function openMenu() {
    setActiveIndex(selectedIndex);
    setIsOpen(true);
  }

  function closeMenu(returnFocus = true) {
    setIsOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }

  function commit(index: number) {
    const option = options[index];
    if (option) onChange(option.value);
    closeMenu();
  }

  // Move focus into the menu once it opens so the arrow keys drive it.
  useEffect(() => {
    if (isOpen) listRef.current?.focus();
  }, [isOpen]);

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

  function handleTriggerKeyDown(event: KeyboardEvent) {
    if (
      event.key === "ArrowDown" ||
      event.key === "ArrowUp" ||
      event.key === "Enter" ||
      event.key === " "
    ) {
      event.preventDefault();
      openMenu();
    }
  }

  function handleListKeyDown(event: KeyboardEvent) {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, options.length - 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
        break;
      case "Home":
        event.preventDefault();
        setActiveIndex(0);
        break;
      case "End":
        event.preventDefault();
        setActiveIndex(options.length - 1);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        commit(activeIndex);
        break;
      case "Escape":
        event.preventDefault();
        closeMenu();
        break;
      case "Tab":
        // Close and hand focus back to the trigger so the browser's
        // default Tab continues from a sane position.
        closeMenu(true);
        break;
      default:
        break;
    }
  }

  return (
    <div className="sort-dropdown" ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        className="sort-dropdown-trigger"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-labelledby={labelId}
        onClick={() => (isOpen ? closeMenu() : openMenu())}
        onKeyDown={handleTriggerKeyDown}>
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
        <ul
          ref={listRef}
          className="sort-dropdown-menu"
          role="listbox"
          tabIndex={-1}
          aria-labelledby={labelId}
          aria-activedescendant={optionId(activeIndex)}
          onKeyDown={handleListKeyDown}>
          {options.map((option, index) => (
            <li
              key={option.value}
              id={optionId(index)}
              role="option"
              aria-selected={option.value === value}
              className={`sort-dropdown-option ${
                option.value === value ? "selected" : ""
              } ${index === activeIndex ? "active" : ""}`}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => commit(index)}>
              {option.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
