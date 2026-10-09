// featuredRingGraphics.ts
//
// Gold rings around today's featured restaurants. Hollow with a gap, so
// they read by shape as well as colour: never confused with C's orange dots.

import Graphic from "@arcgis/core/Graphic";
import SimpleMarkerSymbol from "@arcgis/core/symbols/SimpleMarkerSymbol";

// Matches --award-gold in base.css.
const AWARD_GOLD = "#d4af37";
// Clears the largest A-band dot (4px) with a visible gap.
const RING_SIZE = 16;

const NO_FILL: [number, number, number, number] = [0, 0, 0, 0];

// Dark edge under the gold keeps the ring crisp on the basemap and over neighbours.
const edgeSymbol = new SimpleMarkerSymbol({
  color: NO_FILL,
  size: RING_SIZE,
  outline: { color: [26, 26, 26, 0.9], width: 4 },
});

const goldSymbol = new SimpleMarkerSymbol({
  color: NO_FILL,
  size: RING_SIZE,
  outline: { color: AWARD_GOLD, width: 2 },
});

// Rings copy each feature's attributes, so a hit on one resolves to its restaurant.
export function buildFeaturedRingGraphics(features: Graphic[]): Graphic[] {
  return features.flatMap(({ geometry, attributes }) =>
    geometry
      ? [
          new Graphic({ geometry, attributes, symbol: edgeSymbol }),
          new Graphic({ geometry, attributes, symbol: goldSymbol }),
        ]
      : [],
  );
}
