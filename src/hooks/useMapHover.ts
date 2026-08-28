// useMapHover.ts
//
// Owns the map's pointer-move behaviour: a trailing-edge throttle over
// pointer-move events, a hit test against the restaurant layer, the
// pointer cursor, the `onHoverRestaurant` callback, and the on-canvas
// hover card (shown only once zoomed in past HOVER_CARD_MAX_SCALE).
//
// MapView passes the `view` (once it exists), the layer ref, and the
// stable refs/setter this needs. Listeners attach when `view` becomes
// non-null and detach on unmount, one render tick later than the map's
// own mount effect, which is harmless since the map isn't interactive
// until it settles anyway.

import { useEffect } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import type GeoJSONLayer from "@arcgis/core/layers/GeoJSONLayer";
import type MapView from "@arcgis/core/views/MapView";

import type { RestaurantProperties } from "../types/restaurant";
import type { HoverCardState } from "../components/MapHoverCard";
import { getGradeCategory } from "../utils/gradeCategory";
import { findRestaurantGraphicHit } from "../queries/mapQueries";

// Hover cards only make sense when individual dots are distinguishable.
// Zoomed further out than this the pointer-move handler still runs (for
// the cursor and the hover callback) but never shows a card.
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
    // Only the screen coordinates are read here and passed to hitTest;
    // the full ArcGIS pointer-move event assigns cleanly to this subset.
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
