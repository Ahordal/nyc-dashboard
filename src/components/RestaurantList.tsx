// RestaurantList.tsx
//
// Displays the restaurants currently included by the map view, filters,
// and search as a sortable and paginated list of cards.

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
          Select a restaurant card to display that restaurant&apos;s details
          and inspection history, and to pan and zoom the map to its
          location.
        </li>

        <li>
          Use the sort field and direction controls to reorder the restaurant
          results.
        </li>

        <li>
          Use the pagination controls to move between pages of results.
        </li>
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

const SORT_NOTICE_DURATION_MS = 900;

const CARD_HEIGHT = 88;
const MIN_PAGE_SIZE = 4;

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

  const prevRestaurantCountRef = useRef(restaurants.length);

  const prevSelectedIdForResetRef = useRef<string | null>(
    selectedRestaurantId,
  );

  useEffect(() => {
    const cardList = cardListRef.current;

    if (!cardList) {
      return;
    }

    const recomputePageSize = () => {
      const availableHeight = cardList.clientHeight;

      const fit = Math.floor(availableHeight / CARD_HEIGHT);

      setPageSize((previousPageSize) => {
        const nextPageSize = Math.max(MIN_PAGE_SIZE, fit);

        return nextPageSize === previousPageSize
          ? previousPageSize
          : nextPageSize;
      });
    };

    recomputePageSize();

    const resizeObserver = new ResizeObserver(recomputePageSize);

    resizeObserver.observe(cardList);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  const sorted = useMemo(() => {
    const sortableList = [...restaurants];

    const directionMultiplier = sortDirection === "asc" ? 1 : -1;

    sortableList.sort((first, second) => {
      switch (sortField) {
        case "name":
          return first.name.localeCompare(second.name) * directionMultiplier;

        case "cuisine":
          return (
            (first.cuisine || "").localeCompare(second.cuisine || "") *
            directionMultiplier
          );

        case "score":
          return (first.score - second.score) * directionMultiplier;

        case "inspection_date":
          return (
            (new Date(first.inspection_date).getTime() -
              new Date(second.inspection_date).getTime()) *
            directionMultiplier
          );

        case "grade": {
          const isPending = (restaurant: RestaurantProperties) =>
            !restaurant.grade ||
            restaurant.grade === "N" ||
            restaurant.grade === "P" ||
            restaurant.grade === "Z";

          const firstPending = isPending(first);

          const secondPending = isPending(second);

          if (firstPending !== secondPending) {
            return firstPending ? 1 : -1;
          }

          if (firstPending && secondPending) {
            return 0;
          }

          const rank = (restaurant: RestaurantProperties) =>
            restaurant.grade === "A" ? 0 : restaurant.grade === "B" ? 1 : 2;

          const rankDifference = rank(first) - rank(second);

          if (rankDifference !== 0) {
            return rankDifference * directionMultiplier;
          }

          return (first.score - second.score) * directionMultiplier;
        }

        default:
          return 0;
      }
    });

    return sortableList;
  }, [restaurants, sortField, sortDirection]);

  useEffect(() => {
    const countChanged =
      prevRestaurantCountRef.current !== restaurants.length;

    const justDeselected =
      prevSelectedIdForResetRef.current !== null &&
      selectedRestaurantId === null;

    prevRestaurantCountRef.current = restaurants.length;

    prevSelectedIdForResetRef.current = selectedRestaurantId;

    if (selectedRestaurantId && sorted.length > 0) {
      const index = sorted.findIndex(
        (restaurant) => restaurant.id === selectedRestaurantId,
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
    SORT_FIELD_OPTIONS.find((option) => option.value === sortField)?.label ??
    "";

  return (
    <section className="panel restaurant-list-panel">
      <PanelHeader
        title="Restaurant List"
        infoContent={RESTAURANT_LIST_INFO_CONTENT}
      />

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
              setPage(1);
            }}
            labelId="sort-field-label"
          />

          <button
            type="button"
            className="sort-direction-toggle"
            onClick={() => {
              setSortDirection((currentDirection) =>
                currentDirection === "asc" ? "desc" : "asc",
              );

              setPage(1);
            }}
            aria-label={`Sort ${
              sortDirection === "asc" ? "descending" : "ascending"
            }`}>
            <FontAwesomeIcon
              icon={faArrowUp}
              className={`sort-direction-arrow ${
                sortDirection === "desc" ? "flipped" : ""
              }`}
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
              onClick={(selectedRestaurant) => {
                onSelectRestaurant?.(selectedRestaurant);
              }}
            />
          ))}

          {pageItems.length === 0 && (
            <div className="restaurant-list-empty">
              No restaurants match the current view and filters.
            </div>
          )}
        </div>

        <PaginationBar
          currentPage={clampedPage}
          totalPages={totalPages}
          totalItems={sorted.length}
          onPageChange={setPage}
          itemName="restaurants"
        />

        <NoticeOverlay
          triggerKey={`${sortField}-${sortDirection}`}
          durationMs={SORT_NOTICE_DURATION_MS}>
          Sorted by{" "}
          {currentSortLabel} —{" "}
          {sortDirection === "asc" ? "Ascending" : "Descending"}{" "}
          · Page{" "}
          {clampedPage.toLocaleString()}{" "}
          of{" "}
          {totalPages.toLocaleString()}
        </NoticeOverlay>
      </div>
    </section>
  );
}