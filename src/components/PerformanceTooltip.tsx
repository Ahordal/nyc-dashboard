// PerformanceTooltip.tsx
//
// Custom chart tooltip positioned relative to the active inspection dot.
//
// Displays the inspection date and grade/score badges. Closure inspections
// also display the same "Closed by DOHMH" status tag used in Restaurant
// Details.

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

// Clearance from the center of the dot (includes dot radius + gap)
const DOT_CLEARANCE = 14;

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

    // Check if there is enough vertical space above the dot
    const spaceAbove = cy - DOT_CLEARANCE;
    const fitsAbove = spaceAbove >= tooltipHeight + EDGE_PADDING;

    let targetTop: number;

    if (fitsAbove) {
      // Position above the dot
      targetTop = cy - DOT_CLEARANCE - tooltipHeight;
    } else {
      // Position below the dot with guaranteed clearance
      targetTop = cy + DOT_CLEARANCE;

      // If it would overflow the bottom edge, clamp it within container
      if (targetTop + tooltipHeight > containerHeight - EDGE_PADDING) {
        targetTop = containerHeight - tooltipHeight - EDGE_PADDING;
      }
    }

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