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
import type { SearchRadiusPoint } from "../types/searchRadius";
import { getGradeCategory } from "../utils/gradeCategory";
import { haversineDistanceMiles } from "../utils/distance";

function restaurantListInfoContent(withinRadius: boolean) {
  return (
    <InfoPopupContent
      overview={
        <p>
          Shows restaurants{" "}
          {withinRadius
            ? "within the active Search Radius"
            : "currently visible in the map view"}
          , respecting any active Grade and Borough filters and the search
          field above.
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

          <li>Use the pagination controls to move between pages of results.</li>
        </ul>
      }
      dataNotes={
        <ul>
          <li>
            The number of available results and pages updates as the{" "}
            {withinRadius ? "Search Radius" : "map view"}, active filters, or
            search results change.
          </li>
        </ul>
      }
    />
  );
}

type SortKeyId =
  | "inspection_date"
  | "name"
  | "cuisine"
  | "grade"
  | "score"
  | "distance";

type SortDirection = "asc" | "desc";

// Dropdown sentinel for "no second sort field" (single-key sort).
const NO_SECONDARY = "none";

function gradeRank(restaurant: RestaurantProperties): number {
  switch (
    getGradeCategory(restaurant.action, restaurant.grade, restaurant.score)
  ) {
    case "A": return 0;
    case "B": return 1;
    case "C": return 2;
    case "pending": return 3;
    case "uninspected": return 4;
    case "closed": return 5;
    default: return 6;
  }
}

// Each sortable field is a labelled key function: restaurant -> a
// comparable value, or null when the row has no value for that field.
// Null values always sort last regardless of direction (so flipping
// Score or Inspected to ascending can't flood the first page with
// not-yet-inspected restaurants). `radiusOnly` fields are only offered
// while a Search Radius point is set. A sort is one or two of these
// applied in order, sharing one direction.
const SORT_KEYS: Record<
  SortKeyId,
  {
    label: string;
    radiusOnly?: boolean;
    keyOf: (
      restaurant: RestaurantProperties,
      point: SearchRadiusPoint | null,
    ) => number | string | null;
  }
> = {
  inspection_date: {
    label: "Inspected",
    keyOf: (restaurant) => {
      if (!restaurant.inspection_date) return null;
      const time = new Date(restaurant.inspection_date).getTime();
      return Number.isNaN(time) ? null : time;
    },
  },
  name: {
    label: "Name",
    keyOf: (restaurant) => restaurant.name?.trim() || null,
  },
  cuisine: {
    label: "Cuisine",
    keyOf: (restaurant) => restaurant.cuisine?.trim() || null,
  },
  grade: { label: "Grade", keyOf: (restaurant) => gradeRank(restaurant) },
  score: { label: "Score", keyOf: (restaurant) => restaurant.score ?? null },
  distance: {
    label: "Distance",
    radiusOnly: true,
    keyOf: (restaurant, point) =>
      point && restaurant.latitude != null && restaurant.longitude != null
        ? haversineDistanceMiles(point, {
            latitude: restaurant.latitude,
            longitude: restaurant.longitude,
          })
        : null,
  },
};

// Order the fields appear in both dropdowns.
const SORT_KEY_ORDER: SortKeyId[] = [
  "inspection_date",
  "name",
  "cuisine",
  "grade",
  "score",
  "distance",
];

// The direction that puts the "best"/most useful rows first for each
// field -- applied whenever the primary field changes, so picking Grade
// starts with A's, Distance with the closest, etc. The user can still
// flip it with the direction toggle.
const NATURAL_DIRECTION: Record<SortKeyId, SortDirection> = {
  inspection_date: "desc", // most recent first
  name: "asc", // A–Z
  cuisine: "asc", // A–Z
  grade: "asc", // A first
  score: "asc", // lowest (cleanest) score first
  distance: "asc", // closest first
};

const SORT_NOTICE_DURATION_MS = 1300;

const CARD_GAP = 8;
// .restaurant-card height + CARD_GAP. The card grows by one line (and the
// .with-distance CSS rule) while a Search Radius point is active, so the
// Distance line has room -- keep these in sync with global.css.
const CARD_HEIGHT = 80 + CARD_GAP;
const CARD_HEIGHT_WITH_DISTANCE = 100 + CARD_GAP;
const MIN_PAGE_SIZE = 4;

type RestaurantListProps = {
  restaurants: RestaurantProperties[];
  selectedRestaurantId?: string | null;
  onSelectRestaurant?: (restaurant: RestaurantProperties) => void;
  onHoverRestaurant?: (restaurant: RestaurantProperties | null) => void;
  // Present when the Search Radius tool is active. The `restaurants` prop
  // is already scoped to the circle upstream (MapView's query); this is
  // only used to show/sort each card's distance from the point.
  searchRadiusPoint?: SearchRadiusPoint | null;
  children?: React.ReactNode; // Slot for external filter notice overlay
};

export default function RestaurantList({
  restaurants,
  selectedRestaurantId = null,
  onSelectRestaurant,
  onHoverRestaurant,
  searchRadiusPoint = null,
  children,
}: RestaurantListProps) {
  const [showInfo, setShowInfo] = useState(false);
  const [primarySort, setPrimarySort] =
    useState<SortKeyId>("inspection_date");
  const [secondarySort, setSecondarySort] = useState<SortKeyId | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const rowHeight = searchRadiusPoint
    ? CARD_HEIGHT_WITH_DISTANCE
    : CARD_HEIGHT;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const cardListRef = useRef<HTMLDivElement | null>(null);
  const prevRestaurantCountRef = useRef(restaurants.length);
  const prevSelectedIdRef = useRef<string | null>(selectedRestaurantId);
  const preRadiusPrimarySortRef = useRef<SortKeyId>(primarySort);

  useEffect(() => {
    const cardList = cardListRef.current;
    if (!cardList) return;

    const recomputePageSize = () => {
      const availableHeight = cardList.clientHeight;
      // On an inactive explorer tab this pane is display:none, so
      // clientHeight is 0 -- and ResizeObserver still fires for that
      // transition. Bail on non-positive heights so the page size keeps
      // its last good value instead of collapsing to MIN_PAGE_SIZE every
      // time the user visits another tab and comes back.
      if (availableHeight <= 0) return;
      // + CARD_GAP: the last card on a page has no trailing gap, so a
      // page fits one more than availableHeight / row height.
      const fit = Math.floor((availableHeight + CARD_GAP) / rowHeight);
      setPageSize(Math.max(MIN_PAGE_SIZE, fit));
    };

    recomputePageSize();
    const resizeObserver = new ResizeObserver(recomputePageSize);
    resizeObserver.observe(cardList);

    return () => resizeObserver.disconnect();
    // rowHeight changes when the Search Radius tool toggles the taller
    // .with-distance cards -- re-measure so pagination stays correct.
  }, [rowHeight]);

  const sorted = useMemo(() => {
    const sortableList = [...restaurants];
    const directionMultiplier = sortDirection === "asc" ? 1 : -1;

    // The active sort: the primary field, then the secondary (if any),
    // sharing one direction. A null key means the row has no value at
    // that level -- those always sort last regardless of direction.
    const levels: SortKeyId[] = secondarySort
      ? [primarySort, secondarySort]
      : [primarySort];

    sortableList.sort((first, second) => {
      for (const key of levels) {
        const firstKey = SORT_KEYS[key].keyOf(first, searchRadiusPoint);
        const secondKey = SORT_KEYS[key].keyOf(second, searchRadiusPoint);

        if (firstKey === null || secondKey === null) {
          if (firstKey === null && secondKey !== null) return 1;
          if (secondKey === null && firstKey !== null) return -1;
          continue; // both missing at this level -- try the next key
        }

        const comparison =
          typeof firstKey === "string"
            ? firstKey.localeCompare(secondKey as string)
            : firstKey - (secondKey as number);
        if (comparison !== 0) return comparison * directionMultiplier;
      }

      const nameTie = (first.name || "").localeCompare(second.name || "");
      if (nameTie !== 0) return nameTie;
      return (first.id || "").localeCompare(second.id || "");
    });

    return sortableList;
  }, [restaurants, primarySort, secondarySort, sortDirection, searchRadiusPoint]);

  // Distance only makes sense with a Search Radius point set. Remember
  // the primary field chosen before Distance, so dismissing the point
  // restores that rather than a hardcoded default.
  useEffect(() => {
    if (searchRadiusPoint && primarySort !== "distance") {
      preRadiusPrimarySortRef.current = primarySort;
    }
  }, [searchRadiusPoint, primarySort]);

  useEffect(() => {
    if (searchRadiusPoint) return;
    if (primarySort === "distance") {
      const reverted = preRadiusPrimarySortRef.current;
      setPrimarySort(reverted);
      setSortDirection(NATURAL_DIRECTION[reverted]);
    }
    if (secondarySort === "distance") {
      setSecondarySort(null);
    }
  }, [searchRadiusPoint, primarySort, secondarySort]);

  // The two sort slots can never hold the same field (e.g. after the
  // primary reverts onto whatever the secondary was).
  useEffect(() => {
    if (secondarySort !== null && secondarySort === primarySort) {
      setSecondarySort(null);
    }
  }, [primarySort, secondarySort]);

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
  }, [
    restaurants.length,
    selectedRestaurantId,
    pageSize,
    sorted,
    primarySort,
    secondarySort,
    sortDirection,
  ]);

  // Safety net: if the current page fell out of range because the list
  // shrank (grade/borough/search/radius filter, or a smaller map view),
  // return to page 1 rather than stranding the user on a partial page
  // that reads as "the list is shorter than it should be".
  useEffect(() => {
    const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
    if (page > pageCount) setPage(1);
  }, [sorted.length, pageSize, page]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const clampedPage = Math.min(page, totalPages);
  const pageStart = (clampedPage - 1) * pageSize;
  const pageItems = sorted.slice(pageStart, pageStart + pageSize);

  // Distance only appears as a sort field once a search radius point is
  // active -- it's meaningless otherwise.
  const availableSortKeys = useMemo<SortKeyId[]>(
    () =>
      SORT_KEY_ORDER.filter(
        (key) => searchRadiusPoint != null || !SORT_KEYS[key].radiusOnly,
      ),
    [searchRadiusPoint],
  );

  const primarySortOptions = useMemo(
    () =>
      availableSortKeys.map((key) => ({
        value: key,
        label: SORT_KEYS[key].label,
      })),
    [availableSortKeys],
  );

  const secondarySortOptions = useMemo(
    () => [
      { value: NO_SECONDARY, label: "None" },
      ...availableSortKeys
        .filter((key) => key !== primarySort)
        .map((key) => ({ value: key, label: SORT_KEYS[key].label })),
    ],
    [availableSortKeys, primarySort],
  );

  const sortSummary = secondarySort
    ? `${SORT_KEYS[primarySort].label}, then ${SORT_KEYS[secondarySort].label}`
    : SORT_KEYS[primarySort].label;

  const infoContent = useMemo(
    () => restaurantListInfoContent(searchRadiusPoint != null),
    [searchRadiusPoint],
  );

  return (
    <section className="panel restaurant-list-panel">
      <PanelHeader
        title="Restaurant List"
        infoContent={infoContent}
        onInfoClick={() => {
          setShowInfo((currentValue) => !currentValue);
        }}
        isInfoOpen={showInfo}
      />

      {showInfo ? (
        <div className="panel-scroll-content">{infoContent}</div>
      ) : (
        <div
          ref={containerRef}
          className={`restaurant-list-container${
            searchRadiusPoint ? " with-distance" : ""
          }`}>
          <div className="restaurant-list-sort-bar">
            <span id="sort-field-label" className="sort-label">
              Sort by:
            </span>

            <SortDropdown
              value={primarySort}
              options={primarySortOptions}
              onChange={(value) => {
                setPrimarySort(value);
                setSortDirection(NATURAL_DIRECTION[value]);
              }}
              labelId="sort-field-label"
            />

            <span className="sort-then-label">then</span>

            <SortDropdown
              value={secondarySort ?? NO_SECONDARY}
              options={secondarySortOptions}
              onChange={(value) => {
                setSecondarySort(
                  value === NO_SECONDARY ? null : (value as SortKeyId),
                );
              }}
              labelId="sort-field-label"
            />

            <button
              type="button"
              className="sort-direction-toggle sort-direction-toggle-icon"
              data-tooltip={
                sortDirection === "asc" ? "Ascending" : "Descending"
              }
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
                searchRadiusPoint={searchRadiusPoint}
              />
            ))}

            {pageItems.length === 0 && (
              <div className="restaurant-list-empty">
                No restaurants match the current view, filters or search results.
              </div>
            )}

            <NoticeOverlay
              triggerKey={`${primarySort}-${secondarySort ?? ""}-${sortDirection}`}
              durationMs={SORT_NOTICE_DURATION_MS}>
              Sorted by {sortSummary} —{" "}
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