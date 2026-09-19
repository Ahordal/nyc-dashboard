// MobileDashboard.tsx
//
// Phone layout (rendered by dashboard.tsx below ~750px, or on a short
// landscape viewport): a slim app bar, an area-summary strip, a
// full-bleed map, and a bottom sheet that's purely restaurant info.
// Three detents: peek shows the selected restaurant's card (or a browse
// prompt) over a full-size map; half raises it to the list/Details pane
// over a panned map; open is the full-height explorer, where Details
// pins the score-history chart below the scrolling record.
// Search and grade/borough filters live in the app bar's drawers; the
// grade donut and dataset meta live in the area strip's drawer. Shared
// state stays in dashboard.tsx; the child panels are the desktop ones.

import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChevronDown,
  faChevronUp,
} from "@fortawesome/free-solid-svg-icons";

import AppBar from "./AppBar";
import MobileAreaStrip from "./MobileAreaStrip";
import ExplorerTabs from "./ExplorerTabs";
import RestaurantList from "./RestaurantList";
import RestaurantDetails from "./RestaurantDetails";
import RestaurantReport from "./RestaurantReport";
import RestaurantCard from "./RestaurantCard";
import MapViewSkeleton from "./MapViewSkeleton";
import ChartSkeleton from "./ChartSkeleton";
import ErrorBoundary from "./ErrorBoundary";
import ErrorFallback from "./ErrorFallback";

import { tabButtonId, tabPanelId } from "../utils/explorerTabs";
import type { ExplorerTab } from "../utils/explorerTabs";
import { useBottomSheet } from "../hooks/useBottomSheet";

import type { Filters, SetFilters } from "../types/filters";
import type {
  RestaurantProperties,
  ViolationCodeLookup,
  InspectionEvent,
} from "../types/restaurant";
import type { DashboardMeta } from "../types/dashboardMeta";
import type { GradeCounts } from "../types/gradeCounts";
import type {
  SearchRadiusPoint,
  SearchRadiusMiles,
} from "../types/searchRadius";
import type { InitialRadiusState } from "../hooks/useUrlSync";

const MapView = lazy(() => import("./MapView"));
const PerformanceChart = lazy(() => import("./PerformanceChart"));

type MobileDashboardProps = {
  filters: Filters;
  setFilters: SetFilters;

  searchQuery: string;
  onSearchChange: (query: string) => void;

  selectedRestaurant: RestaurantProperties | null;
  reportInspectionId: string | null;
  hoveredInspectionId: string | null;
  hoveredRestaurantId: string | null;
  activeExplorerTab: ExplorerTab;

  onSelectRestaurant: (restaurant: RestaurantProperties | null) => void;
  onSelectInspection: (inspectionId: string) => void;
  // Highlights the matching history row without leaving Details — used by
  // the pinned chart's dot taps.
  onPreviewInspection: (inspectionId: string) => void;
  onHoverInspection: (inspectionId: string | null) => void;
  onHoverRestaurant: (restaurant: RestaurantProperties | null) => void;
  onExplorerTabChange: (tab: ExplorerTab) => void;

  visibleRestaurants: RestaurantProperties[];
  onVisibleRestaurantsChange: (restaurants: RestaurantProperties[]) => void;

  gradeCounts: GradeCounts;
  onGradeCountsChange: (counts: GradeCounts) => void;

  searchRadiusPoint: SearchRadiusPoint | null;
  activeRadiusMiles: SearchRadiusMiles;
  onSearchRadiusChange: (
    point: SearchRadiusPoint | null,
    radiusMiles: SearchRadiusMiles,
  ) => void;
  // Locate dot position (in-NYC only). Feeds per-card distance, separate
  // from the Search Radius point.
  userLocationPoint: SearchRadiusPoint | null;
  onUserLocationChange: (
    point: { latitude: number; longitude: number } | null,
  ) => void;
  initialSearchRadius: InitialRadiusState | null;

  pendingCamisFromUrl: string | null;
  onInitialSelectionResolved: () => void;

  history: InspectionEvent[];
  isLoadingHistory: boolean;
  violationCodes: ViolationCodeLookup;
  dashboardMeta: DashboardMeta | null;
};

export default function MobileDashboard({
  filters,
  setFilters,
  searchQuery,
  onSearchChange,
  selectedRestaurant,
  reportInspectionId,
  hoveredInspectionId,
  hoveredRestaurantId,
  activeExplorerTab,
  onSelectRestaurant,
  onSelectInspection,
  onPreviewInspection,
  onHoverInspection,
  onHoverRestaurant,
  onExplorerTabChange,
  visibleRestaurants,
  onVisibleRestaurantsChange,
  gradeCounts,
  onGradeCountsChange,
  searchRadiusPoint,
  activeRadiusMiles,
  onSearchRadiusChange,
  userLocationPoint,
  onUserLocationChange,
  initialSearchRadius,
  pendingCamisFromUrl,
  onInitialSelectionResolved,
  history,
  isLoadingHistory,
  violationCodes,
  dashboardMeta,
}: MobileDashboardProps) {
  const { detent, setDetent, open } = useBottomSheet("peek");

  // One open top drawer — app-bar Search/Filters/Info and the area-strip
  // grade drawer are mutually exclusive.
  const [activeDrawer, setActiveDrawer] = useState<
    "search" | "filters" | "info" | "grades" | null
  >(null);

  // Which surface was touched last — a top drawer or the bottom sheet —
  // so the most recent stacks on top (CSS keys off data-front).
  const [frontSurface, setFrontSurface] = useState<"sheet" | "drawer">("sheet");

  // Score-chart info takeover (see showPerformanceChart below).
  const [perfInfoOpen, setPerfInfoOpen] = useState(false);

  // Opening Search drops the sheet to half so the map stays visible while
  // typing. Closing it keeps that half view while a query is active,
  // handing the map back once empty — committing to open closes Search.
  const hasActiveQuery = searchQuery.trim().length > 0;
  const handleDrawerChange = useCallback(
    (drawer: "search" | "filters" | "info" | "grades" | null) => {
      setActiveDrawer(drawer);
      setFrontSurface(drawer ? "drawer" : "sheet");
      if (drawer === "search") {
        if (activeExplorerTab !== "list") onExplorerTabChange("list");
        setDetent("half");
      } else {
        setDetent((d) => (d === "half" && !hasActiveQuery ? "peek" : d));
      }
    },
    [activeExplorerTab, hasActiveQuery, onExplorerTabChange, setDetent],
  );

  // Chevrons step one detent at a time: up goes peek->open directly (half
  // only matters with a selection/live search over a panned map); down
  // goes open->half->peek while selected, else straight to peek. peek
  // shows only up, open only down, half both — tapping the peek row/card also jumps straight to open.
  const searching = activeDrawer === "search";
  // Set when the up chevron skips peek->open directly; the next down
  // chevron then reverses straight back to peek instead of stopping at
  // half. Any selection pans the map and forces half itself, clearing
  // this (see the camis effect below).
  const skippedToOpenRef = useRef(false);
  const expandSheet = useCallback(
    () => {
      setFrontSurface("sheet");
      setDetent((d) => {
        if (d !== "peek") return "open";
        // From peek, always jump straight to open — half only matters
        // with a selection/live search over a panned map. Marks the skip
        // so the next down chevron reverses straight to peek.
        skippedToOpenRef.current = true;
        return "open";
      });
    },
    [setDetent],
  );
  const collapseSheet = useCallback(
    () => {
      setFrontSurface("sheet");
      setDetent((d) => {
        if (d !== "open") return "peek";
        // Skip half when it has nothing to show: either this reverses an
        // untouched peek->open jump, or nothing is selected to sit over it.
        if (skippedToOpenRef.current || !selectedRestaurant) {
          skippedToOpenRef.current = false;
          return "peek";
        }
        return "half";
      });
    },
    [setDetent, selectedRestaurant],
  );

  // Peek-row / peek-card tap: expand the sheet and bring it to the front.
  const openSheet = useCallback(() => {
    setFrontSurface("sheet");
    open();
  }, [open]);

  // Reaching "open" closes Search, rather than stranding its drawer
  // behind a full-height sheet.
  useEffect(() => {
    if (searching && detent === "open") setActiveDrawer(null);
  }, [detent, searching]);

  // A map-dot tap is exploratory — card at peek, map still full-size. A
  // list-row tap is a commit — opens the sheet.
  const handleMapSelect = useCallback(
    (restaurant: RestaurantProperties | null) => {
      onSelectRestaurant(restaurant);
      if (restaurant) {
        setFrontSurface("sheet");
        setDetent("peek");
      }
    },
    [onSelectRestaurant, setDetent],
  );

  // Selecting a restaurant lands at half: Details over a map panned to
  // the pin. Closes any open app-bar drawer so Details isn't under it.
  const handleListSelect = useCallback(
    (restaurant: RestaurantProperties | null) => {
      onSelectRestaurant(restaurant);
      if (restaurant) {
        setActiveDrawer(null);
        setFrontSurface("sheet");
        setDetent("half");
      }
    },
    [onSelectRestaurant, setDetent],
  );

  // A selection change pans the map and forces half, clearing any
  // pending peek<->open undo. Clearing the selection drops to peek.
  const prevCamisRef = useRef<string | null>(null);
  useEffect(() => {
    const camis = selectedRestaurant?.camis ?? null;
    if (camis !== prevCamisRef.current) {
      skippedToOpenRef.current = false;
      if (!camis) setDetent("peek");
    }
    prevCamisRef.current = camis;
  }, [selectedRestaurant, setDetent]);

  // A dot tap highlights the matching history row (no tab change) and
  // scrolls it into view. Nonce makes a repeat tap re-scroll.
  const [historyScrollTarget, setHistoryScrollTarget] = useState<{
    id: string;
    nonce: number;
  } | null>(null);

  const handleChartPreview = useCallback(
    (inspectionId: string) => {
      onPreviewInspection(inspectionId);
      setHistoryScrollTarget((prev) => ({
        id: inspectionId,
        nonce: (prev?.nonce ?? 0) + 1,
      }));
    },
    [onPreviewInspection],
  );

  const radiusMiles = searchRadiusPoint ? activeRadiusMiles : null;

  // Card distance measures from the Search Radius point, else the locate dot.
  const distanceOrigin = searchRadiusPoint ?? userLocationPoint;

  // Companion to the Details tab's history list only, not the Report tab.
  const showPerformanceChart =
    selectedRestaurant != null && activeExplorerTab === "details";

  // Closes the chart's info takeover whenever the chart itself goes away
  // or the selection changes - either way, any open takeover belonged to
  // stale context. One effect owns this reset (a separate camis-change
  // effect above used to also reset it, redundantly, on deselect).
  useEffect(() => {
    setPerfInfoOpen(false);
  }, [showPerformanceChart, selectedRestaurant?.camis]);

  // Resets the shared scroll on takeover open, so the header starts at
  // top, not mid-scroll.
  const sheetScrollBodyRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (perfInfoOpen) sheetScrollBodyRef.current?.scrollTo({ top: 0 });
  }, [perfInfoOpen]);

  // New tab starts at top, not inheriting the previous pane's scroll position.
  useEffect(() => {
    sheetScrollBodyRef.current?.scrollTo({ top: 0 });
  }, [activeExplorerTab]);

  // Publishes the sheet's live height as --mobile-sheet-h so the map
  // scale bar can pin above it — needed since the peek card is
  // content-driven and a static offset wouldn't track it.
  const dashboardRef = useRef<HTMLElement | null>(null);
  const sheetRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const sheet = sheetRef.current;
    const dashboard = dashboardRef.current;
    if (!sheet || !dashboard || typeof ResizeObserver === "undefined") return;
    const sync = () => {
      dashboard.style.setProperty(
        "--mobile-sheet-h",
        `${sheet.getBoundingClientRect().height}px`,
      );
    };
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(sheet);
    return () => observer.disconnect();
  }, []);

  function paneClass(tab: ExplorerTab, base: string) {
    return `${base} ${activeExplorerTab === tab ? "" : "explorer-pane-hidden"}`;
  }

  // Pixels of map the sheet covers — MapView reads this to fit a GPS fix
  // + selection above it.
  const getViewBottomInset = useCallback(
    () => sheetRef.current?.getBoundingClientRect().height ?? 0,
    [],
  );

  // Names whichever of search/filters/radius is actually narrowing
  // results, rather than a generic "Browse restaurants".
  const hasActiveFilters = filters.grades.length > 0 || filters.boroughs.length > 0;
  const browsePromptNoun = searching
    ? hasActiveFilters
      ? "Filtered Search Results"
      : "Search Results"
    : hasActiveFilters
      ? "Filtered Restaurants"
      : "restaurants";
  // A radius names its own scope; the true baseline calls out map view
  // rather than leaving it unstated. Search/filtered states are already
  // specific enough and skip this suffix.
  const browsePromptScope = searchRadiusPoint
    ? " in radius"
    : !searching && !hasActiveFilters
      ? " in map view"
      : "";
  const browsePromptLabel = `Browse ${browsePromptNoun}${browsePromptScope}`;

  return (
    <main
      ref={dashboardRef}
      className="mobile-dashboard"
      data-detent={detent}
      data-front={frontSurface}
      data-peek={selectedRestaurant ? "card" : "empty"}
      data-tab={activeExplorerTab}>
      <AppBar
        filters={filters}
        setFilters={setFilters}
        meta={dashboardMeta}
        onSearchChange={onSearchChange}
        searchActive={hasActiveQuery}
        activeDrawer={activeDrawer}
        onDrawerChange={handleDrawerChange}
        tagline="Mapping Restaurant Health Inspections"
      />

      <MobileAreaStrip
        gradeCounts={gradeCounts}
        visibleRestaurants={visibleRestaurants}
        filters={filters}
        searchQuery={searchQuery}
        searchRadiusMiles={radiusMiles}
        open={activeDrawer === "grades"}
        onToggle={() =>
          handleDrawerChange(activeDrawer === "grades" ? null : "grades")
        }
      />

      <div className="mobile-map">
        <ErrorBoundary
          context="MapView"
          fallback={<ErrorFallback message="The map failed to load." />}>
          <Suspense fallback={<MapViewSkeleton />}>
            <MapView
              filters={filters}
              searchQuery={searchQuery}
              selectedRestaurantId={selectedRestaurant?.id ?? null}
              hoveredRestaurantId={hoveredRestaurantId}
              onSelectRestaurant={handleMapSelect}
              onHoverRestaurant={onHoverRestaurant}
              onVisibleRestaurantsChange={onVisibleRestaurantsChange}
              onGradeCountsChange={onGradeCountsChange}
              onSearchRadiusChange={onSearchRadiusChange}
              onUserLocationChange={onUserLocationChange}
              initialSearchRadius={initialSearchRadius}
              initialSelectedCamis={pendingCamisFromUrl}
              onInitialSelectionResolved={onInitialSelectionResolved}
              showHoverCard={false}
              showHoverGlow={false}
              showLocateControl
              getViewBottomInset={getViewBottomInset}
            />
          </Suspense>
        </ErrorBoundary>
      </div>

      <section
        ref={sheetRef}
        className="mobile-sheet"
        aria-label="Restaurant explorer">
        <div className="mobile-sheet-handle">
          {detent !== "open" && (
            <button
              type="button"
              className="mobile-sheet-handle-arrow"
              aria-label="Expand panel"
              onClick={expandSheet}>
              <FontAwesomeIcon icon={faChevronUp} aria-hidden="true" />
            </button>
          )}
          {detent !== "peek" && (
            <button
              type="button"
              className="mobile-sheet-handle-arrow"
              aria-label="Collapse panel"
              onClick={collapseSheet}>
              <FontAwesomeIcon icon={faChevronDown} aria-hidden="true" />
            </button>
          )}
        </div>

        {detent === "peek" &&
          (selectedRestaurant ? (
            <div className="mobile-sheet-peek-card">
              <RestaurantCard
                restaurant={selectedRestaurant}
                isSelected
                onClick={openSheet}
                distanceOrigin={distanceOrigin}
              />
            </div>
          ) : (
            <button
              type="button"
              className="mobile-sheet-peek"
              onClick={() => {
                if (activeExplorerTab !== "list") onExplorerTabChange("list");
                openSheet();
              }}
              aria-label={`Expand panel to ${browsePromptLabel.toLowerCase()}`}>
              <span className="mobile-sheet-peek-label">
                {browsePromptLabel}
              </span>
            </button>
          ))}

        {(detent === "open" || detent === "half") && (
          <div className="mobile-sheet-scroll">
            <div className="mobile-explorer">
              <ExplorerTabs
                activeTab={activeExplorerTab}
                onTabChange={onExplorerTabChange}
              />

              <div className="mobile-sheet-scroll-body" ref={sheetScrollBodyRef}>
                <div
                  className={`explorer-content${
                    perfInfoOpen ? " explorer-pane-hidden" : ""
                  }`}>
                  <div
                    id={tabPanelId("list")}
                    role="tabpanel"
                    aria-labelledby={tabButtonId("list")}
                    className={paneClass("list", "restaurant-list")}>
                    <RestaurantList
                      restaurants={visibleRestaurants}
                      selectedRestaurantId={selectedRestaurant?.id ?? null}
                      selectedRestaurant={selectedRestaurant}
                      hoveredRestaurantId={hoveredRestaurantId}
                      onSelectRestaurant={handleListSelect}
                      onHoverRestaurant={onHoverRestaurant}
                      searchRadiusPoint={searchRadiusPoint}
                      userLocationPoint={userLocationPoint}
                      isMobile
                    />
                  </div>

                  <div
                    id={tabPanelId("details")}
                    role="tabpanel"
                    aria-labelledby={tabButtonId("details")}
                    className={paneClass("details", "restaurant-details")}>
                    <RestaurantDetails
                      restaurant={selectedRestaurant}
                      distanceOrigin={distanceOrigin}
                      distanceOriginKind={
                        searchRadiusPoint ? "search-radius" : "your-location"
                      }
                      history={history}
                      isLoadingHistory={isLoadingHistory}
                      selectedInspectionId={reportInspectionId}
                      onSelectInspection={onSelectInspection}
                      onHoverInspection={onHoverInspection}
                      historyScrollTarget={historyScrollTarget}
                      isMobile
                    />
                  </div>

                  <div
                    id={tabPanelId("report")}
                    role="tabpanel"
                    aria-labelledby={tabButtonId("report")}
                    className={paneClass("report", "restaurant-report")}>
                    <RestaurantReport
                      restaurant={selectedRestaurant}
                      history={history}
                      isLoadingHistory={isLoadingHistory}
                      selectedInspectionId={reportInspectionId}
                      violationCodes={violationCodes}
                      onSelectInspection={onSelectInspection}
                    />
                  </div>
                </div>

                {showPerformanceChart && (
                  <div
                    className={`mobile-perf-chart${
                      perfInfoOpen ? " mobile-perf-chart-info-open" : ""
                    }`}>
                    <ErrorBoundary
                      context="PerformanceChart"
                      resetKey={selectedRestaurant?.camis ?? null}
                      fallback={
                        <ErrorFallback message="The score history chart failed to load." />
                      }>
                      <Suspense
                        fallback={<ChartSkeleton label="Loading score history…" />}>
                        <PerformanceChart
                          restaurant={selectedRestaurant}
                          history={history}
                          isLoadingHistory={isLoadingHistory}
                          onSelectInspection={handleChartPreview}
                          hoveredInspectionId={hoveredInspectionId}
                          selectedInspectionId={reportInspectionId}
                          onInfoClick={() => setPerfInfoOpen((v) => !v)}
                          isInfoOpen={perfInfoOpen}
                          tooltipVariant="compact"
                          isMobile
                        />
                      </Suspense>
                    </ErrorBoundary>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
