// searchRadiusRings.ts
//
// Pure graphics builder for the Search Radius tool. Given a center point 
// and radius, returns the ring, label, and pin graphics. Decoupled from MapView.

import Graphic from "@arcgis/core/Graphic";
import Circle from "@arcgis/core/geometry/Circle";
import Point from "@arcgis/core/geometry/Point";
import SimpleFillSymbol from "@arcgis/core/symbols/SimpleFillSymbol";
import SimpleLineSymbol from "@arcgis/core/symbols/SimpleLineSymbol";
import SimpleMarkerSymbol from "@arcgis/core/symbols/SimpleMarkerSymbol";
import TextSymbol from "@arcgis/core/symbols/TextSymbol";

import {
  SEARCH_RADIUS_OPTIONS_MILES,
  SEARCH_RADIUS_LABELS,
} from "../types/searchRadius";
import type { SearchRadiusPoint, SearchRadiusMiles } from "../types/searchRadius";

// Earth radius in miles, used for calculating northern label offsets.
const EARTH_RADIUS_MILES = 3958.8;

// Inlined color constants since ArcGIS symbols cannot reference CSS vars.
const ACTIVE_FILL_COLOR: [number, number, number, number] = [31, 32, 32, 0.42];
const ACTIVE_STROKE_COLOR: [number, number, number, number] = [154, 156, 152, 0.78];
const INACTIVE_FILL_COLOR: [number, number, number, number] = [31, 32, 32, 0.20];
const INACTIVE_STROKE_COLOR: [number, number, number, number] = [154, 156, 152, 0.38];

function northOffsetDegrees(miles: number): number {
  return (miles / EARTH_RADIUS_MILES) * (180 / Math.PI);
}

// Outward offset to keep label halos from visually clipping the ring stroke.
const LABEL_OUTWARD_OFFSET_MILES = 0.04;

export function buildSearchRadiusGraphics(
  point: SearchRadiusPoint,
  activeMiles: SearchRadiusMiles,
): Graphic[] {
  const graphics: Graphic[] = [];

  // Draw largest rings first so smaller ring borders remain crisp on top.
  const ringsLargestFirst = [...SEARCH_RADIUS_OPTIONS_MILES].reverse();

  for (const miles of ringsLargestFirst) {
    const isActive = miles === activeMiles;

    const ringGeometry = new Circle({
      center: [point.longitude, point.latitude],
      radius: miles,
      radiusUnit: "miles",
      // Geodesic required for plain [lon, lat] input arrays in WGS84.
      geodesic: true,
    });

    graphics.push(
      new Graphic({
        geometry: ringGeometry,
        symbol: new SimpleFillSymbol({
          color: isActive ? ACTIVE_FILL_COLOR : INACTIVE_FILL_COLOR,
          outline: new SimpleLineSymbol({
            color: isActive ? ACTIVE_STROKE_COLOR : INACTIVE_STROKE_COLOR,
            width: isActive ? 2 : 1,
          }),
        }),
      }),
    );
  }

  // Draw labels after rings to prevent fills from obscuring text.
  for (const miles of SEARCH_RADIUS_OPTIONS_MILES) {
    const isActive = miles === activeMiles;

    graphics.push(
      new Graphic({
        geometry: new Point({
          longitude: point.longitude,
          latitude:
            point.latitude +
            northOffsetDegrees(miles + LABEL_OUTWARD_OFFSET_MILES),
        }),
        symbol: new TextSymbol({
          text: SEARCH_RADIUS_LABELS[miles],
          color: isActive ? "#ffffff" : "rgba(255, 255, 255, 0.55)",
          haloColor: "#1a1a1a",
          haloSize: 1,
          font: { size: 9, family: "sans-serif", weight: isActive ? "bold" : "normal" },
        }),
      }),
    );
  }

  // Add the center point pin graphic.
  graphics.push(
    new Graphic({
      geometry: new Point({
        longitude: point.longitude,
        latitude: point.latitude,
      }),
      symbol: new SimpleMarkerSymbol({
        color: "#ffffff",
        size: 8,
        outline: { color: "#1a1a1a", width: 2 },
      }),
    }),
  );

  return graphics;
}