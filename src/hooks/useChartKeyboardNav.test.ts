// @vitest-environment jsdom

import { describe, it, expect, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { FocusEvent, KeyboardEvent } from "react";

import { useChartKeyboardNav } from "./useChartKeyboardNav";
import type { ChartPoint } from "../types/restaurant";

function makePoint(id: string): ChartPoint {
  return { id, timestamp: Number(id), score: 10, grade: "A", action: "some action" };
}

const POINTS = [makePoint("1"), makePoint("2"), makePoint("3")];

function makeKeyDownEvent(key: string): KeyboardEvent<HTMLDivElement> {
  return {
    key,
    preventDefault: vi.fn(),
  } as unknown as KeyboardEvent<HTMLDivElement>;
}

describe("useChartKeyboardNav", () => {
  it("defaults keyboard focus to the first chart point on mount", () => {
    const { result } = renderHook(() =>
      useChartKeyboardNav({ chartData: POINTS, selectedChartPoint: null }),
    );

    expect(result.current.activeKeyboardPoint).toEqual(POINTS[0]);
    expect(result.current.isKeyboardModeActive).toBe(false);
    expect(result.current.isChartFocusVisible).toBe(false);
  });

  it("moves focus forward and backward with the arrow keys, entering keyboard mode", () => {
    const { result } = renderHook(() =>
      useChartKeyboardNav({ chartData: POINTS, selectedChartPoint: null }),
    );

    act(() => result.current.handleChartKeyDown(makeKeyDownEvent("ArrowRight")));
    expect(result.current.activeKeyboardPoint).toEqual(POINTS[1]);
    expect(result.current.isKeyboardModeActive).toBe(true);
    expect(result.current.isChartFocusVisible).toBe(true);

    act(() => result.current.handleChartKeyDown(makeKeyDownEvent("ArrowLeft")));
    expect(result.current.activeKeyboardPoint).toEqual(POINTS[0]);
  });

  it("clamps at the first and last point rather than wrapping", () => {
    const { result } = renderHook(() =>
      useChartKeyboardNav({ chartData: POINTS, selectedChartPoint: null }),
    );

    act(() => result.current.handleChartKeyDown(makeKeyDownEvent("ArrowLeft")));
    expect(result.current.activeKeyboardPoint).toEqual(POINTS[0]);

    act(() => result.current.handleChartKeyDown(makeKeyDownEvent("End")));
    expect(result.current.activeKeyboardPoint).toEqual(POINTS[2]);

    act(() => result.current.handleChartKeyDown(makeKeyDownEvent("ArrowRight")));
    expect(result.current.activeKeyboardPoint).toEqual(POINTS[2]);

    act(() => result.current.handleChartKeyDown(makeKeyDownEvent("Home")));
    expect(result.current.activeKeyboardPoint).toEqual(POINTS[0]);
  });

  it("selects the current point on Enter/Space without moving focus", () => {
    const onSelectInspection = vi.fn();
    const { result } = renderHook(() =>
      useChartKeyboardNav({
        chartData: POINTS,
        selectedChartPoint: null,
        onSelectInspection,
      }),
    );

    act(() => result.current.handleChartKeyDown(makeKeyDownEvent("ArrowRight")));
    const enterEvent = makeKeyDownEvent("Enter");
    act(() => result.current.handleChartKeyDown(enterEvent));

    expect(onSelectInspection).toHaveBeenCalledWith(POINTS[1].id);
    expect(enterEvent.preventDefault).toHaveBeenCalled();
    expect(result.current.activeKeyboardPoint).toEqual(POINTS[1]);
  });

  it("ignores Tab and does nothing with no chart data", () => {
    const { result } = renderHook(() =>
      useChartKeyboardNav({ chartData: POINTS, selectedChartPoint: null }),
    );

    const tabEvent = makeKeyDownEvent("Tab");
    act(() => result.current.handleChartKeyDown(tabEvent));
    expect(tabEvent.preventDefault).not.toHaveBeenCalled();
    expect(result.current.isKeyboardModeActive).toBe(false);

    const { result: emptyResult } = renderHook(() =>
      useChartKeyboardNav({ chartData: [], selectedChartPoint: null }),
    );
    const arrowEvent = makeKeyDownEvent("ArrowRight");
    act(() => emptyResult.current.handleChartKeyDown(arrowEvent));
    expect(arrowEvent.preventDefault).not.toHaveBeenCalled();
  });

  it("re-focuses to a newly selected report", () => {
    const { result, rerender } = renderHook(
      ({ selectedChartPoint }) =>
        useChartKeyboardNav({ chartData: POINTS, selectedChartPoint }),
      { initialProps: { selectedChartPoint: null as ChartPoint | null } },
    );

    expect(result.current.activeKeyboardPoint).toEqual(POINTS[0]);

    rerender({ selectedChartPoint: POINTS[2] });
    expect(result.current.activeKeyboardPoint).toEqual(POINTS[2]);
  });

  it("resets keyboard-nav state when chart data changes", () => {
    const { result, rerender } = renderHook(
      ({ chartData }) => useChartKeyboardNav({ chartData, selectedChartPoint: null }),
      { initialProps: { chartData: POINTS } },
    );

    act(() => result.current.handleChartKeyDown(makeKeyDownEvent("ArrowRight")));
    expect(result.current.isKeyboardModeActive).toBe(true);

    const nextPoints = [makePoint("9"), makePoint("10")];
    rerender({ chartData: nextPoints });

    expect(result.current.activeKeyboardPoint).toEqual(nextPoints[0]);
    expect(result.current.isKeyboardModeActive).toBe(false);
    expect(result.current.isChartFocusVisible).toBe(false);
  });

  it("exitKeyboardMode turns keyboard mode off directly", () => {
    const { result } = renderHook(() =>
      useChartKeyboardNav({ chartData: POINTS, selectedChartPoint: null }),
    );

    act(() => result.current.handleChartKeyDown(makeKeyDownEvent("ArrowRight")));
    expect(result.current.isKeyboardModeActive).toBe(true);

    act(() => result.current.exitKeyboardMode());
    expect(result.current.isKeyboardModeActive).toBe(false);
  });

  describe("handleChartFocus / handleChartBlur", () => {
    function makeFocusEvent(
      container: HTMLDivElement,
      { focusVisible, sameTarget = true }: { focusVisible: boolean; sameTarget?: boolean },
    ): FocusEvent<HTMLDivElement> {
      container.matches = () => focusVisible;
      return {
        target: sameTarget ? container : document.createElement("span"),
        currentTarget: container,
      } as unknown as FocusEvent<HTMLDivElement>;
    }

    it("enters keyboard mode only on a genuine focus-visible focus of the container itself", () => {
      const container = document.createElement("div");
      const { result } = renderHook(() =>
        useChartKeyboardNav({ chartData: POINTS, selectedChartPoint: null }),
      );

      act(() =>
        result.current.handleChartFocus(
          makeFocusEvent(container, { focusVisible: false }),
        ),
      );
      expect(result.current.isChartFocusVisible).toBe(false);
      expect(result.current.isKeyboardModeActive).toBe(false);

      act(() =>
        result.current.handleChartFocus(
          makeFocusEvent(container, { focusVisible: true }),
        ),
      );
      expect(result.current.isChartFocusVisible).toBe(true);
      expect(result.current.isKeyboardModeActive).toBe(true);
    });

    it("ignores focus events that bubbled from a child rather than the container", () => {
      const container = document.createElement("div");
      const { result } = renderHook(() =>
        useChartKeyboardNav({ chartData: POINTS, selectedChartPoint: null }),
      );

      act(() =>
        result.current.handleChartFocus(
          makeFocusEvent(container, { focusVisible: true, sameTarget: false }),
        ),
      );
      expect(result.current.isChartFocusVisible).toBe(false);
      expect(result.current.isKeyboardModeActive).toBe(false);
    });

    it("clears focus state on blur to outside the container, but not to a child", () => {
      const container = document.createElement("div");
      const child = document.createElement("span");
      container.appendChild(child);

      const { result } = renderHook(() =>
        useChartKeyboardNav({ chartData: POINTS, selectedChartPoint: null }),
      );

      act(() =>
        result.current.handleChartFocus(
          makeFocusEvent(container, { focusVisible: true }),
        ),
      );
      expect(result.current.isKeyboardModeActive).toBe(true);

      act(() =>
        result.current.handleChartBlur({
          relatedTarget: child,
          currentTarget: container,
        } as unknown as FocusEvent<HTMLDivElement>),
      );
      expect(result.current.isKeyboardModeActive).toBe(true);

      act(() =>
        result.current.handleChartBlur({
          relatedTarget: document.createElement("button"),
          currentTarget: container,
        } as unknown as FocusEvent<HTMLDivElement>),
      );
      expect(result.current.isKeyboardModeActive).toBe(false);
      expect(result.current.isChartFocusVisible).toBe(false);
    });
  });
});
