// RestaurantList.tsx (Card View Variant)

import { useEffect, useMemo, useRef, useState } from "react";
import PanelHeader from "./PanelHeader";
import SortDropdown from "./SortDropdown";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowUp } from "@fortawesome/free-solid-svg-icons";
import type { RestaurantProperties } from "../types/restaurant";
import { getGradeCategory, CATEGORY_COLORS } from "../utils/gradeCategory";
import { toTitleCase } from "../utils/toTitleCase";

const RESTAURANT_LIST_INFO_CONTENT = (
  <div className="info-popup-section">
    <p>
      Shows restaurants currently visible in the map view, respecting any active
      Grade and Borough filters and the search field above.
    </p>
  </div>
);

type SortField = "name" | "grade" | "score" | "inspection_date" | "cuisine";
type SortDirection = "asc" | "desc";

const SORT_FIELD_OPTIONS: { value: SortField; label: string }[] = [
  { value: "inspection_date", label: "Inspection Date" },
  { value: "name", label: "Restaurant Name" },
  { value: "cuisine", label: "Cuisine Description" },
  { value: "grade", label: "Grade" },
  { value: "score", label: "Score" },
];

// How long the sort-change overlay stays visible before fading out --
// same duration as the global filter-change overlay in Dashboard.tsx,
// for visual consistency between the two.
const SORT_NOTICE_DURATION_MS = 1750;

// Fixed card height (including padding/margins) for deterministic pageSize math
const CARD_HEIGHT = 88;
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
  onCountChange?: (count: number) => void;
};

export default function RestaurantList({
  restaurants,
  selectedRestaurantId = null,
  onSelectRestaurant,
  onCountChange,
}: RestaurantListProps) {
  const [sortField, setSortField] = useState<SortField>("inspection_date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const cardListRef = useRef<HTMLDivElement | null>(null);

  const prevRestaurantCountRef = useRef(restaurants.length);
  const prevSelectedIdForResetRef = useRef<string | null>(selectedRestaurantId);

  // Local, List-panel-scoped notice confirming a sort change -- distinct
  // from Dashboard's cross-tab filter-change overlay, since sort never
  // affects which restaurants are shown or the map itself; it's purely
  // this panel's own display order. Skips the initial mount (the default
  // sort applying on first render isn't a "change").
  const [showSortNotice, setShowSortNotice] = useState(false);
  const isFirstSortRender = useRef(true);
  const sortNoticeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  useEffect(() => {
    if (isFirstSortRender.current) {
      isFirstSortRender.current = false;
      return;
    }

    if (sortNoticeTimeoutRef.current) {
      clearTimeout(sortNoticeTimeoutRef.current);
    }

    setShowSortNotice(true);
    sortNoticeTimeoutRef.current = setTimeout(() => {
      setShowSortNotice(false);
    }, SORT_NOTICE_DURATION_MS);
  }, [sortField, sortDirection]);

  useEffect(() => {
    return () => {
      if (sortNoticeTimeoutRef.current) {
        clearTimeout(sortNoticeTimeoutRef.current);
      }
    };
  }, []);

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
        case "cuisine":
          return (
            (a.restaurant.cuisine || "").localeCompare(
              b.restaurant.cuisine || "",
            ) * dir
          );
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

          if (aPending !== bPending) return aPending ? 1 : -1;
          if (aPending && bPending) return 0;

          const rank = (r: RestaurantProperties) =>
            r.grade === "A" ? 0 : r.grade === "B" ? 1 : 2;
          const rankDiff = rank(a.restaurant) - rank(b.restaurant);
          if (rankDiff !== 0) return rankDiff * dir;

          return (a.restaurant.score - b.restaurant.score) * dir;
        }
        default:
          return 0;
      }
    });

    return withCategory;
  }, [restaurants, sortField, sortDirection]);

  useEffect(() => {
    onCountChange?.(sorted.length);
  }, [sorted.length, onCountChange]);

  useEffect(() => {
    const countChanged = prevRestaurantCountRef.current !== restaurants.length;
    const justDeselected =
      prevSelectedIdForResetRef.current !== null &&
      selectedRestaurantId === null;

    prevRestaurantCountRef.current = restaurants.length;
    prevSelectedIdForResetRef.current = selectedRestaurantId;

    if (selectedRestaurantId && sorted.length > 0) {
      const index = sorted.findIndex(
        ({ restaurant }) => restaurant.id === selectedRestaurantId,
      );
      if (index !== -1) {
        setPage(Math.floor(index / pageSize) + 1);
        return;
      }
    }

    if (countChanged || justDeselected) {
      setPage(1);
    }
  }, [restaurants.length, selectedRestaurantId, sorted, pageSize]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const clampedPage = Math.min(page, totalPages);
  const pageStart = (clampedPage - 1) * pageSize;
  const pageItems = sorted.slice(pageStart, pageStart + pageSize);

  const currentSortLabel =
    SORT_FIELD_OPTIONS.find((o) => o.value === sortField)?.label ?? "";

  return (
    <section className="panel restaurant-list-panel">
      <PanelHeader
        title="Restaurant List"
        infoContent={RESTAURANT_LIST_INFO_CONTENT}
      />

      <div className="restaurant-list-container" ref={containerRef}>
        {/* Sort Controls Bar */}
        <div className="restaurant-list-sort-bar">
          <span id="sort-field-label" className="sort-label">
            Sort Results by:
          </span>
          <SortDropdown
            value={sortField}
            options={SORT_FIELD_OPTIONS}
            onChange={(value) => {
              setSortField(value);
              setPage(1);
            }}
            labelId="sort-field-label"
          />

          <button
            type="button"
            className="sort-direction-toggle"
            onClick={() => {
              setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
              setPage(1);
            }}
            aria-label={`Sort ${sortDirection === "asc" ? "descending" : "ascending"}`}>
            <FontAwesomeIcon
              icon={faArrowUp}
              className={`sort-direction-arrow ${sortDirection === "desc" ? "flipped" : ""}`}
            />
            <span>{sortDirection === "asc" ? "Ascending" : "Descending"}</span>
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
                style={
                  {
                    "--card-grade-color": categoryColor,
                    ...(isSelected ? { borderColor: categoryColor } : {}),
                  } as React.CSSProperties
                }
                onClick={() => onSelectRestaurant?.(restaurant)}>
                <div className="card-main">
                  <div
                    className="card-title"
                    style={{ color: categoryColor }}
                    title={name}>
                    {name}
                  </div>
                  {address && <div className="card-subtext">{address}</div>}
                  {restaurant.cuisine && (
                    <div className="card-meta">
                      <span className="card-meta-label">Cuisine:</span>{" "}
                      {restaurant.cuisine}
                    </div>
                  )}
                  <div className="card-meta">
                    <span className="card-meta-label">Inspected:</span>{" "}
                    {formatDate(restaurant.inspection_date)}
                  </div>
                </div>

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

        {sorted.length > 0 && (
          <div className="restaurant-list-pagination">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={clampedPage === 1}>
              Previous
            </button>
            <span>
              Page {clampedPage} of {totalPages.toLocaleString()} (
              {sorted.length.toLocaleString()} restaurants in map view)
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={clampedPage === totalPages}>
              Next
            </button>
          </div>
        )}

        {/* Transient overlay confirming a sort change -- local to THIS
            panel only, since sort never affects other tabs or the map.
            Reuses the same visual classes as Dashboard's filter-change
            overlay for consistency, but is positioned/scoped separately. */}
        {showSortNotice && (
          <div className="filter-notice-overlay">
            <div className="filter-notice-text">
              Sorted by {currentSortLabel} —{" "}
              {sortDirection === "asc" ? "Ascending" : "Descending"} · Page{" "}
              {clampedPage.toLocaleString()} of {totalPages.toLocaleString()}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
