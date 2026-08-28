// @vitest-environment jsdom

// useSelectionHighlight.test.ts
//
// Unit tests for useSelectionHighlight: installs the glow effect with the
// no-selection sentinel, resolves a selected restaurant's object id,
// unions the selected and hovered ids into one filter, and restores the
// sentinel when the selection is cleared.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { RefObject } from "react";
import type GeoJSONLayer from "@arcgis/core/layers/GeoJSONLayer";
import type MapView from "@arcgis/core/views/MapView";

const { checkSelectionMock } = vi.hoisted(() => ({
  checkSelectionMock: vi.fn(),
}));

// The hook only touches these two ArcGIS constructors; stub them with
// plain classes that copy their options through so tests can read the
// resulting `.filter` off the layer view.
vi.mock("@arcgis/core/layers/support/FeatureEffect", () => ({
  default: class {
    filter: unknown;
    constructor(opts: { filter?: unknown }) {
      this.filter = opts?.filter ?? null;
    }
  },
}));
vi.mock("@arcgis/core/layers/support/FeatureFilter", () => ({
  default: class {
    constructor(opts: Record<string, unknown>) {
      Object.assign(this, opts ?? {});
    }
  },
}));
vi.mock("../queries/mapQueries", () => ({
  checkSelectionAgainstFilters: checkSelectionMock,
}));

import { useSelectionHighlight } from "./useSelectionHighlight";

function setup() {
  const layerView = { featureEffect: null as unknown };
  const layer = {
    load: vi.fn().mockResolvedValue(undefined),
    definitionExpression: "",
  };
  const view = { whenLayerView: vi.fn().mockResolvedValue(layerView) };
  return {
    layer,
    view,
    layerView,
    layerRef: { current: layer } as unknown as RefObject<GeoJSONLayer | null>,
    viewRef: { current: view } as unknown as RefObject<MapView | null>,
  };
}

// The object IDs on whatever FeatureFilter is currently installed.
function activeObjectIds(layerView: { featureEffect: unknown }): number[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((layerView.featureEffect as any)?.filter?.objectIds ?? []).slice();
}

beforeEach(() => {
  checkSelectionMock.mockReset();
});

describe("useSelectionHighlight", () => {
  it("installs the glow effect with the no-selection sentinel when nothing is selected", async () => {
    const { layerRef, viewRef, layerView } = setup();

    renderHook(() =>
      useSelectionHighlight({
        layerRef,
        viewRef,
        selectedRestaurantId: null,
        hoveredRestaurantId: null,
      }),
    );

    await waitFor(() => expect(layerView.featureEffect).toBeTruthy());
    expect(activeObjectIds(layerView)).toEqual([-1]);
    expect(checkSelectionMock).not.toHaveBeenCalled();
  });

  it("looks up a selected restaurant's object id and filters the glow to it", async () => {
    checkSelectionMock.mockResolvedValue({ objectId: 42, stillMatches: true });
    const { layer, layerRef, viewRef, layerView } = setup();

    const { rerender } = renderHook(
      ({ id }: { id: string | null }) =>
        useSelectionHighlight({
          layerRef,
          viewRef,
          selectedRestaurantId: id,
          hoveredRestaurantId: null,
        }),
      { initialProps: { id: null as string | null } },
    );

    await waitFor(() => expect(layerView.featureEffect).toBeTruthy());
    rerender({ id: "abc" });

    await waitFor(() =>
      expect(checkSelectionMock).toHaveBeenCalledWith(layer, "abc", ""),
    );
    await waitFor(() => expect(activeObjectIds(layerView)).toEqual([42]));
  });

  it("unions the selected and hovered object ids into one filter", async () => {
    checkSelectionMock.mockImplementation((_layer, id: string) =>
      Promise.resolve({
        objectId: id === "sel" ? 1 : 2,
        stillMatches: true,
      }),
    );
    const { layerRef, viewRef, layerView } = setup();

    const { rerender } = renderHook(
      ({ s, h }: { s: string | null; h: string | null }) =>
        useSelectionHighlight({
          layerRef,
          viewRef,
          selectedRestaurantId: s,
          hoveredRestaurantId: h,
        }),
      { initialProps: { s: null as string | null, h: null as string | null } },
    );

    await waitFor(() => expect(layerView.featureEffect).toBeTruthy());
    rerender({ s: "sel", h: "hov" });

    await waitFor(() =>
      expect(activeObjectIds(layerView).sort()).toEqual([1, 2]),
    );
  });

  it("restores the no-selection sentinel when the selection is cleared", async () => {
    checkSelectionMock.mockResolvedValue({ objectId: 42, stillMatches: true });
    const { layerRef, viewRef, layerView } = setup();

    const { rerender } = renderHook(
      ({ id }: { id: string | null }) =>
        useSelectionHighlight({
          layerRef,
          viewRef,
          selectedRestaurantId: id,
          hoveredRestaurantId: null,
        }),
      { initialProps: { id: null as string | null } },
    );

    await waitFor(() => expect(layerView.featureEffect).toBeTruthy());
    rerender({ id: "abc" });
    await waitFor(() => expect(activeObjectIds(layerView)).toEqual([42]));

    rerender({ id: null });
    await waitFor(() => expect(activeObjectIds(layerView)).toEqual([-1]));
  });
});
