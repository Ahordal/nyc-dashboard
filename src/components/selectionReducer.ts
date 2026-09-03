// selectionReducer.ts
//
// The dashboard's selection/hover/tab cluster, lifted out of
// dashboard.tsx so the "selecting X also clears Y and switches tab"
// rules live in one place instead of being spread across handlers.
//
// Every restaurant selection flows through the `selectRestaurant`
// action, so it owns the "restaurant changed -> drop the stale
// inspection selection" reset that used to be a separate effect.

import type { RestaurantProperties } from "../types/restaurant";
import type { ExplorerTab } from "../utils/explorerTabs";

export type SelectionState = {
  selectedRestaurant: RestaurantProperties | null;
  selectedInspectionId: string | null;
  hoveredInspectionId: string | null;
  hoveredRestaurantId: string | null;
  activeTab: ExplorerTab;
};

export type SelectionAction =
  | { type: "selectRestaurant"; restaurant: RestaurantProperties | null }
  | { type: "selectInspection"; inspectionId: string }
  | { type: "previewInspection"; inspectionId: string }
  | { type: "changeTab"; tab: ExplorerTab }
  | { type: "hoverInspection"; inspectionId: string | null }
  | { type: "hoverRestaurant"; restaurantId: string | null };

export const INITIAL_SELECTION_STATE: SelectionState = {
  selectedRestaurant: null,
  selectedInspectionId: null,
  hoveredInspectionId: null,
  hoveredRestaurantId: null,
  activeTab: "list",
};

export function selectionReducer(
  state: SelectionState,
  action: SelectionAction,
): SelectionState {
  switch (action.type) {
    case "selectRestaurant": {
      // Compare by CAMIS, not object identity: map queries hand back
      // fresh refs for the same restaurant. Re-selecting the same one
      // keeps its inspection selection; any real change drops it.
      const sameRestaurant =
        state.selectedRestaurant?.camis === action.restaurant?.camis;

      return {
        selectedRestaurant: action.restaurant,
        selectedInspectionId: sameRestaurant
          ? state.selectedInspectionId
          : null,
        hoveredInspectionId: null,
        hoveredRestaurantId: null,
        activeTab: action.restaurant ? "details" : "list",
      };
    }

    case "selectInspection":
      return {
        ...state,
        selectedInspectionId: action.inspectionId,
        hoveredInspectionId: null,
        activeTab: "report",
      };

    // Like selectInspection but stays on the current tab — the mobile
    // score chart uses this so a dot tap highlights the matching
    // Inspection History row (and scrolls it into view) instead of
    // jumping to the report and hiding the chart.
    case "previewInspection":
      return {
        ...state,
        selectedInspectionId: action.inspectionId,
        hoveredInspectionId: null,
      };

    case "changeTab":
      return {
        ...state,
        hoveredInspectionId: null,
        hoveredRestaurantId: null,
        activeTab: action.tab,
      };

    case "hoverInspection":
      return { ...state, hoveredInspectionId: action.inspectionId };

    case "hoverRestaurant":
      return { ...state, hoveredRestaurantId: action.restaurantId };
  }
}
