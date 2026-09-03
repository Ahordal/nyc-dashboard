// MobileDashboard.tsx
//
// Phone layout (rendered by dashboard.tsx below ~640px): a slim app bar,
// an area-summary strip (count + grade mix for the current view), a
// full-bleed map, and a bottom sheet that is purely restaurant info.
// The sheet has two detents: peek shows the selected restaurant's list
// card (or a browse prompt) over a full-size map; open is one scrolling
// view of the search, tab list, the list or the selected restaurant's
// details/report, and the score-history chart below it. Grade/borough
// filters live in the app bar's Filters modal; the grade donut and
// dataset meta live in the area strip's modal. All shared state stays
// in dashboard.tsx; the child panels are the desktop ones.

import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronDown } from "@fortawesome/free-solid-svg-icons";

import MobileAppBar from "./MobileAppBar";
import MobileAreaStrip from "./MobileAreaStrip";
import ExplorerSearch from "./ExplorerSearch";
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
  initialSearchRadius,
  pendingCamisFromUrl,
  onInitialSelectionResolved,
  history,
  isLoadingHistory,
  violationCodes,
  dashboardMeta,
}: MobileDashboardProps) {
  const { detent, setDetent, toggle, open } = useBottomSheet("peek");

  // The one open top drawer, if any — Filters / Info (app bar) and the
  // grade-breakdown drawer (area strip) are mutually exclusive.
  const [activeDrawer, setActiveDrawer] = useState<
    "filters" | "info" | "grades" | null
  >(null);

  // Tapping a map dot is exploratory: show the restaurant's card at peek
  // with the map still full-size. Tapping a list row is a commit: open
  // the sheet so its details are readable.
  const handleMapSelect = useCallback(
    (restaurant: RestaurantProperties | null) => {
      onSelectRestaurant(restaurant);
      if (restaurant) setDetent("peek");
    },
    [onSelectRestaurant, setDetent],
  );

  const handleListSelect = useCallback(
    (restaurant: RestaurantProperties | null) => {
      onSelectRestaurant(restaurant);
      if (restaurant) open();
    },
    [onSelectRestaurant, open],
  );

  // Clearing the selection drops the sheet back to peek.
  const prevCamisRef = useRef<string | null>(null);
  useEffect(() => {
    const camis = selectedRestaurant?.camis ?? null;
    if (!camis && prevCamisRef.current) {
      setDetent("peek");
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

  // The score-history chart is a companion to the Details tab's
  // inspection-history list only — not the Report tab (per-inspection
  // violations). On the Details tab it's pinned to the bottom of the
  // sheet while the details content scrolls above it (CSS 18.5 / 18.6).
  const showPerformanceChart =
    selectedRestaurant != null && activeExplorerTab === "details";

  function paneClass(tab: ExplorerTab, base: string) {
    return `${base} ${activeExplorerTab === tab ? "" : "explorer-pane-hidden"}`;
  }

  return (
    <main
      className="mobile-dashboard"
      data-detent={detent}
      data-peek={selectedRestaurant ? "card" : "empty"}
      data-tab={activeExplorerTab}>
      <MobileAppBar
        filters={filters}
        setFilters={setFilters}
        meta={dashboardMeta}
        activeDrawer={activeDrawer}
        onDrawerChange={setActiveDrawer}
      />

      <MobileAreaStrip
        gradeCounts={gradeCounts}
        visibleRestaurants={visibleRestaurants}
        filters={filters}
        searchRadiusMiles={radiusMiles}
        open={activeDrawer === "grades"}
        onToggle={() =>
          setActiveDrawer((d) => (d === "grades" ? null : "grades"))
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
              initialSearchRadius={initialSearchRadius}
              initialSelectedCamis={pendingCamisFromUrl}
              onInitialSelectionResolved={onInitialSelectionResolved}
            />
          </Suspense>
        </ErrorBoundary>
      </div>

      <section className="mobile-sheet" aria-label="Restaurant explorer">
        <button
          type="button"
          className="mobile-sheet-handle"
          aria-label={detent === "open" ? "Collapse panel" : "Expand panel"}
          onClick={toggle}>
          <FontAwesomeIcon
            icon={faChevronDown}
            className="mobile-sheet-chevron"
            aria-hidden="true"
          />
        </button>

        {detent === "peek" &&
          (selectedRestaurant ? (
            <div className="mobile-sheet-peek-card">
              <RestaurantCard
                restaurant={selectedRestaurant}
                isSelected
                onClick={open}
              />
            </div>
          ) : (
            <button
              type="button"
              className="mobile-sheet-peek"
              onClick={() => {
                if (activeExplorerTab !== "list") onExplorerTabChange("list");
                open();
              }}
              aria-label="Expand panel to browse restaurants">
              <span className="mobile-sheet-peek-label">
                Browse restaurants{searchRadiusPoint ? " in radius" : ""}
              </span>
            </button>
          ))}

        {detent === "open" && (
          <div className="mobile-sheet-scroll">
            <div className="mobile-sheet-search">
              <ExplorerSearch onSearchChange={onSearchChange} />
            </div>

            <div className="mobile-explorer">
              <ExplorerTabs
                activeTab={activeExplorerTab}
                onTabChange={onExplorerTabChange}
              />

              <div className="explorer-content">
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
                  />
                </div>

                <div
                  id={tabPanelId("details")}
                  role="tabpanel"
                  aria-labelledby={tabButtonId("details")}
                  className={paneClass("details", "restaurant-details")}>
                  <RestaurantDetails
                    restaurant={selectedRestaurant}
                    history={history}
                    isLoadingHistory={isLoadingHistory}
                    selectedInspectionId={reportInspectionId}
                    onSelectInspection={onSelectInspection}
                    onHoverInspection={onHoverInspection}
                    historyScrollTarget={historyScrollTarget}
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
            </div>

            {showPerformanceChart && (
              <div className="mobile-perf-chart">
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
                      tooltipVariant="compact"
                    />
                  </Suspense>
                </ErrorBoundary>
              </div>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
