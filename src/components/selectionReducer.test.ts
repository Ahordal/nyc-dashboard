// selectionReducer.test.ts
//
// Unit tests for selectionReducer: the cross-field resets each action
// performs (clearing hovers, dropping a stale inspection selection,
// switching the active tab) and the CAMIS-based same-restaurant guard.

import { describe, it, expect } from "vitest";

import {
  selectionReducer,
  INITIAL_SELECTION_STATE,
  type SelectionState,
} from "./selectionReducer";
import type { RestaurantProperties } from "../types/restaurant";

function restaurant(camis: string, id = camis): RestaurantProperties {
  return { camis, id } as RestaurantProperties;
}

const POPULATED: SelectionState = {
  selectedRestaurant: restaurant("100"),
  selectedInspectionId: "insp-1",
  hoveredInspectionId: "insp-2",
  hoveredRestaurantId: "200",
  activeTab: "report",
};

describe("selectionReducer", () => {
  describe("selectRestaurant", () => {
    it("selects a restaurant, opens Details, and clears both hovers", () => {
      const next = selectionReducer(INITIAL_SELECTION_STATE, {
        type: "selectRestaurant",
        restaurant: restaurant("42"),
      });

      expect(next.selectedRestaurant?.camis).toBe("42");
      expect(next.activeTab).toBe("details");
      expect(next.hoveredInspectionId).toBeNull();
      expect(next.hoveredRestaurantId).toBeNull();
    });

    it("clears the selection back to the list when passed null", () => {
      const next = selectionReducer(POPULATED, {
        type: "selectRestaurant",
        restaurant: null,
      });

      expect(next.selectedRestaurant).toBeNull();
      expect(next.activeTab).toBe("list");
      expect(next.selectedInspectionId).toBeNull();
      expect(next.hoveredInspectionId).toBeNull();
      expect(next.hoveredRestaurantId).toBeNull();
    });

    it("drops the inspection selection when a different restaurant is chosen", () => {
      const next = selectionReducer(POPULATED, {
        type: "selectRestaurant",
        restaurant: restaurant("999"),
      });

      expect(next.selectedInspectionId).toBeNull();
    });

    it("keeps the inspection selection when the same restaurant is re-selected via a fresh object", () => {
      const next = selectionReducer(POPULATED, {
        type: "selectRestaurant",
        restaurant: restaurant("100"),
      });

      expect(next.selectedRestaurant).not.toBe(POPULATED.selectedRestaurant);
      expect(next.selectedInspectionId).toBe("insp-1");
      expect(next.hoveredInspectionId).toBeNull();
      expect(next.hoveredRestaurantId).toBeNull();
    });
  });

  describe("selectInspection", () => {
    it("sets the inspection, opens Report, and clears only the inspection hover", () => {
      const next = selectionReducer(POPULATED, {
        type: "selectInspection",
        inspectionId: "insp-9",
      });

      expect(next.selectedInspectionId).toBe("insp-9");
      expect(next.activeTab).toBe("report");
      expect(next.hoveredInspectionId).toBeNull();
      expect(next.hoveredRestaurantId).toBe("200");
      expect(next.selectedRestaurant).toBe(POPULATED.selectedRestaurant);
    });
  });

  describe("changeTab", () => {
    it("switches tab and clears both hovers, leaving selections intact", () => {
      const next = selectionReducer(POPULATED, {
        type: "changeTab",
        tab: "list",
      });

      expect(next.activeTab).toBe("list");
      expect(next.hoveredInspectionId).toBeNull();
      expect(next.hoveredRestaurantId).toBeNull();
      expect(next.selectedRestaurant).toBe(POPULATED.selectedRestaurant);
      expect(next.selectedInspectionId).toBe("insp-1");
    });
  });

  describe("hover actions", () => {
    it("hoverInspection sets only the inspection hover", () => {
      const next = selectionReducer(INITIAL_SELECTION_STATE, {
        type: "hoverInspection",
        inspectionId: "insp-3",
      });

      expect(next.hoveredInspectionId).toBe("insp-3");
      expect(next).toMatchObject({
        selectedRestaurant: null,
        activeTab: "list",
      });
    });

    it("hoverRestaurant sets only the restaurant hover, including clearing it", () => {
      const hovered = selectionReducer(INITIAL_SELECTION_STATE, {
        type: "hoverRestaurant",
        restaurantId: "77",
      });
      expect(hovered.hoveredRestaurantId).toBe("77");

      const cleared = selectionReducer(hovered, {
        type: "hoverRestaurant",
        restaurantId: null,
      });
      expect(cleared.hoveredRestaurantId).toBeNull();
    });
  });
});
