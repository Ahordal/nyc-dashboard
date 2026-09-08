// distance.test.ts
//
// Unit tests for haversineDistanceMiles (identity, symmetry, exact
// along-meridian distance, just-inside/just-outside a radius cutoff) and
// the approximate-mileage formatters.

import { describe, it, expect } from "vitest";
import {
  haversineDistanceMiles,
  formatApproxMiles,
  formatApproxMilesSpoken,
} from "./distance";

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

describe("formatApproxMiles", () => {
  it("shows tenths below ~10 mi", () => {
    expect(formatApproxMiles(0.42)).toBe("~0.4 mi");
    expect(formatApproxMiles(2.35)).toBe("~2.4 mi");
    expect(formatApproxMiles(9.94)).toBe("~9.9 mi");
  });

  it("shows whole miles at ~10 mi and above", () => {
    expect(formatApproxMiles(9.95)).toBe("~10 mi");
    expect(formatApproxMiles(31.2)).toBe("~31 mi");
  });

  it("floors at ~0.1 mi so a near-coincident point never reads 0.0", () => {
    expect(formatApproxMiles(0)).toBe("~0.1 mi");
    expect(formatApproxMiles(0.03)).toBe("~0.1 mi");
  });
});

describe("formatApproxMilesSpoken", () => {
  it("spells the unit and drops the tilde for screen readers", () => {
    expect(formatApproxMilesSpoken(0.42)).toBe("about 0.4 miles");
    expect(formatApproxMilesSpoken(31.2)).toBe("about 31 miles");
  });
});
