// userLocationGraphics.ts
//
// Pure graphics builder for the map's "locate me" control: a fixed-size
// blue dot (kept larger than the score dots so it never reads as a
// restaurant) plus a translucent accuracy circle sized to the fix's
// reported precision. Decoupled from MapView, mirroring searchRadiusRings.

import Graphic from "@arcgis/core/Graphic";
import Circle from "@arcgis/core/geometry/Circle";
import Point from "@arcgis/core/geometry/Point";
import SimpleFillSymbol from "@arcgis/core/symbols/SimpleFillSymbol";
import SimpleLineSymbol from "@arcgis/core/symbols/SimpleLineSymbol";
import SimpleMarkerSymbol from "@arcgis/core/symbols/SimpleMarkerSymbol";

import type { GeolocationFix } from "../hooks/useGeolocation";

// Vivid blue, distinct from every grade colour (green/amber/red/grey).
const DOT_COLOR: [number, number, number] = [26, 133, 255];
const ACCURACY_FILL: [number, number, number, number] = [26, 133, 255, 0.12];
const ACCURACY_STROKE: [number, number, number, number] = [26, 133, 255, 0.5];

export function buildUserLocationGraphics(fix: GeolocationFix): Graphic[] {
  const graphics: Graphic[] = [];

  // Accuracy circle first so the dot draws on top of it.
  if (fix.accuracy > 0) {
    graphics.push(
      new Graphic({
        geometry: new Circle({
          center: [fix.longitude, fix.latitude],
          radius: fix.accuracy,
          radiusUnit: "meters",
          // Geodesic required for plain [lon, lat] input in WGS84.
          geodesic: true,
        }),
        symbol: new SimpleFillSymbol({
          color: ACCURACY_FILL,
          outline: new SimpleLineSymbol({ color: ACCURACY_STROKE, width: 1 }),
        }),
      }),
    );
  }

  graphics.push(
    new Graphic({
      geometry: new Point({
        longitude: fix.longitude,
        latitude: fix.latitude,
      }),
      symbol: new SimpleMarkerSymbol({
        color: DOT_COLOR,
        size: 14,
        outline: { color: "#ffffff", width: 2.5 },
      }),
    }),
  );

  return graphics;
}
