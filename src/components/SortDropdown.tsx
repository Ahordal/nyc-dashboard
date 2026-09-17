// SortDropdown.tsx
//
// Custom dropdown replacing a native <select>, for the Restaurant List's
// "Sort by" controls. APG listbox model: menu takes focus, arrows/Home/
// End move the option, Enter/Space commits, Escape cancels, focus always returns to the trigger.

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
    // preventScroll: the trigger is already in view; without this the
    // browser nudges the list to "reveal" it and the sort bar jumps.
    if (returnFocus) triggerRef.current?.focus({ preventScroll: true });
  }

  function commit(index: number) {
    const option = options[index];
    if (option) onChange(option.value);
    closeMenu();
  }

  // Moves focus into the menu on open, so arrow keys drive it.
  // preventScroll — a plain focus() would scroll the sort bar under the tabs.
  useEffect(() => {
    if (isOpen) listRef.current?.focus({ preventScroll: true });
  }, [isOpen]);

  // Close on outside pointer-down, matching PanelHeader.tsx's info popup:
  // pointerdown (not mousedown) fires reliably and earlier on touch/pen.
  useEffect(() => {
    if (!isOpen) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (containerRef.current?.contains(target)) return;
      setIsOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown, true);
    return () =>
      document.removeEventListener("pointerdown", handlePointerDown, true);
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
