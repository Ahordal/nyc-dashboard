// MapFeaturedControl.tsx
//
// Map-corner gold certificate: shows only today's featured restaurants
// and zooms to them; same 32px shell as the other map controls.

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCertificate } from "@fortawesome/free-solid-svg-icons";
import MapControlButton from "./MapControlButton";

type MapFeaturedControlProps = {
  active: boolean;
  // Nothing dealt yet: nothing to show.
  disabled: boolean;
  onToggle: () => void;
};

export default function MapFeaturedControl({ active, disabled, onToggle }: MapFeaturedControlProps) {
  const label = active ? "Show all restaurants" : "Show today's featured restaurants";

  return (
    <div className="map-featured-container">
      <MapControlButton
        onClick={onToggle}
        disabled={disabled}
        tooltip={disabled ? undefined : label}
        ariaLabel={label}
        className={`control-chip map-featured-button tooltip-left${active ? " active" : ""}`}>
        <FontAwesomeIcon icon={faCertificate} aria-hidden="true" />
      </MapControlButton>
    </div>
  );
}
