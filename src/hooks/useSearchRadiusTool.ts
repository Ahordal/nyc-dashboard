// useSearchRadiusTool.ts
//
// Manages Search Radius state, placement, and ring rendering. Uses refs
// for callbacks, avoiding stale closures in MapView's mount effect.

import { useCallback, useEffect, useRef, useState } from "react";
import type MapView from "@arcgis/core/views/MapView";
import type GraphicsLayer from "@arcgis/core/layers/GraphicsLayer";
import Point from "@arcgis/core/geometry/Point";
import * as webMercatorUtils from "@arcgis/core/geometry/support/webMercatorUtils";

import type { SearchRadiusPoint, SearchRadiusMiles } from "../types/searchRadius";
import { buildSearchRadiusGraphics } from "../utils/searchRadiusRings";

const DEFAULT_RADIUS_MILES: SearchRadiusMiles = 0.25;

const METERS_PER_MILE = 1609.344;
// ArcGIS scale = (projected metres per pixel) * 96 dpi / 0.0254 m per inch.
const SCALE_PER_METER_PER_PIXEL = 96 / 0.0254;
// Margin so the circle always sits fully inside the view.
const FRAMING_PADDING = 1.4;

export function useSearchRadiusTool(
  view: MapView | null,
  ringsLayer: GraphicsLayer | null,
  // Radius restored from the URL, applied once the view and rings layer
  // are ready. Ignored after that, so it never fights the user's own placement.
  initialRadius?: { point: SearchRadiusPoint; miles: SearchRadiusMiles } | null,
) {
  const [isPlacingPoint, setIsPlacingPoint] = useState(false);
  const [searchRadiusPoint, setSearchRadiusPoint] =
    useState<SearchRadiusPoint | null>(null);
  const [activeRadiusMiles, setActiveRadiusMiles] =
    useState<SearchRadiusMiles>(DEFAULT_RADIUS_MILES);

  const viewRef = useRef(view);
  const ringsLayerRef = useRef(ringsLayer);
  const isPlacingPointRef = useRef(isPlacingPoint);
  const searchRadiusPointRef = useRef(searchRadiusPoint);
  const activeRadiusMilesRef = useRef(activeRadiusMiles);

  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  useEffect(() => {
    ringsLayerRef.current = ringsLayer;
  }, [ringsLayer]);

  useEffect(() => {
    isPlacingPointRef.current = isPlacingPoint;
  }, [isPlacingPoint]);

  useEffect(() => {
    searchRadiusPointRef.current = searchRadiusPoint;
  }, [searchRadiusPoint]);

  useEffect(() => {
    activeRadiusMilesRef.current = activeRadiusMiles;
  }, [activeRadiusMiles]);

  const drawRings = useCallback(
    (point: SearchRadiusPoint, miles: SearchRadiusMiles) => {
      const graphicsLayer = ringsLayerRef.current;
      if (!graphicsLayer) return;
      graphicsLayer.removeAll();
      graphicsLayer.addMany(buildSearchRadiusGraphics(point, miles));
    },
    [],
  );

  // Pans/zooms to fit the radius circle (plus FRAMING_PADDING) to the
  // shorter view axis. Runs on placement and distance changes.
  const frameRadiusCircle = useCallback(
    (point: SearchRadiusPoint, miles: SearchRadiusMiles) => {
      const view = viewRef.current;
      if (!view || !view.width || !view.height) return;

      const center = webMercatorUtils.geographicToWebMercator(
        new Point({
          longitude: point.longitude,
          latitude: point.latitude,
          spatialReference: { wkid: 4326 },
        }),
      ) as Point;

      // Projected (Web Mercator) metres: Mercator inflates ground distance
      // by 1/cos(latitude), and ArcGIS `scale` is metres-per-pixel in that projection.
      const latRadians = (point.latitude * Math.PI) / 180;
      const radiusProjectedMeters =
        (miles * METERS_PER_MILE * FRAMING_PADDING) / Math.cos(latRadians);

      const fitScale =
        ((radiusProjectedMeters * 2) / Math.min(view.width, view.height)) *
        SCALE_PER_METER_PER_PIXEL;

      view
        .goTo({ center, scale: fitScale }, { duration: 600 })
        .catch(() => {
          // goTo rejects if the user interrupts the animation; ignore.
        });
    },
    [],
  );

  // One-shot: waits for view + rings layer, re-places the point, redraws
  // rings, frames once sized. Guarded against re-firing on identity changes or remounts.
  const didRestoreRef = useRef(false);
  useEffect(() => {
    if (didRestoreRef.current) return;
    if (!initialRadius || !view || !ringsLayer) return;

    didRestoreRef.current = true;

    const { point, miles } = initialRadius;
    searchRadiusPointRef.current = point;
    setSearchRadiusPoint(point);
    activeRadiusMilesRef.current = miles;
    setActiveRadiusMiles(miles);
    drawRings(point, miles);

    view
      .when(() => frameRadiusCircle(point, miles))
      .catch(() => {
        // View was destroyed before it became ready; nothing to frame.
      });
  }, [view, ringsLayer, initialRadius, drawRings, frameRadiusCircle]);

  const handleActivate = useCallback(() => {
    isPlacingPointRef.current = true;
    setIsPlacingPoint(true);
    if (viewRef.current?.container) {
      viewRef.current.container.style.cursor = "crosshair";
    }
  }, []);

  // Exits placement without clearing an existing point — for a cancelled relocation.
  const handleCancelPlacement = useCallback(() => {
    isPlacingPointRef.current = false;
    setIsPlacingPoint(false);
    if (viewRef.current?.container) {
      viewRef.current.container.style.cursor = "default";
    }
  }, []);

  const handleDismiss = useCallback(() => {
    isPlacingPointRef.current = false;
    setIsPlacingPoint(false);
    searchRadiusPointRef.current = null;
    setSearchRadiusPoint(null);
    // Resets radius on close, so reopening starts at the default, not the last pick.
    activeRadiusMilesRef.current = DEFAULT_RADIUS_MILES;
    setActiveRadiusMiles(DEFAULT_RADIUS_MILES);
    ringsLayerRef.current?.removeAll();
    if (viewRef.current?.container) {
      viewRef.current.container.style.cursor = "default";
    }
  }, []);

  const handleRadiusChange = useCallback(
    (miles: SearchRadiusMiles) => {
      activeRadiusMilesRef.current = miles;
      setActiveRadiusMiles(miles);
      const point = searchRadiusPointRef.current;
      if (point) {
        drawRings(point, miles);
        frameRadiusCircle(point, miles);
      }
    },
    [drawRings, frameRadiusCircle],
  );

  // Called from MapView's click handler while placing a point; reads via refs per the note above.
  const placePointAt = useCallback(
    (mapPoint: { longitude: number; latitude: number }) => {
      const point: SearchRadiusPoint = {
        longitude: mapPoint.longitude,
        latitude: mapPoint.latitude,
      };

      isPlacingPointRef.current = false;
      setIsPlacingPoint(false);
      searchRadiusPointRef.current = point;
      setSearchRadiusPoint(point);
      drawRings(point, activeRadiusMilesRef.current);

      if (viewRef.current?.container) {
        viewRef.current.container.style.cursor = "default";
      }

      frameRadiusCircle(point, activeRadiusMilesRef.current);
    },
    [drawRings, frameRadiusCircle],
  );

  return {
    isPlacingPoint,
    isPlacingPointRef,
    searchRadiusPoint,
    searchRadiusPointRef,
    activeRadiusMiles,
    activeRadiusMilesRef,
    handleActivate,
    handleCancelPlacement,
    handleDismiss,
    handleRadiusChange,
    placePointAt,
  };
}
