// useSwipe.ts
//
// Horizontal swipe detection for touch. Returns props to spread on the
// swipeable element; never calls preventDefault, so vertical scroll is untouched.

import { useRef } from "react";
import type { MouseEvent, TouchEvent } from "react";

const MIN_DISTANCE_PX = 50;
// Horizontal travel must clearly beat vertical, so diagonal scrolls don't count.
const DIRECTION_RATIO = 1.5;
// iOS Safari's back/forward gestures start at the screen edges.
const EDGE_GUARD_PX = 20;

type UseSwipeOptions = {
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
  enabled?: boolean;
};

export function useSwipe({
  onSwipeLeft,
  onSwipeRight,
  enabled = true,
}: UseSwipeOptions) {
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const swipedRef = useRef(false);

  if (!enabled) return {};

  return {
    onTouchStart(event: TouchEvent) {
      swipedRef.current = false;
      const touch = event.touches[0];
      const nearEdge =
        touch.clientX < EDGE_GUARD_PX ||
        touch.clientX > window.innerWidth - EDGE_GUARD_PX;
      startRef.current =
        event.touches.length === 1 && !nearEdge
          ? { x: touch.clientX, y: touch.clientY }
          : null;
    },
    onTouchEnd(event: TouchEvent) {
      const start = startRef.current;
      startRef.current = null;
      if (!start) return;
      const touch = event.changedTouches[0];
      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      if (Math.abs(dx) < MIN_DISTANCE_PX) return;
      if (Math.abs(dx) < Math.abs(dy) * DIRECTION_RATIO) return;
      swipedRef.current = true;
      if (dx < 0) onSwipeLeft();
      else onSwipeRight();
    },
    onTouchCancel() {
      startRef.current = null;
    },
    // A swipe that ends on a card mustn't also select it.
    onClickCapture(event: MouseEvent) {
      if (!swipedRef.current) return;
      swipedRef.current = false;
      event.stopPropagation();
      event.preventDefault();
    },
  };
}
