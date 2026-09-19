// useMapHover.ts
//
// Owns the map's pointer-move behaviour: throttled hit-testing, cursor,
// `onHoverRestaurant`, and the hover card (past HOVER_CARD_MAX_SCALE).
//
// MapView passes `view` plus stable refs once it exists. Listeners
// attach then and detach on unmount — fine since the map isn't
// interactive until it settles anyway.

import { useEffect } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import type GeoJSONLayer from "@arcgis/core/layers/GeoJSONLayer";
import type MapView from "@arcgis/core/views/MapView";

import type { RestaurantProperties } from "../types/restaurant";
import type { HoverCardState } from "../components/MapHoverCard";
import { getGradeCategory } from "../utils/gradeCategory";
import { findRestaurantGraphicHit } from "../queries/mapQueries";

// Hover cards need distinguishable dots; below this scale the handler
// still runs (cursor, hover callback) but shows no card.
const HOVER_CARD_MAX_SCALE = 18056;

const POINTER_MOVE_THROTTLE_MS = 60;

type UseMapHoverArgs = {
  view: MapView | null;
  layerRef: RefObject<GeoJSONLayer | null>;
  isPlacingPointRef: RefObject<boolean>;
  onHoverRestaurantRef: RefObject<
    ((restaurant: RestaurantProperties | null) => void) | undefined
  >;
  setHoverCard: Dispatch<SetStateAction<HoverCardState | null>>;
};

export function useMapHover({
  view,
  layerRef,
  isPlacingPointRef,
  onHoverRestaurantRef,
  setHoverCard,
}: UseMapHoverArgs) {
  useEffect(() => {
    const layer = layerRef.current;
    if (!view || !layer) return;

    let pointerMoveTimeoutId: number | null = null;
    // Only screen coords are needed; the full pointer-move event assigns
    // cleanly to this subset.
    let latestPointerMoveEvent: { x: number; y: number } | null = null;
    let latestHitTestToken = 0;

    const runHitTest = async (event: { x: number; y: number }) => {
      if (isPlacingPointRef.current) return;

      const token = ++latestHitTestToken;
      let response;
      try {
        response = await view.hitTest(event);
      } catch (err) {
        console.error("MapView: failed to hit-test pointer move", err);
        return;
      }
      if (token !== latestHitTestToken) return;

      const graphicHit = findRestaurantGraphicHit(response, layer);

      if (view.container) {
        view.container.style.cursor = graphicHit ? "pointer" : "default";
      }

      onHoverRestaurantRef.current?.(
        graphicHit ? graphicHit.graphic.attributes : null,
      );

      if (graphicHit && view.scale <= HOVER_CARD_MAX_SCALE) {
        const attrs = graphicHit.graphic.attributes;

        setHoverCard({
          x: event.x,
          y: event.y,
          name: attrs.name,
          category: getGradeCategory(attrs.action, attrs.grade, attrs.score),
          gradeText: attrs.grade ? attrs.grade : "N/A",
          scoreText: attrs.score != null ? String(attrs.score) : "—",
        });
      } else {
        setHoverCard(null);
      }
    };

    const pointerMoveHandle = view.on("pointer-move", (event) => {
      latestPointerMoveEvent = event;
      if (pointerMoveTimeoutId !== null) return;

      pointerMoveTimeoutId = window.setTimeout(() => {
        pointerMoveTimeoutId = null;
        const eventToTest = latestPointerMoveEvent;
        latestPointerMoveEvent = null;
        if (eventToTest) void runHitTest(eventToTest);
      }, POINTER_MOVE_THROTTLE_MS);
    });

    const handlePointerLeave = () => {
      // Invalidates any in-flight hit test so its response can't reopen
      // the hover card after the pointer has already left the map.
      latestHitTestToken++;
      setHoverCard(null);
      // Don't clear the crosshair while a Search Radius point is being placed.
      if (view.container && !isPlacingPointRef.current) {
        view.container.style.cursor = "default";
      }
      onHoverRestaurantRef.current?.(null);
    };
    view.container?.addEventListener("mouseleave", handlePointerLeave);

    return () => {
      pointerMoveHandle.remove();
      if (pointerMoveTimeoutId !== null) {
        window.clearTimeout(pointerMoveTimeoutId);
      }
      view.container?.removeEventListener("mouseleave", handlePointerLeave);
    };
  }, [view, layerRef, isPlacingPointRef, onHoverRestaurantRef, setHoverCard]);
}
