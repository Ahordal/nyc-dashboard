// distance.test.ts
//
// Unit tests for haversineDistanceMiles: identity, symmetry, exact
// along-meridian distance, and the just-inside/just-outside behaviour
// at a radius cutoff.

import { describe, it, expect } from "vitest";
import { haversineDistanceMiles } from "./distance";

// Earth radius in miles, matching distance.ts. Moving due north (same
// longitude) makes the haversine formula reduce exactly to
// EARTH_RADIUS_MILES * deltaLatitudeRadians, so this gives an exact
// expected distance to test against rather than a real-world landmark
// pair whose true distance would just be another approximation.
const EARTH_RADIUS_MILES = 3958.8;

function pointNorthOf(
  origin: { latitude: number; longitude: number },
  miles: number,
) {
  const deltaLatitudeDegrees = (miles / EARTH_RADIUS_MILES) * (180 / Math.PI);
  return {
    latitude: origin.latitude + deltaLatitudeDegrees,
    longitude: origin.longitude,
  };
}

const MANHATTAN = { latitude: 40.7580, longitude: -73.9855 };

describe("haversineDistanceMiles", () => {
  it("returns 0 for a point and itself", () => {
    expect(haversineDistanceMiles(MANHATTAN, MANHATTAN)).toBe(0);
  });

  it("is symmetric", () => {
    const other = pointNorthOf(MANHATTAN, 0.5);
    expect(haversineDistanceMiles(MANHATTAN, other)).toBeCloseTo(
      haversineDistanceMiles(other, MANHATTAN),
      10,
    );
  });

  it("matches the exact along-meridian distance", () => {
    const oneMileNorth = pointNorthOf(MANHATTAN, 1);
    expect(haversineDistanceMiles(MANHATTAN, oneMileNorth)).toBeCloseTo(1, 6);
  });

  it("places a point just inside a 0.25 mi radius below the cutoff", () => {
    const justInside = pointNorthOf(MANHATTAN, 0.24);
    expect(haversineDistanceMiles(MANHATTAN, justInside)).toBeLessThan(0.25);
  });

  it("places a point just outside a 0.25 mi radius above the cutoff", () => {
    const justOutside = pointNorthOf(MANHATTAN, 0.26);
    expect(haversineDistanceMiles(MANHATTAN, justOutside)).toBeGreaterThan(0.25);
  });
});
