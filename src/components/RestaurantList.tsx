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

function restaurantListInfoContent(withinRadius: boolean, isMobile: boolean) {
  return (
    <InfoPopupContent
      overview={
        <p>
          Shows restaurants{" "}
          {withinRadius
            ? "within the active Search Radius"
            : "currently visible in the map view"}
          , respecting any active Grade and Borough filters and the search
          field{isMobile ? "" : " above"}.
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

// Fixed page size. The card area scrolls when a page overflows it
// (.restaurant-card-list on desktop, the bottom sheet on mobile), so the
// count no longer tracks viewport height and page N always holds the
// same restaurants.
const PAGE_SIZE = 10;

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
  // The mobile "locate me" dot, if placed. Adds the per-card Distance
  // line (measured from it) without unlocking the Distance sort key or
  // re-scoping the list the way searchRadiusPoint does. searchRadiusPoint
  // wins when both are set.
  userLocationPoint?: SearchRadiusPoint | null;
  // Mobile: the search field lives in the app-bar drawer, not directly
  // above the list, so the info panel drops the "above" wording.
  isMobile?: boolean;
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
  userLocationPoint = null,
  isMobile = false,
  children,
}: RestaurantListProps) {
  // The point distances are measured from -- for the per-card readout and
  // the Distance sort key alike: the Search Radius centre if set,
  // otherwise the "locate me" dot.
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

  // Distance only makes sense with a distance origin (Search Radius point
  // or locate dot) set. Remember the primary field chosen before
  // Distance, so losing the origin restores that rather than a hardcoded
  // default.
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

  // Safety net: if the current page fell out of range because the list
  // shrank (grade/borough/search/radius filter, or a smaller map view),
  // return to page 1 rather than stranding the user on a partial page
  // that reads as "the list is shorter than it should be".
  useEffect(() => {
    const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
    if (page > pageCount) setPage(1);
  }, [sorted.length, page]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const clampedPage = Math.min(page, totalPages);
  const pageStart = (clampedPage - 1) * PAGE_SIZE;
  const pageItems = sorted.slice(pageStart, pageStart + PAGE_SIZE);

  // A page change swaps the whole card set; return to the top of it.
  // Desktop: the card list scrolls its own overflow. Mobile: the bottom
  // sheet is the scroller (pagination sits below the fold) - closest()
  // finds it there and returns null elsewhere.
  useEffect(() => {
    cardListRef.current?.scrollTo({ top: 0 });
    cardListRef.current
      ?.closest(".mobile-sheet-scroll-body")
      ?.scrollTo({ top: 0 });
  }, [clampedPage]);

  // Distance only appears as a sort field once a distance origin (Search
  // Radius point or locate dot) is set; it's meaningless otherwise.
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