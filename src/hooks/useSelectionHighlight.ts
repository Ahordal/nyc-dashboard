// useSelectionHighlight.ts
//
// White glow around the click-selected / list-hovered restaurant. ArcGIS
// allows one FeatureEffect per layer view, so it's shared — only
// `.filter` mutates, since ArcGIS won't reliably pick up a replaced effect string.
//
// MapView passes layer/view refs; exposes `applyHighlightForId` since
// MapView also calls it from the view.when() bootstrap and the filter/search sync effect.

import { useCallback, useEffect, useRef } from "react";
import type { RefObject } from "react";
import type GeoJSONLayer from "@arcgis/core/layers/GeoJSONLayer";
import type GeoJSONLayerView from "@arcgis/core/views/layers/GeoJSONLayerView";
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
  // Built once with a fixed effect string; only `.filter` is mutated after.
  const glowEffectRef = useRef<FeatureEffect | null>(null);
  const layerViewRef = useRef<GeoJSONLayerView | null>(null);
  const hoverHighlightRequestIdRef = useRef(0);

  const selectedObjectIdRef = useRef<number | null>(null);
  const hoveredObjectIdRef = useRef<number | null>(null);

  // Resolves and caches the layer view, building the glow effect on first use.
  const ensureLayerView = useCallback(async () => {
    if (layerViewRef.current) return layerViewRef.current;

    const layer = layerRef.current;
    const view = viewRef.current;
    if (!layer || !view) return null;

    let layerView: GeoJSONLayerView;
    try {
      await layer.load();
      layerView = (await view.whenLayerView(layer)) as GeoJSONLayerView;
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

  // Sets the filter to the union of selected + hovered IDs, without touching the effect string.
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
