// useTooltipPriority.ts
//
// Tracks the tooltip's active point (priority below) and each dot's
// rendered position. Split out from PerformanceChart for testing.

import { useCallback, useEffect, useRef, useState } from "react";

import type { ChartPoint } from "../types/restaurant";

export type TooltipPoint = {
  cx: number;
  cy: number;
  payload: ChartPoint;
};

type ChartSize = {
  width: number;
  height: number;
};

type UseTooltipPriorityParams = {
  chartData: ChartPoint[];
  selectedChartPoint: ChartPoint | null;
  historyPreviewChartPoint: ChartPoint | null;
  // Driven by keyboard-nav; this hook only reads it.
  activeKeyboardPoint: ChartPoint | null;
  isKeyboardModeActive: boolean;
  chartSize: ChartSize;
  xMin: number;
  xMax: number;
  yMax: number;
};

function tooltipPointsMatch(
  firstPoint: TooltipPoint | null,
  secondPoint: TooltipPoint | null,
): boolean {
  if (firstPoint === null || secondPoint === null) {
    return firstPoint === secondPoint;
  }

  return (
    firstPoint.payload.id === secondPoint.payload.id &&
    firstPoint.cx === secondPoint.cx &&
    firstPoint.cy === secondPoint.cy
  );
}

// Tooltip priority:
// 1. Dot directly under the pointer.
// 2. Hovered or keyboard-focused history row.
// 3. Active keyboard-nav point.
// 4. Report pinned by Dashboard.
export function useTooltipPriority({
  chartData,
  selectedChartPoint,
  historyPreviewChartPoint,
  activeKeyboardPoint,
  isKeyboardModeActive,
  chartSize,
  xMin,
  xMax,
  yMax,
}: UseTooltipPriorityParams) {
  const dotRefs = useRef<Map<string, SVGCircleElement>>(new Map());

  // Direct hover over a chart dot.
  const [pointerPoint, setPointerPoint] = useState<TooltipPoint | null>(null);

  // Hover or keyboard focus from the RestaurantDetails history list.
  const [historyPreviewPoint, setHistoryPreviewPoint] =
    useState<TooltipPoint | null>(null);

  // Point selected via chart keyboard nav.
  const [keyboardPoint, setKeyboardPoint] = useState<TooltipPoint | null>(
    null,
  );

  // Report selection while Dashboard keeps it pinned.
  const [selectedPoint, setSelectedPoint] = useState<TooltipPoint | null>(
    null,
  );

  const activeTooltipPoint =
    pointerPoint ??
    historyPreviewPoint ??
    (isKeyboardModeActive ? keyboardPoint : selectedPoint);

  // Resets tooltip state when chart data changes.
  useEffect(() => {
    setPointerPoint(null);
    setHistoryPreviewPoint(null);
    setKeyboardPoint(null);
    setSelectedPoint(null);
  }, [chartData]);

  // Keyboard navigation takes priority over a lingering pointer hover.
  useEffect(() => {
    if (isKeyboardModeActive) {
      setPointerPoint(null);
    }
  }, [isKeyboardModeActive]);

  const registerDotRef = useCallback(
    (id: string, element: SVGCircleElement | null) => {
      if (element) {
        dotRefs.current.set(id, element);
      } else {
        dotRefs.current.delete(id);
      }
    },
    [],
  );

  const getRenderedTooltipPoint = useCallback(
    (point: ChartPoint | null): TooltipPoint | null => {
      if (!point) {
        return null;
      }

      const dot = dotRefs.current.get(point.id);

      if (!dot) {
        return null;
      }

      const cx = Number(dot.getAttribute("cx"));
      const cy = Number(dot.getAttribute("cy"));

      if (!Number.isFinite(cx) || !Number.isFinite(cy)) {
        return null;
      }

      return { cx, cy, payload: point };
    },
    [],
  );

  // Pinned report point.
  useEffect(() => {
    const syncPoint = () => {
      const nextSelectedPoint = getRenderedTooltipPoint(selectedChartPoint);

      setSelectedPoint((currentPoint) =>
        tooltipPointsMatch(currentPoint, nextSelectedPoint)
          ? currentPoint
          : nextSelectedPoint,
      );
    };

    // Sync now, then again once Recharts' layout paint settles.
    syncPoint();
    const timeoutId = setTimeout(syncPoint, 100);

    return () => clearTimeout(timeoutId);
  }, [
    selectedChartPoint,
    getRenderedTooltipPoint,
    chartSize.width,
    chartSize.height,
    xMin,
    xMax,
    yMax,
  ]);

  // History-row hover/focus preview.
  useEffect(() => {
    const nextPreviewPoint = getRenderedTooltipPoint(historyPreviewChartPoint);

    setHistoryPreviewPoint((currentPoint) =>
      tooltipPointsMatch(currentPoint, nextPreviewPoint)
        ? currentPoint
        : nextPreviewPoint,
    );
  }, [
    historyPreviewChartPoint,
    getRenderedTooltipPoint,
    chartSize.width,
    chartSize.height,
    xMin,
    xMax,
    yMax,
  ]);

  // Chart's keyboard-nav point.
  useEffect(() => {
    if (!isKeyboardModeActive) {
      setKeyboardPoint(null);
      return;
    }

    const nextKeyboardPoint = getRenderedTooltipPoint(activeKeyboardPoint);

    setKeyboardPoint((currentPoint) =>
      tooltipPointsMatch(currentPoint, nextKeyboardPoint)
        ? currentPoint
        : nextKeyboardPoint,
    );
  }, [
    activeKeyboardPoint,
    getRenderedTooltipPoint,
    isKeyboardModeActive,
    chartSize.width,
    chartSize.height,
    xMin,
    xMax,
    yMax,
  ]);

  return {
    activeTooltipPoint,
    registerDotRef,
    setPointerPoint,
  };
}
