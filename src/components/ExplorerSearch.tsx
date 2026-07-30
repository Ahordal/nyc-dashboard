// ExplorerSearch.tsx
//
// Standalone search panel that sits above the explorer (list/details)
// column, matching its width. Structural placeholder only -- not yet
// wired to any search/filter state or data. That logic (debounced
// query, combining with the existing grade/borough filters into one
// shared result set, resetting pagination on change) comes in a
// follow-up pass.
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFilter } from "@fortawesome/free-solid-svg-icons";

export default function ExplorerSearch() {
  return (
    <section className="panel">
      <div className="panel-header">
        <span className="panel-header-title">Search</span>
      </div>

      <div className="search-panel-body">
        <input
          type="text"
          className="search-input"
          placeholder="Search restaurants..."
        />
        <button
          type="button"
          className="search-filter-toggle"
          aria-label="Search filters"
          
        >
          <FontAwesomeIcon icon={faFilter} aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}
