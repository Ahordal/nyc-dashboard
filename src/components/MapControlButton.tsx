// MapControlButton.tsx
//
// Shared shell for the map-corner buttons (basemap toggle, compass,
// locate-me, search radius, zoom/scale). Each caller keeps its own click
// handling and className composition (tooltip-side, active, muted, etc.
// differ enough between them that unifying that logic isn't worth it) -
// only the repeated button element and its attribute wiring live here.
// The surrounding container divs (some hold extra panels or multiple
// buttons) stay with each caller too, for the same reason.

import type { ReactNode, MouseEventHandler } from "react";

type MapControlButtonProps = {
  onClick: MouseEventHandler<HTMLButtonElement>;
  disabled?: boolean;
  // Omitted (undefined) means no data-tooltip attribute at all, matching
  // how each caller already suppresses the hover tooltip in some states.
  tooltip?: string;
  ariaLabel: string;
  className: string;
  children: ReactNode;
};

export default function MapControlButton({
  onClick,
  disabled = false,
  tooltip,
  ariaLabel,
  className,
  children,
}: MapControlButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-tooltip={tooltip}
      aria-label={ariaLabel}
      className={className}
    >
      {children}
    </button>
  );
}
