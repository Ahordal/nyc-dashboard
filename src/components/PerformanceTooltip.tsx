// PerformanceTooltip.tsx
//
// Custom chart tooltip positioned relative to the active inspection dot.
//
// Displays the inspection date and grade/score badges. Closure inspections
// also display the same "Closed by DOHMH" status tag used in Restaurant
// Details.

import {
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import type {
  CSSProperties,
} from "react";

import type {
  ChartPoint,
} from "../types/restaurant";

import InspectionBadges from "./InspectionBadges";

import {
  isClosedInspection,
} from "../utils/gradeCategory";

type PerformanceTooltipProps = {
  hoveredPoint: {
    cx: number;
    cy: number;
    payload: ChartPoint;
  } | null;

  formattedDate: string;
};

// Minimum gap between the tooltip and the chart container edge.
const EDGE_PADDING = 8;

// Space maintained between the tooltip and its associated chart dot.
const DOT_CLEARANCE = 16;

export default function PerformanceTooltip({
  hoveredPoint,
  formattedDate,
}: PerformanceTooltipProps) {
  const tooltipRef =
    useRef<HTMLDivElement>(null);

  const [
    style,
    setStyle,
  ] = useState<CSSProperties>({});

  // Runs before paint so the tooltip can be measured and positioned without
  // briefly appearing in the wrong location.
  useLayoutEffect(() => {
    if (
      !hoveredPoint ||
      !tooltipRef.current
    ) {
      return;
    }

    const tooltip =
      tooltipRef.current;

    const container =
      tooltip.offsetParent as HTMLElement | null;

    if (!container) {
      return;
    }

    const {
      cx,
      cy,
    } = hoveredPoint;

    const tooltipWidth =
      tooltip.offsetWidth;

    const tooltipHeight =
      tooltip.offsetHeight;

    const containerWidth =
      container.clientWidth;

    const containerHeight =
      container.clientHeight;

    const minClearance =
      DOT_CLEARANCE +
      EDGE_PADDING;

    // Prefer placing the tooltip above the dot. Flip it below when there is
    // not enough room for the complete rendered tooltip.
    const fitsAbove =
      cy -
        tooltipHeight -
        minClearance >=
      0;

    const placeBelow =
      !fitsAbove;

    // Clamp the centred tooltip horizontally so it remains inside the chart.
    const halfWidth =
      tooltipWidth / 2;

    const clampedX = Math.min(
      Math.max(
        cx,
        halfWidth +
          EDGE_PADDING,
      ),
      Math.max(
        containerWidth -
          halfWidth -
          EDGE_PADDING,
        halfWidth +
          EDGE_PADDING,
      ),
    );

    // When placed below the dot, prevent the bottom edge from extending past
    // the chart container.
    const clampedY =
      placeBelow
        ? Math.min(
            cy,
            containerHeight -
              tooltipHeight -
              minClearance,
          )
        : cy;

    setStyle({
      left: clampedX,
      top: clampedY,

      transform: placeBelow
        ? "translate(-50%, 0)"
        : "translate(-50%, -100%)",

      marginTop: placeBelow
        ? DOT_CLEARANCE
        : -DOT_CLEARANCE,
    });
  }, [hoveredPoint]);

  if (!hoveredPoint) {
    return null;
  }

  const {
    score,
    grade,
    action,
  } = hoveredPoint.payload;

  // Determine the status from this historical inspection rather than the
  // restaurant's current status.
  const isClosure =
    isClosedInspection(
      action ?? "",
    );

  return (
    <div
      ref={tooltipRef}
      className="performance-tooltip"
      style={style}
    >
      <div
        className="performance-tooltip-date"
        style={{
          textAlign: "center",
          marginBottom: "8px",
        }}
      >
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
          }}
        >
          <span className="violation-tag status-flag status-closed">
            Closed by DOHMH
          </span>
        </div>
      )}
    </div>
  );
}