// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { MouseEvent, TouchEvent } from "react";

import { useSwipe } from "./useSwipe";

const point = (x: number, y: number) => ({ clientX: x, clientY: y });
const start = (x: number, y: number) =>
  ({ touches: [point(x, y)] }) as unknown as TouchEvent;
const end = (x: number, y: number) =>
  ({ changedTouches: [point(x, y)] }) as unknown as TouchEvent;

function setup(enabled = true) {
  const onSwipeLeft = vi.fn();
  const onSwipeRight = vi.fn();
  const { result } = renderHook(() =>
    useSwipe({ onSwipeLeft, onSwipeRight, enabled }),
  );
  return { handlers: result.current, onSwipeLeft, onSwipeRight };
}

function swipe(
  handlers: ReturnType<typeof useSwipe>,
  from: [number, number],
  to: [number, number],
) {
  handlers.onTouchStart?.(start(...from));
  handlers.onTouchEnd?.(end(...to));
}

describe("useSwipe", () => {
  it("fires left and right on clear horizontal swipes", () => {
    const { handlers, onSwipeLeft, onSwipeRight } = setup();
    swipe(handlers, [300, 200], [150, 210]);
    swipe(handlers, [150, 200], [300, 190]);
    expect(onSwipeLeft).toHaveBeenCalledOnce();
    expect(onSwipeRight).toHaveBeenCalledOnce();
  });

  it("ignores short, mostly-vertical and edge-started gestures", () => {
    const { handlers, onSwipeLeft, onSwipeRight } = setup();
    swipe(handlers, [200, 200], [170, 200]);
    swipe(handlers, [300, 100], [200, 300]);
    swipe(handlers, [5, 200], [200, 200]);
    expect(onSwipeLeft).not.toHaveBeenCalled();
    expect(onSwipeRight).not.toHaveBeenCalled();
  });

  it("swallows the click that ends a swipe, but not the next tap", () => {
    const { handlers } = setup();
    const click = () => {
      const event = { stopPropagation: vi.fn(), preventDefault: vi.fn() };
      handlers.onClickCapture?.(event as unknown as MouseEvent);
      return event.stopPropagation;
    };
    swipe(handlers, [300, 200], [150, 200]);
    expect(click()).toHaveBeenCalled();
    swipe(handlers, [200, 200], [200, 200]);
    expect(click()).not.toHaveBeenCalled();
  });

  it("returns no handlers when disabled", () => {
    expect(setup(false).handlers).toEqual({});
  });
});
