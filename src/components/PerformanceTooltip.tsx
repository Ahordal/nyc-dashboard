// PerformanceTooltip.tsx
//
// Custom tooltip positioned relative to the active dot. "full" shows
// date + grade/score badges (plus "Closed by DOHMH" for closures);
// "compact" (mobile, short chart) drops to a small grade + score label.

import { useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { ChartPoint } from "../types/restaurant";
import InspectionBadges from "./InspectionBadges";
import {
  getGradeCategory,
  CATEGORY_COLORS,
  UNINSPECTED_GRADE,
  isClosedInspection,
} from "../utils/gradeCategory";

type PerformanceTooltipProps = {
  hoveredPoint: {
    cx: number;
    cy: number;
    payload: ChartPoint;
  } | null;
  formattedDate: string;
  variant?: "full" | "compact";
};

// Padding kept from the chart edges
const EDGE_PADDING = 8;

// Clearance from the dot's centre — covers radius, stroke, and hover
// glow, plus a gap, so the tooltip never sits on the dot.
const DOT_CLEARANCE = 20;

export default function PerformanceTooltip({
  hoveredPoint,
  formattedDate,
  variant = "full",
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

    // Prefers whichever side fits, else whichever has more room. The
    // near edge stays exactly DOT_CLEARANCE from the dot's centre — may
    // spill past the chart edge, never over the dot.
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

  if (variant === "compact") {
    const categoryColor =
      CATEGORY_COLORS[getGradeCategory(action ?? "", grade, score)];
    const isUninspected = grade === UNINSPECTED_GRADE;

    return (
      <div
        ref={tooltipRef}
        className="performance-tooltip performance-tooltip-compact"
        style={style}>
        <span
          className="performance-tooltip-compact-box"
          style={{ color: categoryColor }}>
          {isUninspected ? "—" : score ?? "—"}
        </span>
      </div>
    );
  }

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