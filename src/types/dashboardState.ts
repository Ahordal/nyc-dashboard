// Grouped selection/radius state shared between dashboard.tsx and
// MobileDashboard, so adding a field only touches one bundle instead of
// the whole component signature.

import type { ExplorerTab } from "../utils/explorerTabs";
import type {
  RestaurantProperties,
  InspectionEvent,
} from "./restaurant";
import type { SearchRadiusPoint, SearchRadiusMiles } from "./searchRadius";
import type { InitialRadiusState } from "../hooks/useUrlSync";

export type SelectionState = {
  restaurant: RestaurantProperties | null;
  reportInspectionId: string | null;
  hoveredInspectionId: string | null;
  hoveredRestaurantId: string | null;
  activeTab: ExplorerTab;
  history: InspectionEvent[];
  isLoadingHistory: boolean;
};

export type SelectionHandlers = {
  onSelectRestaurant: (restaurant: RestaurantProperties | null) => void;
  onSelectInspection: (inspectionId: string) => void;
  // Highlights the matching history row without leaving Details — used by
  // the pinned chart's dot taps.
  onPreviewInspection: (inspectionId: string) => void;
  onHoverInspection: (inspectionId: string | null) => void;
  onHoverRestaurant: (restaurant: RestaurantProperties | null) => void;
  onExplorerTabChange: (tab: ExplorerTab) => void;
};

export type RadiusState = {
  searchRadiusPoint: SearchRadiusPoint | null;
  activeRadiusMiles: SearchRadiusMiles;
  // Locate dot position (in-NYC only). Feeds per-card distance, separate
  // from the Search Radius point.
  userLocationPoint: SearchRadiusPoint | null;
  // Radius restored from the URL, passed to MapView to re-place the point and re-frame.
  initialSearchRadius: InitialRadiusState | null;
};

export type RadiusHandlers = {
  onSearchRadiusChange: (
    point: SearchRadiusPoint | null,
    radiusMiles: SearchRadiusMiles,
  ) => void;
  onUserLocationChange: (
    point: { latitude: number; longitude: number } | null,
  ) => void;
};
