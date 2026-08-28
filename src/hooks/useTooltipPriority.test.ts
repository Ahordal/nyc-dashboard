// @vitest-environment jsdom

// useTooltipPriority.test.ts
//
// Unit tests for useTooltipPriority: priority order across pointer hover,
// history preview, keyboard-nav point, and pinned selection; dot-ref
// registration and rendered-coordinate resolution; and reset on data
// change.

import { describe, it, expect } from "vitest";
import { act, renderHook } from "@testing-library/react";

import { useTooltipPriority } from "./useTooltipPriority";
import type { ChartPoint } from "../types/restaurant";

function makePoint(id: string): ChartPoint {
  return { id, timestamp: Number(id), score: 10, grade: "A", action: "some action" };
}

function makeDot(cx: number, cy: number): SVGCircleElement {
  const dot = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "circle",
  ) as SVGCircleElement;
  dot.setAttribute("cx", String(cx));
  dot.setAttribute("cy", String(cy));
  return dot;
}

const BASE_PARAMS = { xMin: 0, xMax: 10, yMax: 10 };

describe("useTooltipPriority", () => {
  it("returns null when nothing is registered or active", () => {
    const { result } = renderHook(() =>
      useTooltipPriority({
        chartData: [],
        selectedChartPoint: null,
        historyPreviewChartPoint: null,
        activeKeyboardPoint: null,
        isKeyboardModeActive: false,
        chartSize: { width: 100, height: 100 },
        ...BASE_PARAMS,
      }),
    );

    expect(result.current.activeTooltipPoint).toBeNull();
  });

  it("syncs the pinned selection once its dot is registered and a dependency changes", () => {
    const p1 = makePoint("1");
    // Hoisted outside the render callback: chartData is one of the reset
    // effect's dependencies (by reference), so a fresh array literal
    // inside the callback would look like a change on every rerender and
    // wipe the sync this test is trying to observe.
    const chartData = [p1];
    const { result, rerender } = renderHook(
      ({ chartSize }) =>
        useTooltipPriority({
          chartData,
          selectedChartPoint: p1,
          historyPreviewChartPoint: null,
          activeKeyboardPoint: null,
          isKeyboardModeActive: false,
          chartSize,
          ...BASE_PARAMS,
        }),
      { initialProps: { chartSize: { width: 100, height: 100 } } },
    );

    // Nothing registered yet at mount, so the pinned point can't resolve.
    expect(result.current.activeTooltipPoint).toBeNull();

    act(() => result.current.registerDotRef(p1.id, makeDot(5, 6)));
    // registerDotRef is imperative; the sync effect only re-reads it once
    // one of its own dependencies (here, chartSize) actually changes.
    rerender({ chartSize: { width: 101, height: 100 } });

    expect(result.current.activeTooltipPoint).toEqual({ cx: 5, cy: 6, payload: p1 });
  });

  it("prioritizes a direct pointer hover over the pinned selection", () => {
    const p1 = makePoint("1");
    const p2 = makePoint("2");
    const chartData = [p1, p2];
    const { result, rerender } = renderHook(
      ({ chartSize }) =>
        useTooltipPriority({
          chartData,
          selectedChartPoint: p1,
          historyPreviewChartPoint: null,
          activeKeyboardPoint: null,
          isKeyboardModeActive: false,
          chartSize,
          ...BASE_PARAMS,
        }),
      { initialProps: { chartSize: { width: 100, height: 100 } } },
    );

    act(() => result.current.registerDotRef(p1.id, makeDot(1, 1)));
    rerender({ chartSize: { width: 101, height: 100 } });
    expect(result.current.activeTooltipPoint?.payload.id).toBe("1");

    act(() => result.current.setPointerPoint({ cx: 9, cy: 9, payload: p2 }));
    expect(result.current.activeTooltipPoint).toEqual({ cx: 9, cy: 9, payload: p2 });
  });

  it("prioritizes the history preview over the pinned selection", () => {
    const p1 = makePoint("1");
    const p2 = makePoint("2");
    const chartData = [p1, p2];
    const { result, rerender } = renderHook(
      ({ historyPreviewChartPoint }) =>
        useTooltipPriority({
          chartData,
          selectedChartPoint: p1,
          historyPreviewChartPoint,
          activeKeyboardPoint: null,
          isKeyboardModeActive: false,
          chartSize: { width: 100, height: 100 },
          ...BASE_PARAMS,
        }),
      { initialProps: { historyPreviewChartPoint: null as ChartPoint | null } },
    );

    act(() => result.current.registerDotRef(p2.id, makeDot(3, 4)));
    // historyPreviewChartPoint is itself the sync effect's dependency
    // here, so changing it is enough to force a re-read; no chartSize
    // bump needed.
    rerender({ historyPreviewChartPoint: p2 });

    expect(result.current.activeTooltipPoint).toEqual({ cx: 3, cy: 4, payload: p2 });
  });

  it("uses the keyboard-nav point instead of the pinned selection while keyboard mode is active", () => {
    const p1 = makePoint("1");
    const p2 = makePoint("2");
    const chartData = [p1, p2];
    const { result, rerender } = renderHook(
      ({ chartSize, isKeyboardModeActive, activeKeyboardPoint }) =>
        useTooltipPriority({
          chartData,
          selectedChartPoint: p1,
          historyPreviewChartPoint: null,
          activeKeyboardPoint,
          isKeyboardModeActive,
          chartSize,
          ...BASE_PARAMS,
        }),
      {
        initialProps: {
          chartSize: { width: 100, height: 100 },
          isKeyboardModeActive: false,
          activeKeyboardPoint: null as ChartPoint | null,
        },
      },
    );

    act(() => {
      result.current.registerDotRef(p1.id, makeDot(1, 1));
      result.current.registerDotRef(p2.id, makeDot(2, 2));
    });

    // Force the pinned-selection sync effect to pick up p1's dot first.
    rerender({
      chartSize: { width: 101, height: 100 },
      isKeyboardModeActive: false,
      activeKeyboardPoint: null,
    });
    expect(result.current.activeTooltipPoint?.payload.id).toBe("1");

    rerender({
      chartSize: { width: 101, height: 100 },
      isKeyboardModeActive: true,
      activeKeyboardPoint: p2,
    });
    expect(result.current.activeTooltipPoint).toEqual({ cx: 2, cy: 2, payload: p2 });
  });

  it("clears a lingering pointer hover once keyboard mode activates", () => {
    const p1 = makePoint("1");
    const chartData = [p1];
    const { result, rerender } = renderHook(
      ({ isKeyboardModeActive }) =>
        useTooltipPriority({
          chartData,
          selectedChartPoint: null,
          historyPreviewChartPoint: null,
          activeKeyboardPoint: null,
          isKeyboardModeActive,
          chartSize: { width: 100, height: 100 },
          ...BASE_PARAMS,
        }),
      { initialProps: { isKeyboardModeActive: false } },
    );

    act(() => result.current.setPointerPoint({ cx: 9, cy: 9, payload: p1 }));
    expect(result.current.activeTooltipPoint?.payload.id).toBe("1");

    rerender({ isKeyboardModeActive: true });
    expect(result.current.activeTooltipPoint).toBeNull();
  });

  it("resets every tracked point when chart data changes", () => {
    const p1 = makePoint("1");
    const { result, rerender } = renderHook(
      ({ chartData }) =>
        useTooltipPriority({
          chartData,
          selectedChartPoint: p1,
          historyPreviewChartPoint: null,
          activeKeyboardPoint: null,
          isKeyboardModeActive: false,
          chartSize: { width: 100, height: 100 },
          ...BASE_PARAMS,
        }),
      { initialProps: { chartData: [p1] } },
    );

    act(() => result.current.setPointerPoint({ cx: 1, cy: 1, payload: p1 }));
    expect(result.current.activeTooltipPoint).not.toBeNull();

    rerender({ chartData: [] });
    expect(result.current.activeTooltipPoint).toBeNull();
  });

  it("treats a dot with non-finite rendered coordinates as unresolved", () => {
    const p1 = makePoint("1");
    const chartData = [p1];
    const dot = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "circle",
    ) as SVGCircleElement;
    // Number(null) is 0 (finite), which wouldn't exercise the guard. An
    // explicitly non-numeric attribute does.
    dot.setAttribute("cx", "not-a-number");
    dot.setAttribute("cy", "also-not-a-number");

    const { result, rerender } = renderHook(
      ({ chartSize }) =>
        useTooltipPriority({
          chartData,
          selectedChartPoint: p1,
          historyPreviewChartPoint: null,
          activeKeyboardPoint: null,
          isKeyboardModeActive: false,
          chartSize,
          ...BASE_PARAMS,
        }),
      { initialProps: { chartSize: { width: 100, height: 100 } } },
    );

    act(() => result.current.registerDotRef(p1.id, dot));
    rerender({ chartSize: { width: 101, height: 100 } });

    expect(result.current.activeTooltipPoint).toBeNull();
  });

  it("stops resolving a dot once it's unregistered", () => {
    const p1 = makePoint("1");
    const chartData = [p1];
    const { result, rerender } = renderHook(
      ({ chartSize }) =>
        useTooltipPriority({
          chartData,
          selectedChartPoint: p1,
          historyPreviewChartPoint: null,
          activeKeyboardPoint: null,
          isKeyboardModeActive: false,
          chartSize,
          ...BASE_PARAMS,
        }),
      { initialProps: { chartSize: { width: 100, height: 100 } } },
    );

    act(() => result.current.registerDotRef(p1.id, makeDot(1, 1)));
    rerender({ chartSize: { width: 101, height: 100 } });
    expect(result.current.activeTooltipPoint).not.toBeNull();

    act(() => result.current.registerDotRef(p1.id, null));
    rerender({ chartSize: { width: 102, height: 100 } });
    expect(result.current.activeTooltipPoint).toBeNull();
  });
});
