// RestaurantList.tsx
//
// Sorted, paginated list of restaurant inspection cards. Auto-navigates
// to the page holding the selected restaurant.

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
import {
  SORT_KEYS,
  SORT_KEY_ORDER,
  NATURAL_DIRECTION,
  sortRestaurants,
} from "../utils/restaurantSort";
import type { SortKeyId, SortDirection } from "../utils/restaurantSort";

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

// Dropdown sentinel for "no second sort field" (single-key sort).
const NO_SECONDARY = "none";

const SORT_NOTICE_DURATION_MS = 1300;

const CARD_GAP = 8;
// .restaurant-card height + CARD_GAP. The card grows by one line (via
// the .with-distance CSS rule) while a Search Radius point is active so
// the Distance line has room; keep these in sync with global.css.
const CARD_HEIGHT = 80 + CARD_GAP;
const CARD_HEIGHT_WITH_DISTANCE = 100 + CARD_GAP;
const MIN_PAGE_SIZE = 4;

type RestaurantListProps = {
  restaurants: RestaurantProperties[];
  selectedRestaurantId?: string | null;
  // The full record for selectedRestaurantId. Folded into the list when
  // the map-view query doesn't (yet) contain it - e.g. selection came
  // from a map click and the extent re-query hasn't landed - so the
  // selected restaurant always has a card to highlight and page to.
  selectedRestaurant?: RestaurantProperties | null;
  // Highlights the matching card, whether the hover came from the list
  // itself or from a restaurant dot on the map.
  hoveredRestaurantId?: string | null;
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
  selectedRestaurant = null,
  hoveredRestaurantId = null,
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

  // The map-view query is the list's source, plus the selected restaurant
  // if that query doesn't carry it. Everything below (sort, pagination,
  // navigate-to-selection) works off this so a map-click selection always
  // resolves to a real card even before the extent re-query catches up.
  const listRestaurants = useMemo(() => {
    if (!selectedRestaurant) return restaurants;
    const alreadyListed = restaurants.some(
      (r) => r.id === selectedRestaurant.id,
    );
    return alreadyListed ? restaurants : [...restaurants, selectedRestaurant];
  }, [restaurants, selectedRestaurant]);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const cardListRef = useRef<HTMLDivElement | null>(null);
  const prevRestaurantCountRef = useRef(listRestaurants.length);
  const prevSelectedIdRef = useRef<string | null>(selectedRestaurantId);
  const prevSortRef = useRef({ primarySort, secondarySort, sortDirection });
  const preRadiusPrimarySortRef = useRef<SortKeyId>(primarySort);

  useEffect(() => {
    const cardList = cardListRef.current;
    if (!cardList) return;

    const recomputePageSize = () => {
      const availableHeight = cardList.clientHeight;
      // On an inactive explorer tab this pane is display:none, so
      // clientHeight is 0, and ResizeObserver still fires for that
      // transition. Bail on non-positive heights so the page size keeps
      // its last good value instead of collapsing to MIN_PAGE_SIZE every
      // time the user leaves the tab and comes back.
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
    // .with-distance cards; re-measure so pagination stays correct.
  }, [rowHeight]);

  const sorted = useMemo(
    () =>
      sortRestaurants(listRestaurants, {
        primary: primarySort,
        secondary: secondarySort,
        direction: sortDirection,
        point: searchRadiusPoint,
      }),
    [
      listRestaurants,
      primarySort,
      secondarySort,
      sortDirection,
      searchRadiusPoint,
    ],
  );

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

  // Automatically navigate pagination to the page holding
  // selectedRestaurantId.
  useEffect(() => {
    const countChanged =
      prevRestaurantCountRef.current !== listRestaurants.length;
    const selectedChanged = prevSelectedIdRef.current !== selectedRestaurantId;
    const prevSort = prevSortRef.current;
    const sortChanged =
      prevSort.primarySort !== primarySort ||
      prevSort.secondarySort !== secondarySort ||
      prevSort.sortDirection !== sortDirection;

    prevRestaurantCountRef.current = listRestaurants.length;
    prevSelectedIdRef.current = selectedRestaurantId;
    prevSortRef.current = { primarySort, secondarySort, sortDirection };

    // With no restaurant selected, the list's page is always the top of
    // the current ordering - never stranded on wherever a since-cleared
    // selection last pushed it. Clearing the selection, or changing the
    // sort while nothing is selected, returns to page 1. With a
    // restaurant selected, fall through and track that card's page so it
    // stays in view across sort changes.
    if (!selectedRestaurantId && (selectedChanged || sortChanged)) {
      setPage(1);
      return;
    }

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
    listRestaurants.length,
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
  // active; it's meaningless otherwise.
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
                isHovered={restaurant.id === hoveredRestaurantId}
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