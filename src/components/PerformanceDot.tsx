// PerformanceDot.tsx
//
// Custom interactive point for the Recharts performance chart. The
// invisible hit circle stays a fixed size while the visible dot grows on
// hover, so the pointer target never moves and hover doesn't jump
// between nearby points as the SVG rerenders. Keyboard interaction is
// handled by PerformanceChart's stable HTML wrapper.

import type {
  MouseEvent,
  PointerEvent,
} from "react";

import {
  getGradeCategory,
  CATEGORY_COLORS,
} from "../utils/gradeCategory";

import type { ChartPoint } from "../types/restaurant";

type TooltipPoint = {
  cx: number;
  cy: number;
  payload: ChartPoint;
};

type PerformanceDotProps = {
  cx?: number;
  cy?: number;
  payload?: ChartPoint;
  hoveredInspectionId?: string | null;
  isActive?: boolean;

  onPointerPointChange?: (
    point: TooltipPoint | null,
  ) => void;

  onSelectInspection?: (
    inspectionId: string,
  ) => void;

  registerDotRef?: (
    id: string,
    element: SVGCircleElement | null,
  ) => void;
};

const HIT_TARGET_RADIUS = 8;
const DEFAULT_RADIUS = 4;
const ACTIVE_RADIUS = 7;

const DEFAULT_STROKE_WIDTH = 2;
const ACTIVE_STROKE_WIDTH = 3;

export default function PerformanceDot({
  cx,
  cy,
  payload,
  hoveredInspectionId,
  isActive = false,
  onPointerPointChange,
  onSelectInspection,
  registerDotRef,
}: PerformanceDotProps) {
  // Recharts can briefly render a point before calculating its coordinates.
  if (
    cx === undefined ||
    cy === undefined ||
    !payload
  ) {
    return null;
  }

  const category = getGradeCategory(
    payload.action ?? "",
    payload.grade,
    payload.score,
  );

  const dotColor =
    CATEGORY_COLORS[category];

  const isHighlighted =
    hoveredInspectionId === payload.id ||
    isActive;

  const radius = isHighlighted
    ? ACTIVE_RADIUS
    : DEFAULT_RADIUS;

  const strokeWidth = isHighlighted
    ? ACTIVE_STROKE_WIDTH
    : DEFAULT_STROKE_WIDTH;

  const showPointerPoint = () => {
    onPointerPointChange?.({
      cx,
      cy,
      payload,
    });
  };

  const handlePointerDown = (
    event: PointerEvent<SVGGElement>,
  ) => {
    // Prevent Recharts' parent SVG layers from treating this as a generic
    // pointer interaction.
    event.stopPropagation();
  };

  const handleMouseDown = (
    event: MouseEvent<SVGGElement>,
  ) => {
    // Cancel the browser's default SVG focus behaviour. Without this, Chrome
    // can focus Recharts' line layer and draw an outline around its complete
    // bounding box after a dot is clicked.
    //
    // Preventing mouse-down does not prevent the following click event.
    event.preventDefault();
    event.stopPropagation();
  };

  const handleClick = (
    event: MouseEvent<SVGGElement>,
  ) => {
    // Prevent Recharts from also processing the dot click as a line or chart
    // interaction.
    event.stopPropagation();

    // Clear the temporary pointer tooltip once the report is opened.
    onPointerPointChange?.(null);

    onSelectInspection?.(
      payload.id,
    );
  };

  return (
    <g
      data-performance-dot="true"
      aria-hidden="true"
      focusable="false"
      tabIndex={-1}
      style={{
        cursor: onSelectInspection
          ? "pointer"
          : "default",

        // This element is intentionally excluded from keyboard navigation.
        // PerformanceChart's HTML wrapper provides the accessible focus target.
        outline: "none",
      }}
      onPointerEnter={
        showPointerPoint
      }
      onPointerLeave={() => {
        onPointerPointChange?.(null);
      }}
      onPointerDown={
        handlePointerDown
      }
      onMouseDown={
        handleMouseDown
      }
      onClick={
        handleClick
      }
    >
      {/* Stable pointer target: its radius never changes during hover. */}
      <circle
        cx={cx}
        cy={cy}
        r={HIT_TARGET_RADIUS}
        fill="transparent"
        stroke="transparent"
        pointerEvents="all"
        focusable="false"
      />

      {/* Visual dot: the stable circle above owns all pointer interaction. */}
      <circle
        ref={(element) => {
          registerDotRef?.(
            payload.id,
            element,
          );
        }}
        cx={cx}
        cy={cy}
        r={radius}
        fill={dotColor}
        stroke="#ffffff"
        strokeWidth={
          strokeWidth
        }
        vectorEffect="non-scaling-stroke"
        className={
          isHighlighted
            ? "chart-dot-hovered"
            : "chart-dot"
        }
        pointerEvents="none"
        focusable="false"
        style={{
          transformOrigin: `${cx}px ${cy}px`,

          filter: isHighlighted
            ? `drop-shadow(0 0 8px ${dotColor})`
            : "none",

          transition: [
            "r 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
            "stroke-width 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
            "filter 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
          ].join(", "),
        }}
      />
    </g>
  );
}