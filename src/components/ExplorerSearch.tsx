// ExplorerSearch.tsx
//
// Standalone search panel that sits above the explorer (list/details)
// column, matching its width. Debounces the raw input locally before
// reporting the query up to Dashboard, so a full-dataset search isn't
// re-run on every keystroke -- only once typing pauses.

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
    onSearchChange(""); // clear immediately, don't wait for the debounce
  }

  return (
    <section className="panel">
      <PanelHeader title="Search" />

      <div className="search-panel-body">
        <div className="search-input-wrapper">
          <input
            type="text"
            className="search-input"
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