// useChartKeyboardNav.ts
//
// Keyboard navigation for PerformanceChart's chart body: tracks which point
// has keyboard focus, whether keyboard mode / the focus ring are active, and
// handles focus, blur, and arrow/Enter/Space key interaction. Extracted from
// PerformanceChart so this logic is independently testable.

import { useCallback, useEffect, useState } from "react";
import type { FocusEvent, KeyboardEvent } from "react";

import type { ChartPoint } from "../types/restaurant";

type UseChartKeyboardNavParams = {
  chartData: ChartPoint[];
  selectedChartPoint: ChartPoint | null;
  onSelectInspection?: (inspectionId: string) => void;
};

export function useChartKeyboardNav({
  chartData,
  selectedChartPoint,
  onSelectInspection,
}: UseChartKeyboardNavParams) {
  const [focusedPointId, setFocusedPointId] = useState<string | null>(null);

  const [isKeyboardModeActive, setIsKeyboardModeActive] = useState(false);

  const [isChartFocusVisible, setIsChartFocusVisible] = useState(false);

  const activeKeyboardPoint =
    chartData.find((point) => point.id === focusedPointId) ??
    selectedChartPoint ??
    chartData[0] ??
    null;

  // Reset keyboard-nav state whenever the underlying chart data changes.
  useEffect(() => {
    setFocusedPointId(chartData[0]?.id ?? null);
    setIsKeyboardModeActive(false);
    setIsChartFocusVisible(false);
  }, [chartData]);

  // A newly selected report becomes the keyboard-navigation starting point.
  useEffect(() => {
    if (selectedChartPoint) {
      setFocusedPointId(selectedChartPoint.id);
    }
  }, [selectedChartPoint]);

  // Exposed so other interactions (e.g. a direct pointer hover) can cancel
  // keyboard mode without reaching into this hook's internals.
  const exitKeyboardMode = useCallback(() => {
    setIsKeyboardModeActive(false);
  }, []);

  const handleChartFocus = useCallback(
    (event: FocusEvent<HTMLDivElement>) => {
      if (event.target !== event.currentTarget) {
        return;
      }

      const focusIsVisible = event.currentTarget.matches(":focus-visible");

      setIsChartFocusVisible(focusIsVisible);

      if (!focusIsVisible) {
        return;
      }

      const point = activeKeyboardPoint ?? selectedChartPoint ?? chartData[0];

      if (!point) {
        return;
      }

      setFocusedPointId(point.id);
      setIsKeyboardModeActive(true);
    },
    [activeKeyboardPoint, selectedChartPoint, chartData],
  );

  const handleChartBlur = useCallback((event: FocusEvent<HTMLDivElement>) => {
    const nextFocusedElement = event.relatedTarget;

    if (
      nextFocusedElement instanceof Node &&
      event.currentTarget.contains(nextFocusedElement)
    ) {
      return;
    }

    setIsChartFocusVisible(false);
    setIsKeyboardModeActive(false);
  }, []);

  const handleChartKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Tab") {
        return;
      }

      if (chartData.length === 0) {
        return;
      }

      const currentPoint =
        activeKeyboardPoint ?? selectedChartPoint ?? chartData[0];

      const currentIndex = Math.max(
        chartData.findIndex((point) => point.id === currentPoint.id),
        0,
      );

      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();

        setIsChartFocusVisible(true);
        setIsKeyboardModeActive(true);

        onSelectInspection?.(currentPoint.id);

        return;
      }

      let nextIndex: number;

      switch (event.key) {
        case "ArrowRight":
        case "ArrowDown":
          nextIndex = Math.min(currentIndex + 1, chartData.length - 1);
          break;

        case "ArrowLeft":
        case "ArrowUp":
          nextIndex = Math.max(currentIndex - 1, 0);
          break;

        case "Home":
          nextIndex = 0;
          break;

        case "End":
          nextIndex = chartData.length - 1;
          break;

        default:
          return;
      }

      event.preventDefault();

      const nextPoint = chartData[nextIndex];

      setIsChartFocusVisible(true);
      setIsKeyboardModeActive(true);
      setFocusedPointId(nextPoint.id);
    },
    [activeKeyboardPoint, chartData, onSelectInspection, selectedChartPoint],
  );

  return {
    activeKeyboardPoint,
    isKeyboardModeActive,
    isChartFocusVisible,
    exitKeyboardMode,
    handleChartFocus,
    handleChartBlur,
    handleChartKeyDown,
  };
}
