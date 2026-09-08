// userLocationGraphics.test.ts
//
// Unit tests for buildUserLocationGraphics: a dot at the fix, an accuracy
// circle sized to the reported metres and drawn under the dot, and no
// circle when accuracy is missing.

import { describe, it, expect } from "vitest";
import { buildUserLocationGraphics } from "./userLocationGraphics";
import type { GeolocationFix } from "../hooks/useGeolocation";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyGraphic = any;

const FIX: GeolocationFix = {
  latitude: 40.758,
  longitude: -73.9855,
  accuracy: 40,
};

describe("buildUserLocationGraphics", () => {
  it("returns the accuracy circle then the dot, in that draw order", () => {
    const graphics = buildUserLocationGraphics(FIX) as AnyGraphic[];

    expect(graphics.map((g) => g.symbol.type)).toEqual([
      "simple-fill",
      "simple-marker",
    ]);
  });

  it("places the dot at the fix and sizes the circle to the accuracy in metres", () => {
    const [circle, dot] = buildUserLocationGraphics(FIX) as AnyGraphic[];

    expect(dot.geometry.longitude).toBeCloseTo(FIX.longitude, 6);
    expect(dot.geometry.latitude).toBeCloseTo(FIX.latitude, 6);
    expect(dot.symbol.size).toBeGreaterThan(7); // clearly larger than a score dot

    expect(circle.geometry.radius).toBe(FIX.accuracy);
  });

  it("omits the accuracy circle when accuracy is zero or unknown", () => {
    const graphics = buildUserLocationGraphics({
      ...FIX,
      accuracy: 0,
    }) as AnyGraphic[];

    expect(graphics).toHaveLength(1);
    expect(graphics[0].symbol.type).toBe("simple-marker");
  });
});
