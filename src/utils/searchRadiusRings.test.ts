// searchRadiusRings.test.ts
//
// Unit tests for buildSearchRadiusGraphics: one ring and label per
// radius option plus a centre pin, largest-ring-first draw order,
// active-ring styling, and label placement north of the centre.

import { describe, it, expect } from "vitest";
import { buildSearchRadiusGraphics } from "./searchRadiusRings";
import {
  SEARCH_RADIUS_OPTIONS_MILES,
  SEARCH_RADIUS_LABELS,
} from "../types/searchRadius";
import type { SearchRadiusMiles } from "../types/searchRadius";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyGraphic = any;

const CENTER = { longitude: -73.9855, latitude: 40.758 };

function bySymbolType(graphics: AnyGraphic[], type: string): AnyGraphic[] {
  return graphics.filter((g) => g.symbol?.type === type);
}

describe("buildSearchRadiusGraphics", () => {
  it("produces one ring + one label per radius option, plus a centre pin", () => {
    const graphics = buildSearchRadiusGraphics(CENTER, 0.25);

    const rings = bySymbolType(graphics, "simple-fill");
    const labels = bySymbolType(graphics, "text");
    const pins = bySymbolType(graphics, "simple-marker");

    expect(rings).toHaveLength(SEARCH_RADIUS_OPTIONS_MILES.length);
    expect(labels).toHaveLength(SEARCH_RADIUS_OPTIONS_MILES.length);
    expect(pins).toHaveLength(1);
    expect(graphics).toHaveLength(SEARCH_RADIUS_OPTIONS_MILES.length * 2 + 1);
  });

  it("draws ring fills largest-radius-first so smaller borders stay on top", () => {
    const rings = bySymbolType(
      buildSearchRadiusGraphics(CENTER, 0.25),
      "simple-fill",
    );
    // Circle geometry exposes its generating radius; first drawn = largest.
    const radii = rings.map((r) => r.geometry.radius);
    expect(radii).toEqual([...radii].sort((a, b) => b - a));
    expect(radii[0]).toBe(Math.max(...SEARCH_RADIUS_OPTIONS_MILES));
  });

  it("gives only the active ring the heavier 2px outline", () => {
    const active: SearchRadiusMiles = 0.5;
    const rings = bySymbolType(
      buildSearchRadiusGraphics(CENTER, active),
      "simple-fill",
    );

    for (const ring of rings) {
      const expectedWidth = ring.geometry.radius === active ? 2 : 1;
      expect(ring.symbol.outline.width).toBe(expectedWidth);
    }
  });

  it("labels each ring with its distance string and bolds the active one", () => {
    const active: SearchRadiusMiles = 1;
    const labels = bySymbolType(
      buildSearchRadiusGraphics(CENTER, active),
      "text",
    );

    const texts = labels.map((l) => l.symbol.text).sort();
    expect(texts).toEqual(
      SEARCH_RADIUS_OPTIONS_MILES.map((m) => SEARCH_RADIUS_LABELS[m]).sort(),
    );

    const activeLabel = labels.find(
      (l) => l.symbol.text === SEARCH_RADIUS_LABELS[active],
    );
    const inactiveLabel = labels.find(
      (l) => l.symbol.text !== SEARCH_RADIUS_LABELS[active],
    );
    expect(activeLabel.symbol.font.weight).toBe("bold");
    expect(inactiveLabel.symbol.font.weight).toBe("normal");
  });

  it("places the centre pin at the given point and labels north of it", () => {
    const graphics = buildSearchRadiusGraphics(CENTER, 0.25);
    const pin = bySymbolType(graphics, "simple-marker")[0];

    expect(pin.geometry.longitude).toBeCloseTo(CENTER.longitude, 6);
    expect(pin.geometry.latitude).toBeCloseTo(CENTER.latitude, 6);

    for (const label of bySymbolType(graphics, "text")) {
      expect(label.geometry.latitude).toBeGreaterThan(CENTER.latitude);
      expect(label.geometry.longitude).toBeCloseTo(CENTER.longitude, 6);
    }
  });
});
