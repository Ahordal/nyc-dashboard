// useSearchRadiusTool.ts
//
// Hook managing Search Radius state, point placement, radius selection, and
// concentric-ring GraphicsLayer rendering. Uses ref-based access for callbacks
// to prevent stale closures in MapView's mount effect.

import { useCallback, useEffect, useRef, useState } from "react";
import type MapView from "@arcgis/core/views/MapView";
import type GraphicsLayer from "@arcgis/core/layers/GraphicsLayer";
import Point from "@arcgis/core/geometry/Point";
import * as webMercatorUtils from "@arcgis/core/geometry/support/webMercatorUtils";

import type { SearchRadiusPoint, SearchRadiusMiles } from "../types/searchRadius";
import { buildSearchRadiusGraphics } from "../utils/searchRadiusRings";

const DEFAULT_RADIUS_MILES: SearchRadiusMiles = 0.25;

// Clamp the framing zoom to this scale so fitting a larger ring never
// zooms out past the restaurant hover threshold (HOVER_CARD_MAX_SCALE).
const FRAMING_MAX_SCALE = 18056;

const METERS_PER_MILE = 1609.344;
// ArcGIS scale = (projected metres per pixel) * 96 dpi / 0.0254 m per inch.
const SCALE_PER_METER_PER_PIXEL = 96 / 0.0254;
// Extra margin around the circle when it does fit.
const FRAMING_PADDING = 1.4;

export function useSearchRadiusTool(
  view: MapView | null,
  ringsLayer: GraphicsLayer | null,
  // A radius restored from the URL. Applied exactly once, as soon as the
  // view and rings layer are both ready; ignored afterwards so it never
  // fights the user's own placement.
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

  // Pans and zooms to frame the circle for the selected distance (capped
  // at FRAMING_MAX_SCALE). Runs on placement and on distance changes so
  // the view matches the panel's scope, without disturbing a manual
  // pan/zoom.
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

      // Circle radius in *projected* (Web Mercator) metres: Mercator
      // inflates ground distance by 1 / cos(latitude), and ArcGIS `scale`
      // is defined against projected metres per pixel.
      const latRadians = (point.latitude * Math.PI) / 180;
      const radiusProjectedMeters =
        (miles * METERS_PER_MILE * FRAMING_PADDING) / Math.cos(latRadians);

      const fitScale =
        ((radiusProjectedMeters * 2) / Math.min(view.width, view.height)) *
        SCALE_PER_METER_PER_PIXEL;

      view
        .goTo(
          { center, scale: Math.min(fitScale, FRAMING_MAX_SCALE) },
          { duration: 600 },
        )
        .catch(() => {
          // goTo rejects if the user interrupts the animation; ignore.
        });
    },
    [],
  );

  // One-shot restore of a radius carried in on the URL. Waits for both
  // the view and rings layer, then re-places the point, redraws the
  // rings, and frames the circle once the view has a size (goTo needs
  // view.width/height). The didRestore guard keeps it from re-firing when
  // `initialRadius`'s identity changes or the view remounts.
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

  // Exits placement mode without clearing an existing point (used when a
  // relocation is cancelled mid-placement).
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
    // Closing the tool resets the radius, so reopening always starts at
    // the default rather than the last-picked distance.
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

  // Called from MapView's click handler while isPlacingPointRef.current
  // is true; see the note above on why this reads everything via refs.
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
