//RestaurantList.tsx
//
//Displays a sorted and paginated list of restaurant inspection cards, automatically navigating to the page containing the selected restaurant.
import { useEffect, useMemo, useRef, useState } from "react";

import PanelHeader from "./PanelHeader";
import InfoPopupContent from "./InfoPopupContent";
import SortDropdown from "./SortDropdown";
import RestaurantCard from "./RestaurantCard";
import PaginationBar from "./PaginationBar";
import NoticeOverlay from "./NoticeOverlay";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowUp } from "@fortawesome/free-solid-svg-icons";

import type { RestaurantProperties } from "../types/restaurant";
import { getGradeCategory } from "../utils/gradeCategory";

const RESTAURANT_LIST_INFO_CONTENT = (
  <InfoPopupContent
    overview={
      <p>
        Shows restaurants currently visible in the map view, respecting any
        active Grade and Borough filters and the search field above.
      </p>
    }
    howToUse={
      <ul>
        <li>
          Select a restaurant card to display that restaurant&apos;s details and
          inspection history, and to pan and zoom the map to its location.
        </li>

        <li>
          Use the sort field and direction controls to reorder the restaurant
          results.
        </li>

        <li>Use the pagination controls to move between pages of results.</li>
      </ul>
    }
    dataNotes={
      <ul>
        <li>
          The number of available results and pages updates as the map view,
          active filters, or search results change.
        </li>
      </ul>
    }
  />
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

const SORT_NOTICE_DURATION_MS = 1300;

const CARD_HEIGHT = 88;
const MIN_PAGE_SIZE = 4;

type RestaurantListProps = {
  restaurants: RestaurantProperties[];
  selectedRestaurantId?: string | null;
  onSelectRestaurant?: (restaurant: RestaurantProperties) => void;
  onHoverRestaurant?: (restaurant: RestaurantProperties | null) => void;
  children?: React.ReactNode; // Slot for external filter notice overlay
};

export default function RestaurantList({
  restaurants,
  selectedRestaurantId = null,
  onSelectRestaurant,
  onHoverRestaurant,
  children,
}: RestaurantListProps) {
  const [showInfo, setShowInfo] = useState(false);
  const [sortField, setSortField] = useState<SortField>("inspection_date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const cardListRef = useRef<HTMLDivElement | null>(null);
  const prevRestaurantCountRef = useRef(restaurants.length);
  const prevSelectedIdRef = useRef<string | null>(selectedRestaurantId);

  useEffect(() => {
    const cardList = cardListRef.current;
    if (!cardList) return;

    const recomputePageSize = () => {
      const availableHeight = cardList.clientHeight;
      const fit = Math.floor(availableHeight / CARD_HEIGHT);
      setPageSize(Math.max(MIN_PAGE_SIZE, fit));
    };

    recomputePageSize();
    const resizeObserver = new ResizeObserver(recomputePageSize);
    resizeObserver.observe(cardList);

    return () => resizeObserver.disconnect();
  }, []);

  const sorted = useMemo(() => {
    const sortableList = [...restaurants];
    const directionMultiplier = sortDirection === "asc" ? 1 : -1;

    sortableList.sort((first, second) => {
      let comparison = 0;

      switch (sortField) {
        case "name":
          comparison = (first.name || "").localeCompare(second.name || "");
          break;
        case "cuisine":
          comparison = (first.cuisine || "").localeCompare(
            second.cuisine || "",
          );
          break;
        case "score":
          comparison = (first.score ?? 0) - (second.score ?? 0);
          break;
        case "inspection_date": {
          const t1 = first.inspection_date
            ? new Date(first.inspection_date).getTime()
            : 0;
          const t2 = second.inspection_date
            ? new Date(second.inspection_date).getTime()
            : 0;
          comparison =
            (Number.isNaN(t1) ? 0 : t1) - (Number.isNaN(t2) ? 0 : t2);
          break;
        }
        case "grade": {
          const getRank = (r: RestaurantProperties) => {
            const category = getGradeCategory(r.action, r.grade, r.score);
            switch (category) {
              case "A": return 0;
              case "B": return 1;
              case "C": return 2;
              case "pending": return 3;
              case "uninspected": return 4;
              case "closed": return 5;
              default: return 6;
            }
          };

          comparison = getRank(first) - getRank(second);
          break;
        }
        default:
          comparison = 0;
      }

      if (comparison !== 0) return comparison * directionMultiplier;
      const nameTie = (first.name || "").localeCompare(second.name || "");
      if (nameTie !== 0) return nameTie;
      return (first.id || "").localeCompare(second.id || "");
    });

    return sortableList;
  }, [restaurants, sortField, sortDirection]);

  // Option B: Automatically navigate pagination to page containing selectedRestaurantId
  useEffect(() => {
    const countChanged = prevRestaurantCountRef.current !== restaurants.length;
    const selectedChanged = prevSelectedIdRef.current !== selectedRestaurantId;

    prevRestaurantCountRef.current = restaurants.length;
    prevSelectedIdRef.current = selectedRestaurantId;

    if (selectedRestaurantId && sorted.length > 0) {
      const index = sorted.findIndex((r) => r.id === selectedRestaurantId);
      if (index !== -1) {
        const targetPage = Math.floor(index / pageSize) + 1;
        setPage(targetPage);
        return;
      }
    }

    if (countChanged && selectedChanged) {
      setPage(1);
    }
  }, [restaurants.length, selectedRestaurantId, pageSize, sorted, sortField, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const clampedPage = Math.min(page, totalPages);
  const pageStart = (clampedPage - 1) * pageSize;
  const pageItems = sorted.slice(pageStart, pageStart + pageSize);

  const currentSortLabel =
    SORT_FIELD_OPTIONS.find((option) => option.value === sortField)?.label ??
    "";

  return (
    <section className="panel restaurant-list-panel">
      <PanelHeader
        title="Restaurant List"
        infoContent={RESTAURANT_LIST_INFO_CONTENT}
        onInfoClick={() => {
          setShowInfo((currentValue) => !currentValue);
        }}
        isInfoOpen={showInfo}
      />

      {showInfo ? (
        <div className="panel-scroll-content">
          {RESTAURANT_LIST_INFO_CONTENT}
        </div>
      ) : (
        <div ref={containerRef} className="restaurant-list-container">
          <div className="restaurant-list-sort-bar">
            <span id="sort-field-label" className="sort-label">
              Sort Results by:
            </span>

            <SortDropdown
              value={sortField}
              options={SORT_FIELD_OPTIONS}
              onChange={(value) => {
                setSortField(value);
              }}
              labelId="sort-field-label"
            />

            <button
              type="button"
              className="sort-direction-toggle"
              onClick={() => {
                setSortDirection((current) =>
                  current === "asc" ? "desc" : "asc",
                );
              }}
              aria-label={`Sort ${sortDirection === "asc" ? "descending" : "ascending"}`}>
              <FontAwesomeIcon
                icon={faArrowUp}
                className={`sort-direction-arrow ${sortDirection === "desc" ? "flipped" : ""}`}
              />
              <span>{sortDirection === "asc" ? "Ascending" : "Descending"}</span>
            </button>
          </div>

          <div ref={cardListRef} className="restaurant-card-list">
            {pageItems.map((restaurant) => (
              <RestaurantCard
                key={restaurant.id}
                restaurant={restaurant}
                isSelected={restaurant.id === selectedRestaurantId}
                onClick={(selected) => onSelectRestaurant?.(selected)}
                onHover={onHoverRestaurant}
              />
            ))}

            {pageItems.length === 0 && (
              <div className="restaurant-list-empty">
                No restaurants match the current view, filters or search results.
              </div>
            )}

            <NoticeOverlay
              triggerKey={`${sortField}-${sortDirection}`}
              durationMs={SORT_NOTICE_DURATION_MS}>
              Sorted by {currentSortLabel} —{" "}
              {sortDirection === "asc" ? "Ascending" : "Descending"}
            </NoticeOverlay>

            {children}
          </div>

          <PaginationBar
            currentPage={clampedPage}
            totalPages={totalPages}
            totalItems={sorted.length}
            onPageChange={setPage}
            itemName="restaurants"
          />
        </div>
      )}
    </section>
  );
}