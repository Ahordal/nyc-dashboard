// useSelectionHighlight.ts
//
// Owns the white glow drawn around the click-selected and list-hovered
// restaurant on the map. ArcGIS allows only one FeatureEffect per layer
// view, so a single effect is shared and its `.filter` is mutated to the
// union of the two object IDs -- the effect string itself is never
// reassigned, because ArcGIS doesn't reliably pick up a replaced effect
// on a live layer view.
//
// MapView creates the layer and view in its mount effect and passes
// their refs in; this hook reads `.current` lazily, only when a
// highlight is actually applied. `applyHighlightForId` is returned
// because MapView also calls it from two other places -- the view.when()
// bootstrap, and the filter/search sync effect (which already knows the
// object ID and passes it in to skip the lookup).

import { useCallback, useEffect, useRef } from "react";
import type { RefObject } from "react";
import type GeoJSONLayer from "@arcgis/core/layers/GeoJSONLayer";
import type MapView from "@arcgis/core/views/MapView";
import FeatureEffect from "@arcgis/core/layers/support/FeatureEffect";
import FeatureFilter from "@arcgis/core/layers/support/FeatureFilter";

import { checkSelectionAgainstFilters } from "../queries/mapQueries";

const NO_SELECTION_FILTER = new FeatureFilter({ objectIds: [-1] });

const SELECTION_GLOW_EFFECT =
  "drop-shadow(0px, 0px, 8px, #ffffff) bloom(2, 0.5px, 0%)";

type UseSelectionHighlightArgs = {
  layerRef: RefObject<GeoJSONLayer | null>;
  viewRef: RefObject<MapView | null>;
  selectedRestaurantId: string | null;
  hoveredRestaurantId: string | null;
};

export function useSelectionHighlight({
  layerRef,
  viewRef,
  selectedRestaurantId,
  hoveredRestaurantId,
}: UseSelectionHighlightArgs) {
  // Builds the glow FeatureEffect once with a fixed included effect
  // string; only `.filter` is mutated afterwards.
  const glowEffectRef = useRef<FeatureEffect | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const layerViewRef = useRef<any>(null);
  const hoverHighlightRequestIdRef = useRef(0);

  const selectedObjectIdRef = useRef<number | null>(null);
  const hoveredObjectIdRef = useRef<number | null>(null);

  // Resolves and caches the layer view, lazily building the shared glow
  // FeatureEffect the first time it's needed.
  const ensureLayerView = useCallback(async () => {
    if (layerViewRef.current) return layerViewRef.current;

    const layer = layerRef.current;
    const view = viewRef.current;
    if (!layer || !view) return null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let layerView: any;
    try {
      await layer.load();
      layerView = await view.whenLayerView(layer);
    } catch (err) {
      console.error(
        "MapView: failed to load layer view for highlight effect",
        err,
      );
      return null;
    }

    if (!glowEffectRef.current) {
      glowEffectRef.current = new FeatureEffect({
        filter: NO_SELECTION_FILTER,
        includedEffect: SELECTION_GLOW_EFFECT,
        excludedLabelsVisible: true,
      });
    }

    layerViewRef.current = layerView;
    return layerView;
  }, [layerRef, viewRef]);

  // Installs the glow FeatureEffect on the layer view and updates its
  // object ID filter to the union of the click-selected and list-hovered
  // restaurants, mutating `.filter` without changing the effect string.
  const applyCombinedHighlight = useCallback(() => {
    const layerView = layerViewRef.current;
    const glowEffect = glowEffectRef.current;
    if (!layerView || !glowEffect) return;

    const objectIds = Array.from(
      new Set(
        [selectedObjectIdRef.current, hoveredObjectIdRef.current].filter(
          (id): id is number => id !== null,
        ),
      ),
    );

    glowEffect.filter =
      objectIds.length > 0
        ? new FeatureFilter({ objectIds })
        : NO_SELECTION_FILTER;
    if (layerView.featureEffect !== glowEffect) {
      layerView.featureEffect = glowEffect;
    }
  }, []);

  const applyHighlightForId = useCallback(
    async (restaurantId: string | null, knownObjectId?: number | null) => {
      const layerView = await ensureLayerView();
      if (!layerView) return;

      if (!restaurantId) {
        selectedObjectIdRef.current = null;
        applyCombinedHighlight();
        return;
      }

      if (knownObjectId !== undefined) {
        selectedObjectIdRef.current = knownObjectId;
        applyCombinedHighlight();
        return;
      }

      const layer = layerRef.current;
      if (!layer) return;

      try {
        const { objectId } = await checkSelectionAgainstFilters(
          layer,
          restaurantId,
          layer.definitionExpression ?? "",
        );
        selectedObjectIdRef.current = objectId;
        applyCombinedHighlight();
      } catch (err) {
        console.error(
          "MapView: failed to query feature for highlight effect",
          err,
        );
      }
    },
    [ensureLayerView, applyCombinedHighlight, layerRef],
  );

  const applyHoverHighlightForId = useCallback(
    async (restaurantId: string | null) => {
      const layerView = await ensureLayerView();
      if (!layerView) return;

      if (!restaurantId) {
        hoveredObjectIdRef.current = null;
        applyCombinedHighlight();
        return;
      }

      const layer = layerRef.current;
      if (!layer) return;

      const requestId = ++hoverHighlightRequestIdRef.current;
      try {
        const { objectId } = await checkSelectionAgainstFilters(
          layer,
          restaurantId,
          layer.definitionExpression ?? "",
        );
        if (requestId !== hoverHighlightRequestIdRef.current) return;
        hoveredObjectIdRef.current = objectId;
        applyCombinedHighlight();
      } catch (err) {
        console.error(
          "MapView: failed to query feature for hover highlight effect",
          err,
        );
      }
    },
    [ensureLayerView, applyCombinedHighlight, layerRef],
  );

  useEffect(() => {
    void applyHighlightForId(selectedRestaurantId);
  }, [selectedRestaurantId, applyHighlightForId]);

  useEffect(() => {
    void applyHoverHighlightForId(hoveredRestaurantId);
  }, [hoveredRestaurantId, applyHoverHighlightForId]);

  return { applyHighlightForId };
}
