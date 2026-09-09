// MobileDashboard.tsx
//
// Phone layout (rendered by dashboard.tsx below ~750px wide, or on a
// short landscape viewport -- a phone held sideways): a slim app bar,
// an area-summary strip (count + grade mix for the current view), a
// full-bleed map, and a bottom sheet that is purely restaurant info.
// The sheet has three detents: peek shows the selected restaurant's list
// card (or a browse prompt) over a full-size map; half raises it to the
// list or the selected restaurant's Details pane over a still-visible,
// panned map (entered by a selection, or by the app-bar Search drawer
// filtering live); open is the full-height explorer, where Details pins
// the score-history chart to the bottom while the record scrolls above.
// Search and grade/borough filters live in the app bar's drawers; the
// grade donut and dataset meta live in the area strip's drawer. All
// shared state stays in dashboard.tsx; the child panels are the desktop
// ones.

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
  // Highlights the matching Inspection History row without leaving the
  // Details tab — used by the pinned score chart's dot taps.
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
  // The "locate me" dot's position (in-NYC fixes only). Shows per-card
  // distances from it; separate from the Search Radius point.
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

  // The one open top drawer, if any — Search / Filters / Info (app bar)
  // and the grade-breakdown drawer (area strip) are mutually exclusive.
  const [activeDrawer, setActiveDrawer] = useState<
    "search" | "filters" | "info" | "grades" | null
  >(null);

  // Which of the two overlapping surfaces was touched last — a top drawer
  // or the bottom sheet — so the most recently opened one stacks on top
  // (CSS keys off data-front). Only matters while a drawer is open.
  const [frontSurface, setFrontSurface] = useState<"sheet" | "drawer">("sheet");

  // Score-chart info takeover (see showPerformanceChart below).
  const [perfInfoOpen, setPerfInfoOpen] = useState(false);

  // Opening Search drops the sheet to its half detent on the list so the
  // map stays visible while typing. Closing it (or switching drawers)
  // keeps that half view while a query is still active — the filtered
  // list shouldn't vanish just because the input was dismissed — and only
  // hands the whole map back once the search is empty. Committing to the
  // open detent closes Search.
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

  // The sheet steps one detent at a time via centred chevrons in the
  // handle row: up goes peek -> open directly (half only earns its keep
  // when a selection or live search is showing the list/details over a
  // panned map, so it's never a stop on the way up), then open is the
  // ceiling; down goes open -> half -> peek only while a selection is
  // showing, to keep that collapse a graceful step-down — with nothing
  // selected, or when open just undid an untouched peek -> open skip, it
  // goes open -> peek directly. peek shows only the up chevron, open only
  // down, half both. Tapping the peek row/card itself also jumps straight
  // to open.
  const searching = activeDrawer === "search";
  // Set when the up chevron skips peek -> open directly (a committed
  // selection, nothing moved the map). While it holds, the first down
  // chevron reverses that exact jump straight back to peek instead of
  // stopping at half. Any selection pans the map and forces half on its
  // own, so it clears this (see the camis-change effect below).
  const skippedToOpenRef = useRef(false);
  const expandSheet = useCallback(
    () => {
      setFrontSurface("sheet");
      setDetent((d) => {
        if (d !== "peek") return "open";
        // From peek the sheet always jumps straight to open. half is only
        // useful when a selection (or live search) shows the list/details
        // over a panned map; browsing with nothing selected wants the
        // full height, not a cramped third of the screen. The jump skips
        // half, so the next down chevron reverses it straight to peek.
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
        // Skip half on the way down when it has nothing to show: either
        // this open undoes an untouched peek -> open skip, or there's no
        // selection for a half view to sit over. Mirrors expandSheet, so
        // with nothing selected the sheet just toggles peek <-> open.
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

  // Reaching "open" (a commit to reading a record) closes Search rather
  // than leaving its drawer stranded behind a full-height sheet.
  useEffect(() => {
    if (searching && detent === "open") setActiveDrawer(null);
  }, [detent, searching]);

  // Tapping a map dot is exploratory: show the restaurant's card at peek
  // with the map still full-size. Tapping a list row is a commit: open
  // the sheet so its details are readable.
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

  // Selecting a restaurant lands at the half detent: its Details pane
  // over a map that has panned to the pin. The handle then promotes to
  // open (full record + pinned score chart). Any open app-bar drawer
  // closes so the details view isn't sitting under it.
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

  // Any change of selection pans the map and routes through its own
  // detent (half), so a pending peek<->open undo no longer applies.
  // Clearing the selection also drops the sheet back to peek.
  const prevCamisRef = useRef<string | null>(null);
  useEffect(() => {
    const camis = selectedRestaurant?.camis ?? null;
    if (camis !== prevCamisRef.current) {
      skippedToOpenRef.current = false;
      setPerfInfoOpen(false);
      if (!camis) setDetent("peek");
    }
    prevCamisRef.current = camis;
  }, [selectedRestaurant, setDetent]);

  // A dot tap on the pinned score chart highlights the matching
  // Inspection History row (previewInspection — no tab change) and asks
  // RestaurantDetails to scroll it into view. The nonce makes repeat
  // taps on the same dot re-scroll; a plain selection change never does.
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

  // Distance readouts on cards measure from the Search Radius point when
  // one is set, otherwise from the "locate me" dot.
  const distanceOrigin = searchRadiusPoint ?? userLocationPoint;

  // The score-history chart is a companion to the Details tab's
  // inspection-history list only — not the Report tab (per-inspection
  // violations). It flows at the end of the shared sheet scroll, below
  // the details content (CSS 18.5 / 18.6).
  const showPerformanceChart =
    selectedRestaurant != null && activeExplorerTab === "details";

  // The chart's info button opens a full-pane takeover (like the Details /
  // Report info panels) instead of a modal. Close it whenever the chart
  // itself goes away — leaving the Details tab, or clearing the selection.
  useEffect(() => {
    if (!showPerformanceChart) setPerfInfoOpen(false);
  }, [showPerformanceChart]);

  // Opening the takeover: reset the shared sheet scroll so its panel
  // header is at the top, not wherever the record was scrolled to.
  const sheetScrollBodyRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (perfInfoOpen) sheetScrollBodyRef.current?.scrollTo({ top: 0 });
  }, [perfInfoOpen]);

  // Switching tabs starts the new pane at the top rather than inheriting
  // the previous pane's scroll position in the shared scroll container.
  useEffect(() => {
    sheetScrollBodyRef.current?.scrollTo({ top: 0 });
  }, [activeExplorerTab]);

  // Publish the sheet's live rendered height as --mobile-sheet-h so the
  // map scale bar can pin 0.5rem above it. The peek card is now
  // content-driven (grows when a name/address wraps), so a static offset
  // no longer tracks it; half is a fixed height and open hides the bar.
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

  // Pixels of map the sheet currently covers — MapView reads this when a
  // GPS fix lands to fit the fix + selected restaurant above the sheet.
  const getViewBottomInset = useCallback(
    () => sheetRef.current?.getBoundingClientRect().height ?? 0,
    [],
  );

  // The peek row's browse prompt names whichever of search/filters/radius
  // are actually narrowing the results, rather than a generic "Browse
  // restaurants" that reads as if nothing were applied.
  const hasActiveFilters = filters.grades.length > 0 || filters.boroughs.length > 0;
  const browsePromptNoun = searching
    ? hasActiveFilters
      ? "Filtered Search Results"
      : "Search Results"
    : hasActiveFilters
      ? "Filtered Restaurants"
      : "restaurants";
  // A radius names its own scope; otherwise the true baseline (nothing
  // narrowing the results at all) calls out that it's the full map view,
  // rather than leaving the scope unstated. Search/filtered states already
  // say something more specific, so they don't get this suffix.
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
