// ExplorerSearch.tsx
//
// Search panel for filtering restaurants by name or cuisine.
// Debounces text input before updating the parent dashboard query.

import { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import PanelHeader from "./PanelHeader";

const DEBOUNCE_MS = 350;

type ExplorerSearchProps = {
  onSearchChange: (query: string) => void;
};

export default function ExplorerSearch({
  onSearchChange,
}: ExplorerSearchProps) {
  const [inputValue, setInputValue] = useState("");

  useEffect(() => {
    const handle = setTimeout(() => {
      onSearchChange(inputValue.trim());
    }, DEBOUNCE_MS);

    return () => clearTimeout(handle);
  }, [inputValue, onSearchChange]);

  function handleClear() {
    setInputValue("");
    onSearchChange(""); // Clear immediately without debounce delay
  }

  return (
    <section className="panel">
      <PanelHeader title="Search" />

      <div className="search-panel-body">
        <div className="search-input-wrapper">
          <input
            type="text"
            className="search-input"
            aria-label="Search restaurants by name or cuisine"
            placeholder="Search restaurants by name, or cuisine"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
          />
          {inputValue && (
            <button
              type="button"
              className="search-clear-button"
              aria-label="Clear search"
              onClick={handleClear}>
              <FontAwesomeIcon icon={faXmark} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </section>
  );
}