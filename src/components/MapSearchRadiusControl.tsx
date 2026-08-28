/// MapSearchRadiusControl.tsx
//
// Map-corner tool chip for the Search Radius feature. Controlled by
// useSearchRadiusTool and passed via props.
//
// The 32x32 icon button remains static, toggling its icon (crosshair/X)
// and behavior. When active, the hover tooltip transitions into a
// persistent label to the button's left, with the radius picker
// stacked beneath it.

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faLocationCrosshairs, faXmark } from "@fortawesome/free-solid-svg-icons";

import SearchRadiusPicker from "./SearchRadiusPicker";
import type { SearchRadiusMiles } from "../types/searchRadius";

type MapSearchRadiusControlProps = {
  isPlacingPoint: boolean;
  hasPoint: boolean;
  activeRadiusMiles: SearchRadiusMiles;
  onActivate: () => void;
  onCancelPlacement: () => void;
  onDismiss: () => void;
  onRadiusChange: (miles: SearchRadiusMiles) => void;
};

export default function MapSearchRadiusControl({
  isPlacingPoint,
  hasPoint,
  activeRadiusMiles,
  onActivate,
  onCancelPlacement,
  onDismiss,
  onRadiusChange,
}: MapSearchRadiusControlProps) {
  const isIdle = !isPlacingPoint && !hasPoint;

  function handleIconClick() {
    if (isPlacingPoint) {
      onCancelPlacement();
    } else if (hasPoint) {
      onDismiss();
    } else {
      onActivate();
    }
  }

  return (
    <div className="map-search-radius-container">
      <button
        type="button"
        onClick={handleIconClick}
        data-tooltip={isIdle ? "Search Radius" : undefined}
        aria-label={isIdle ? "Search Radius" : "Close search radius"}
        className={`map-search-radius-button ${isIdle ? "tooltip-left" : "active"}`}>
        <FontAwesomeIcon icon={isIdle ? faLocationCrosshairs : faXmark} />
      </button>

      {!isIdle && (
        <div className="map-search-radius-panel">
          <div className="map-search-radius-header-label">Search Radius</div>

          {hasPoint && (
            <SearchRadiusPicker
              value={activeRadiusMiles}
              onChange={onRadiusChange}
            />
          )}
        </div>
      )}
    </div>
  );
}
