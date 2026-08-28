// PerformanceTooltip.tsx
//
// Custom chart tooltip positioned relative to the active inspection dot.
// Shows the inspection date and grade/score badges; closure inspections
// also show the "Closed by DOHMH" status tag used in Restaurant Details.

import { useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { ChartPoint } from "../types/restaurant";
import InspectionBadges from "./InspectionBadges";
import { isClosedInspection } from "../utils/gradeCategory";

type PerformanceTooltipProps = {
  hoveredPoint: {
    cx: number;
    cy: number;
    payload: ChartPoint;
  } | null;
  formattedDate: string;
};

// Padding kept from the chart edges
const EDGE_PADDING = 8;

// Clearance from the center of the dot. Covers the active dot's radius,
// stroke, and hover glow (drop-shadow), plus a small gap, so the tooltip
// never sits on top of the dot even when the highlighted/active style applies.
const DOT_CLEARANCE = 20;

export default function PerformanceTooltip({
  hoveredPoint,
  formattedDate,
}: PerformanceTooltipProps) {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>({
    visibility: "hidden",
  });

  useLayoutEffect(() => {
    if (!hoveredPoint || !tooltipRef.current) {
      return;
    }

    const tooltip = tooltipRef.current;
    const container = tooltip.offsetParent as HTMLElement | null;

    if (!container) {
      return;
    }

    const { cx, cy } = hoveredPoint;
    const tooltipWidth = tooltip.offsetWidth;
    const tooltipHeight = tooltip.offsetHeight;
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;

    // Space available on each side of the dot's clearance zone.
    const spaceAbove = cy - DOT_CLEARANCE - EDGE_PADDING;
    const spaceBelow = containerHeight - EDGE_PADDING - (cy + DOT_CLEARANCE);

    // Prefer whichever side actually fits the tooltip; if neither does,
    // pick whichever side has more room. Either way, the tooltip's near
    // edge is always pinned exactly DOT_CLEARANCE away from the dot's
    // centre and is never pulled back across that line, so it may spill
    // past the chart's own edge in a tight corner, but it can never cover
    // the dot itself.
    const placeAbove =
      spaceAbove >= tooltipHeight || spaceAbove >= spaceBelow;

    const targetTop = placeAbove
      ? cy - DOT_CLEARANCE - tooltipHeight
      : cy + DOT_CLEARANCE;

    // Clamp horizontally so it stays within chart container edges
    const halfWidth = tooltipWidth / 2;
    let targetLeft = cx - halfWidth;

    if (targetLeft < EDGE_PADDING) {
      targetLeft = EDGE_PADDING;
    } else if (targetLeft + tooltipWidth > containerWidth - EDGE_PADDING) {
      targetLeft = containerWidth - tooltipWidth - EDGE_PADDING;
    }

    setStyle({
      position: "absolute",
      left: `${targetLeft}px`,
      top: `${targetTop}px`,
      transform: "none",
      marginTop: 0,
      visibility: "visible",
      pointerEvents: "none",
    });
  }, [hoveredPoint]);

  if (!hoveredPoint) {
    return null;
  }

  const { score, grade, action } = hoveredPoint.payload;
  const isClosure = isClosedInspection(action ?? "");

  return (
    <div ref={tooltipRef} className="performance-tooltip" style={style}>
      <div
        className="performance-tooltip-date"
        style={{
          textAlign: "center",
          marginBottom: "8px",
        }}>
        {formattedDate}
      </div>

      <InspectionBadges
        score={score}
        grade={grade}
        action={action}
        style={{
          justifyContent: "center",
        }}
      />

      {isClosure && (
        <div
          className="performance-tooltip-status"
          style={{
            display: "flex",
            justifyContent: "center",
            marginTop: "8px",
          }}>
          <span className="violation-tag status-flag status-closed">
            Closed by DOHMH
          </span>
        </div>
      )}
    </div>
  );
}