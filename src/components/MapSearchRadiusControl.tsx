// MapSearchRadiusControl.tsx
//
// Map-corner tool chip for the Search Radius feature, controlled by
// useSearchRadiusTool via props. The 32x32 icon button stays put,
// swapping its icon (bullseye/X) and behaviour; when active, the hover
// tooltip becomes a persistent label with the radius picker stacked beneath.

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBullseye, faXmark } from "@fortawesome/free-solid-svg-icons";

import MapControlButton from "./MapControlButton";
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
      <MapControlButton
        onClick={handleIconClick}
        tooltip={isIdle ? "Search Radius" : undefined}
        ariaLabel={isIdle ? "Search Radius" : "Close search radius"}
        className={`map-search-radius-button ${isIdle ? "tooltip-left" : "active"}`}>
        <FontAwesomeIcon icon={isIdle ? faBullseye : faXmark} />
      </MapControlButton>

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
