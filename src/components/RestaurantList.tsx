// RestaurantList.tsx
//
// Sorted, paginated list of restaurant inspection cards. Auto-navigates
// to the page holding the selected restaurant.

import { memo, useEffect, useMemo, useRef, useState } from "react";

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

function restaurantListInfoContent(withinRadius: boolean, isMobile: boolean) {
  return (
    <InfoPopupContent
      overview={
        <p>
          The Restaurant List shows restaurants{" "}
          {withinRadius
            ? "within the active Search Radius"
            : "currently visible in the map view"}
          , narrowed further by any active Grade and Borough filters and the
          search field{isMobile ? "" : " above"}.
        </p>
      }
      howToUse={
        <ul>
          <li>
            Select a restaurant card to see its details and inspection
            history; the map pans and zooms to its location too.
          </li>

          <li>
            Use the sort field and direction controls to reorder the restaurant
            results.
          </li>

          <li>Use the pagination controls to move between pages of results.</li>

          <li>
            When a Search Radius or your location is set, each card shows its
            Distance, which also becomes available as a sort option.
          </li>
        </ul>
      }
      dataNotes={
        <p>
          The number of available results and pages updates as the{" "}
          {withinRadius ? "Search Radius" : "map view"}, active filters, or
          search results change.
        </p>
      }
    />
  );
}

// Dropdown sentinel for "no second sort field" (single-key sort).
const NO_SECONDARY = "none";

const SORT_NOTICE_DURATION_MS = 1300;

// Fixed page size. The card area scrolls on overflow, so this ignores
// viewport height — page N always holds the same restaurants.
const PAGE_SIZE = 10;

type RestaurantListProps = {
  restaurants: RestaurantProperties[];
  selectedRestaurantId?: string | null;
  // The full record for selectedRestaurantId. Folded into the list when
  // the map-view query doesn't yet contain it (e.g. a map-click
  // selection before the extent re-query lands), so it always has a card.
  selectedRestaurant?: RestaurantProperties | null;
  // Highlights the matching card, whether the hover came from the list
  // itself or from a restaurant dot on the map.
  hoveredRestaurantId?: string | null;
  onSelectRestaurant?: (restaurant: RestaurantProperties) => void;
  onHoverRestaurant?: (restaurant: RestaurantProperties | null) => void;
  // Present when Search Radius is active. `restaurants` is already
  // scoped to the circle upstream; this only drives each card's distance/sort.
  searchRadiusPoint?: SearchRadiusPoint | null;
  // The phone/tablet "locate me" dot, if placed. Adds the per-card
  // Distance line and unlocks Distance sort like searchRadiusPoint, but
  // doesn't re-scope the list. searchRadiusPoint wins when both are set.
  userLocationPoint?: SearchRadiusPoint | null;
  // Mobile: the search field lives in the app-bar drawer, not directly
  // above the list, so the info panel drops the "above" wording.
  isMobile?: boolean;
  children?: React.ReactNode; // Slot for external filter notice overlay
};

function RestaurantList({
  restaurants,
  selectedRestaurantId = null,
  selectedRestaurant = null,
  hoveredRestaurantId = null,
  onSelectRestaurant,
  onHoverRestaurant,
  searchRadiusPoint = null,
  userLocationPoint = null,
  isMobile = false,
  children,
}: RestaurantListProps) {
  // Distance origin for both the per-card readout and the sort key:
  // Search Radius centre, else the locate dot.
  const distanceOrigin = useMemo(
    () => searchRadiusPoint ?? userLocationPoint,
    [searchRadiusPoint, userLocationPoint],
  );
  const [showInfo, setShowInfo] = useState(false);
  const [primarySort, setPrimarySort] =
    useState<SortKeyId>("inspection_date");
  const [secondarySort, setSecondarySort] = useState<SortKeyId | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [page, setPage] = useState(1);

  // Everything below (sort, pagination, navigate-to-selection) works off
  // this, so a map-click selection always resolves to a real card even
  // before the extent re-query catches up.
  const listRestaurants = useMemo(() => {
    if (!selectedRestaurant) return restaurants;
    const alreadyListed = restaurants.some(
      (r) => r.id === selectedRestaurant.id,
    );
    return alreadyListed ? restaurants : [...restaurants, selectedRestaurant];
  }, [restaurants, selectedRestaurant]);

  const cardListRef = useRef<HTMLDivElement | null>(null);
  const prevRestaurantCountRef = useRef(listRestaurants.length);
  const prevSelectedIdRef = useRef<string | null>(selectedRestaurantId);
  const prevSortRef = useRef({ primarySort, secondarySort, sortDirection });
  const preDistancePrimarySortRef = useRef<SortKeyId>(primarySort);

  const sorted = useMemo(
    () =>
      sortRestaurants(listRestaurants, {
        primary: primarySort,
        secondary: secondarySort,
        direction: sortDirection,
        point: distanceOrigin,
      }),
    [
      listRestaurants,
      primarySort,
      secondarySort,
      sortDirection,
      distanceOrigin,
    ],
  );

  // Remembers the primary field chosen before Distance, so losing the
  // distance origin restores that rather than a hardcoded default.
  useEffect(() => {
    if (distanceOrigin && primarySort !== "distance") {
      preDistancePrimarySortRef.current = primarySort;
    }
  }, [distanceOrigin, primarySort]);

  useEffect(() => {
    if (distanceOrigin) return;
    if (primarySort === "distance") {
      const reverted = preDistancePrimarySortRef.current;
      setPrimarySort(reverted);
      setSortDirection(NATURAL_DIRECTION[reverted]);
    }
    if (secondarySort === "distance") {
      setSecondarySort(null);
    }
  }, [distanceOrigin, primarySort, secondarySort]);

  // The two sort slots can never hold the same field (e.g. after the
  // primary reverts onto whatever the secondary was).
  useEffect(() => {
    if (secondarySort !== null && secondarySort === primarySort) {
      setSecondarySort(null);
    }
  }, [primarySort, secondarySort]);

  // Navigates to the page holding selectedRestaurantId.
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

    // With nothing selected, clearing the selection or changing sort
    // always returns to page 1, rather than stranding on wherever a
    // since-cleared selection left it.
    if (!selectedRestaurantId) {
      if (selectedChanged || sortChanged) setPage(1);
      return;
    }

    // Keeps tracking the selected card's page on any relevant change —
    // not just selection/sort, but the list shifting under it too (e.g. a
    // re-centering re-query). Otherwise the card can end up on the wrong page.
    if (sorted.length > 0) {
      const index = sorted.findIndex((r) => r.id === selectedRestaurantId);
      if (index !== -1) {
        const targetPage = Math.floor(index / PAGE_SIZE) + 1;
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
    sorted,
    primarySort,
    secondarySort,
    sortDirection,
  ]);

  // If the list shrank (a filter, or a smaller map view) and the current
  // page fell out of range, return to page 1 rather than stranding on a
  // partial page. Uses a functional update, not the closed-over `page`,
  // so it sees whatever the selection-tracking effect above just queued
  // in this same commit instead of clobbering it with a stale value.
  useEffect(() => {
    const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
    setPage((prev) => (prev > pageCount ? 1 : prev));
  }, [sorted.length]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const clampedPage = Math.min(page, totalPages);
  const pageStart = (clampedPage - 1) * PAGE_SIZE;
  const pageItems = sorted.slice(pageStart, pageStart + PAGE_SIZE);

  // A page change swaps the whole card set; return to the top. Desktop
  // scrolls the card list itself; mobile scrolls the bottom sheet —
  // closest() finds it there and returns null elsewhere.
  useEffect(() => {
    cardListRef.current?.scrollTo({ top: 0 });
    cardListRef.current
      ?.closest(".mobile-sheet-scroll-body")
      ?.scrollTo({ top: 0 });
  }, [clampedPage]);

  // Distance only appears as a sort field once a distance origin is set.
  const availableSortKeys = useMemo<SortKeyId[]>(
    () =>
      SORT_KEY_ORDER.filter(
        (key) => distanceOrigin != null || !SORT_KEYS[key].needsDistancePoint,
      ),
    [distanceOrigin],
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
    () => restaurantListInfoContent(searchRadiusPoint != null, isMobile),
    [searchRadiusPoint, isMobile],
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
          className={`restaurant-list-container${
            distanceOrigin ? " with-distance" : ""
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
                distanceOrigin={distanceOrigin}
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

export default memo(RestaurantList);