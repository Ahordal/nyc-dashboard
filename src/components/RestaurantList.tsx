// RestaurantList.tsx (Card View Variant)

import { useEffect, useMemo, useRef, useState } from "react";
import PanelHeader from "./PanelHeader";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowUp, faArrowDown } from "@fortawesome/free-solid-svg-icons";
import type { RestaurantProperties } from "../types/restaurant";
import { getGradeCategory, CATEGORY_COLORS } from "../utils/gradeCategory";
import { toTitleCase } from "../utils/toTitleCase";

const RESTAURANT_LIST_INFO_CONTENT = (
  <div className="info-popup-section">
    <h4 className="section-header">How it Works</h4>
    <p>
      The Restaurant List shows restaurants currently visible in the map view, and is sorted by inspection date by default.
    </p>
    
    
  </div>
);

type SortField = "name" | "grade" | "score" | "inspection_date";
type SortDirection = "asc" | "desc";

// Fixed card height (including padding/margins) for deterministic pageSize math
const CARD_HEIGHT = 72;
const MIN_PAGE_SIZE = 4;

function formatDate(raw: string | null): string {
  if (!raw) return "—";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", { timeZone: "UTC" });
}

function formatAddress(restaurant: RestaurantProperties): string {
  const parts = [restaurant.building, restaurant.street]
    .map((p) => p?.trim())
    .filter(Boolean);
  return parts.length > 0 ? toTitleCase(parts.join(" ")) : "";
}

type RestaurantListProps = {
  restaurants: RestaurantProperties[];
  selectedRestaurantId?: string | null;
  onSelectRestaurant?: (restaurant: RestaurantProperties) => void;
};

export default function RestaurantList({
  restaurants,
  selectedRestaurantId = null,
  onSelectRestaurant,
}: RestaurantListProps) {
  const [sortField, setSortField] = useState<SortField>("inspection_date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const cardListRef = useRef<HTMLDivElement | null>(null);
  const prevCountRef = useRef(restaurants.length);

  // Guard page resets on dataset count changes
  useEffect(() => {
    if (prevCountRef.current !== restaurants.length) {
      setPage(1);
      prevCountRef.current = restaurants.length;
    }
  }, [restaurants.length]);

  // Compute exact number of cards that fit in the available pane height
  useEffect(() => {
    const cardList = cardListRef.current;
    if (!cardList) return;

    const recomputePageSize = () => {
      const availableHeight = cardList.clientHeight;
      const fit = Math.floor(availableHeight / CARD_HEIGHT);

      setPageSize((prev) => {
        const next = Math.max(MIN_PAGE_SIZE, fit);
        return next === prev ? prev : next;
      });
    };

    recomputePageSize();

    const resizeObserver = new ResizeObserver(recomputePageSize);
    resizeObserver.observe(cardList);

    return () => resizeObserver.disconnect();
  }, []);

  const sorted = useMemo(() => {
    const withCategory = restaurants.map((restaurant) => ({
      restaurant,
      category: getGradeCategory(
        restaurant.action,
        restaurant.grade,
        restaurant.score,
      ),
    }));

    const dir = sortDirection === "asc" ? 1 : -1;

    withCategory.sort((a, b) => {
      switch (sortField) {
        case "name":
          return a.restaurant.name.localeCompare(b.restaurant.name) * dir;
        case "score":
          return (a.restaurant.score - b.restaurant.score) * dir;
        case "inspection_date":
          return (
            (new Date(a.restaurant.inspection_date).getTime() -
              new Date(b.restaurant.inspection_date).getTime()) *
            dir
          );
        case "grade": {
          const isPending = (r: RestaurantProperties) =>
            !r.grade || r.grade === "N" || r.grade === "P" || r.grade === "Z";

          const aPending = isPending(a.restaurant);
          const bPending = isPending(b.restaurant);

          // Pending/ungraded restaurants aren't a 4th tier below C -- they simply
          // haven't been graded yet. Always keep them at the end of the list,
          // regardless of the asc/desc toggle, rather than letting them flip to
          // the top when sorting descending.
          if (aPending !== bPending) return aPending ? 1 : -1;
          if (aPending && bPending) return 0; // no meaningful order among pending restaurants

          // Both actually graded (A/B/C) -- rank normally, respecting direction
          const rank = (r: RestaurantProperties) =>
            r.grade === "A" ? 0 : r.grade === "B" ? 1 : 2; // r.grade === "C"
          const rankDiff = rank(a.restaurant) - rank(b.restaurant);
          if (rankDiff !== 0) return rankDiff * dir;

          // Tiebreak within the same grade tier -- respects the same direction as
          // the outer sort, so descending ("worst first") also surfaces the
          // worst-scoring restaurant within a tier first, not the best one.
          return (a.restaurant.score - b.restaurant.score) * dir;
        }
        default:
          return 0;
      }
    });

    return withCategory;
  }, [restaurants, sortField, sortDirection]);

  // Automatically navigate to the page containing the selected restaurant --
  // runs whenever the selection, the sort order, or the visible-restaurants
  // set changes, so the page always reflects where the selected restaurant
  // actually sits, regardless of what caused sorted's contents to change.
  useEffect(() => {
    if (!selectedRestaurantId || sorted.length === 0) return;

    const index = sorted.findIndex(
      ({ restaurant }) => restaurant.id === selectedRestaurantId,
    );

    if (index !== -1) {
      const targetPage = Math.floor(index / pageSize) + 1;
      setPage(targetPage);
    }
  }, [selectedRestaurantId, sorted, pageSize]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const clampedPage = Math.min(page, totalPages);
  const pageStart = (clampedPage - 1) * pageSize;
  const pageItems = sorted.slice(pageStart, pageStart + pageSize);

  return (
    <section className="panel restaurant-list-panel">
      <PanelHeader
        title="Restaurant List"
        infoContent={RESTAURANT_LIST_INFO_CONTENT}
      />

      <div className="restaurant-list-container" ref={containerRef}>
        {/* Sort Controls Bar */}
        <div className="restaurant-list-sort-bar">
          <label htmlFor="sort-field-select" className="sort-label">
            Sort Results by:
          </label>
          <select
            id="sort-field-select"
            className="sort-select"
            value={sortField}
            onChange={(e) => {
              setSortField(e.target.value as SortField);
              setPage(1);
            }}>
            <option value="inspection_date">Inspection Date</option>
            <option value="name">Restaurant Name</option>
            <option value="grade">Grade</option>
            <option value="score">Score</option>
          </select>

          <button
            type="button"
            className="sort-direction-toggle"
            onClick={() => {
              setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
              setPage(1);
            }}
            aria-label={`Sort ${sortDirection === "asc" ? "descending" : "ascending"}`}>
            <FontAwesomeIcon
              icon={sortDirection === "asc" ? faArrowUp : faArrowDown}
            />
            <span>{sortDirection === "asc" ? "Asc" : "Desc"}</span>
          </button>
        </div>

        {/* Card List Area */}
        <div className="restaurant-card-list" ref={cardListRef}>
          {pageItems.map(({ restaurant, category }) => {
            const categoryColor = CATEGORY_COLORS[category];
            const isSelected = restaurant.id === selectedRestaurantId;
            const name = toTitleCase(restaurant.name);
            const address = formatAddress(restaurant);

            return (
              <div
                key={restaurant.id}
                className={`restaurant-card ${isSelected ? "selected" : ""}`}
                onClick={() => onSelectRestaurant?.(restaurant)}>
                <div className="card-main">
                  {/* Colored restaurant title matching grade category */}
                  <div
                    className="card-title"
                    style={{ color: categoryColor }}
                    title={name}>
                    {name}
                  </div>
                  {address && <div className="card-subtext">{address}</div>}
                  <div className="card-meta">
                    Inspected: {formatDate(restaurant.inspection_date)}
                  </div>
                </div>

                {/* Side-by-side Grade and Score badge squares */}
                <div className="card-badges">
                  <div className="badge-box">
                    <span className="badge-label">GRADE</span>
                    <span
                      className="badge-val"
                      style={{ color: categoryColor }}>
                      {restaurant.grade ?? "N/A"}
                    </span>
                  </div>

                  <div className="badge-box">
                    <span className="badge-label">SCORE</span>
                    <span
                      className="badge-val"
                      style={{ color: categoryColor }}>
                      {restaurant.score}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}

          {pageItems.length === 0 && (
            <div className="restaurant-list-empty">
              No restaurants match the current view and filters.
            </div>
          )}
        </div>

        {/* Pinned Pagination */}
        {sorted.length > 0 && (
          <div className="restaurant-list-pagination">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={clampedPage === 1}>
              Previous
            </button>
            <span>
              Page {clampedPage} of {totalPages} ({sorted.length} restaurants in
              map view)
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={clampedPage === totalPages}>
              Next
            </button>
          </div>
        )}
      </div>
    </section>
  );
}