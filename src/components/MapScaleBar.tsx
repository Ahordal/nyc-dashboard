// MapScaleBar.tsx
//
// Graphical imperial ground-distance scale bar for MapView, replacing
// the deprecated esri/widgets/ScaleBar. Converts the view's Web Mercator
// resolution to true ground distance with a cos(latitude) correction,
// then snaps to a round foot/mile value.

import { useEffect, useState } from "react";
import type MapView from "@arcgis/core/views/MapView";
import * as reactiveUtils from "@arcgis/core/core/reactiveUtils";

const FEET_PER_METER = 3.28084;
const FEET_PER_MILE = 5280;
const MAX_BAR_WIDTH_PX = 100;

// Rounds down to a "nice" 1/2/5 * 10^n value, the standard scale-bar convention.
function niceRoundNumber(value: number): number {
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  const fraction = value / magnitude;
  const niceFraction = fraction >= 5 ? 5 : fraction >= 2 ? 2 : 1;
  return niceFraction * magnitude;
}

function pickScale(maxFeet: number): { feet: number; label: string } {
  if (maxFeet >= FEET_PER_MILE * 0.9) {
    const miles = niceRoundNumber(maxFeet / FEET_PER_MILE);
    return { feet: miles * FEET_PER_MILE, label: `${miles} mi` };
  }
  const feet = niceRoundNumber(maxFeet);
  return { feet, label: `${feet.toLocaleString()} ft` };
}

type MapScaleBarProps = {
  view: MapView | null;
};

export default function MapScaleBar({ view }: MapScaleBarProps) {
  const [bar, setBar] = useState<{ widthPx: number; label: string } | null>(
    null,
  );

  useEffect(() => {
    if (!view) return;

    const update = () => {
      const latitude = view.center?.latitude;
      if (latitude == null) return;

      // view.resolution is in Web Mercator metres/pixel, which overstates
      // ground distance away from the equator; cos(latitude) corrects it.
      const metersPerPixel =
        view.resolution * Math.cos((latitude * Math.PI) / 180);
      const feetPerPixel = metersPerPixel * FEET_PER_METER;
      const maxFeet = feetPerPixel * MAX_BAR_WIDTH_PX;
      if (!Number.isFinite(maxFeet) || maxFeet <= 0) return;

      const { feet, label } = pickScale(maxFeet);
      setBar({ widthPx: feet / feetPerPixel, label });
    };

    update();

    const resolutionHandle = reactiveUtils.watch(
      () => view.resolution,
      update,
    );
    const centerHandle = reactiveUtils.watch(() => view.center, update);

    return () => {
      resolutionHandle.remove();
      centerHandle.remove();
    };
  }, [view]);

  if (!bar) return null;

  return (
    <div className="map-scale-bar-container">
      <div className="map-scale-bar-chip">
        <div
          className="map-scale-bar-graphic"
          style={{ width: `${bar.widthPx}px` }}
        />
        <span className="map-scale-bar-text">{bar.label}</span>
      </div>
    </div>
  );
}
