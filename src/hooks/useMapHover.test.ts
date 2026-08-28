// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import type GeoJSONLayer from "@arcgis/core/layers/GeoJSONLayer";
import type MapView from "@arcgis/core/views/MapView";

import type { RestaurantProperties } from "../types/restaurant";
import type { HoverCardState } from "../components/MapHoverCard";
import { useMapHover } from "./useMapHover";

const HOVER_CARD_MAX_SCALE = 18056;

// Two microtask hops -- enough to let an awaited hitTest promise settle
// and runHitTest run to completion.
const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

function makeAttrs(over: Partial<RestaurantProperties> = {}) {
  return {
    id: "r1",
    name: "Joe's Pizza",
    action: "Violations were cited in the following area(s).",
    grade: "A",
    score: 10,
    ...over,
  } as RestaurantProperties;
}

type SetupOpts = {
  scale?: number;
  hit?: boolean;
  isPlacing?: boolean;
  // When set, hitTest returns a promise the test resolves by hand.
  manualHitTest?: boolean;
};

function setup(opts: SetupOpts = {}) {
  const { scale = 5000, hit = true, isPlacing = false, manualHitTest = false } = opts;

  const layer = {} as GeoJSONLayer;
  const container = document.createElement("div");
  const handlers: Record<string, (e: unknown) => void> = {};

  const hitResolvers: Array<(v: unknown) => void> = [];
  const hitTest = vi.fn(() => {
    if (manualHitTest) {
      return new Promise((res) => hitResolvers.push(res));
    }
    return Promise.resolve({
      results: hit ? [{ graphic: { layer, attributes: makeAttrs() } }] : [],
    });
  });

  const view = {
    scale,
    container,
    hitTest,
    on: vi.fn((event: string, cb: (e: unknown) => void) => {
      handlers[event] = cb;
      return { remove: vi.fn() };
    }),
  } as unknown as MapView;

  const onHoverRestaurant = vi.fn();
  const setHoverCard = vi.fn() as unknown as Dispatch<
    SetStateAction<HoverCardState | null>
  >;
  const isPlacingPointRef: RefObject<boolean> = { current: isPlacing };

  renderHook(() =>
    useMapHover({
      view,
      layerRef: { current: layer } as RefObject<GeoJSONLayer | null>,
      isPlacingPointRef,
      onHoverRestaurantRef: { current: onHoverRestaurant } as RefObject<
        ((r: RestaurantProperties | null) => void) | undefined
      >,
      setHoverCard,
    }),
  );

  return {
    container,
    hitTest,
    hitResolvers,
    layer,
    onHoverRestaurant,
    setHoverCard: setHoverCard as unknown as ReturnType<typeof vi.fn>,
    isPlacingPointRef,
    firePointerMove: (e: { x: number; y: number }) =>
      handlers["pointer-move"]?.(e),
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("useMapHover", () => {
  it("coalesces a burst of pointer-move events into one trailing hit test", async () => {
    const { firePointerMove, hitTest, setHoverCard } = setup();

    firePointerMove({ x: 1, y: 1 });
    firePointerMove({ x: 2, y: 2 });
    firePointerMove({ x: 3, y: 3 });
    expect(hitTest).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(60);

    expect(hitTest).toHaveBeenCalledTimes(1);
    expect(setHoverCard).toHaveBeenLastCalledWith(
      expect.objectContaining({ x: 3, y: 3 }),
    );
  });

  it("shows the hover card at the max scale and hides it once zoomed further out", async () => {
    const atLimit = setup({ scale: HOVER_CARD_MAX_SCALE });
    atLimit.firePointerMove({ x: 5, y: 5 });
    await vi.advanceTimersByTimeAsync(60);
    expect(atLimit.setHoverCard).toHaveBeenLastCalledWith(
      expect.objectContaining({ name: "Joe's Pizza", gradeText: "A", scoreText: "10" }),
    );

    const zoomedOut = setup({ scale: HOVER_CARD_MAX_SCALE + 1 });
    zoomedOut.firePointerMove({ x: 5, y: 5 });
    await vi.advanceTimersByTimeAsync(60);
    expect(zoomedOut.setHoverCard).toHaveBeenLastCalledWith(null);
    // The hover callback still fires regardless of zoom.
    expect(zoomedOut.onHoverRestaurant).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: "r1" }),
    );
  });

  it("clears the card and sets a default cursor when the pointer is over no dot", async () => {
    const { firePointerMove, setHoverCard, onHoverRestaurant, container } = setup({
      hit: false,
    });

    firePointerMove({ x: 5, y: 5 });
    await vi.advanceTimersByTimeAsync(60);

    expect(setHoverCard).toHaveBeenLastCalledWith(null);
    expect(onHoverRestaurant).toHaveBeenLastCalledWith(null);
    expect(container.style.cursor).toBe("default");
  });

  it("sets a pointer cursor when the pointer is over a dot", async () => {
    const { firePointerMove, container } = setup({ hit: true });
    firePointerMove({ x: 5, y: 5 });
    await vi.advanceTimersByTimeAsync(60);
    expect(container.style.cursor).toBe("pointer");
  });

  it("skips the hit test entirely while a Search Radius point is being placed", async () => {
    const { firePointerMove, hitTest } = setup({ isPlacing: true });
    firePointerMove({ x: 5, y: 5 });
    await vi.advanceTimersByTimeAsync(60);
    expect(hitTest).not.toHaveBeenCalled();
  });

  it("clears the card and hover on mouseleave", async () => {
    const { container, setHoverCard, onHoverRestaurant } = setup();

    container.dispatchEvent(new Event("mouseleave"));

    expect(setHoverCard).toHaveBeenLastCalledWith(null);
    expect(onHoverRestaurant).toHaveBeenLastCalledWith(null);
  });

  it("ignores a stale hit-test response that resolves after a newer one", async () => {
    const { firePointerMove, hitResolvers, setHoverCard } = setup({
      manualHitTest: true,
    });
    const layerA = {} as GeoJSONLayer;

    // First move -> runHitTest A in flight (token 1).
    firePointerMove({ x: 1, y: 1 });
    await vi.advanceTimersByTimeAsync(60);
    // Second move -> runHitTest B in flight (token 2).
    firePointerMove({ x: 2, y: 2 });
    await vi.advanceTimersByTimeAsync(60);
    expect(hitResolvers).toHaveLength(2);

    // Newer response (B) settles first and is applied.
    hitResolvers[1]({ results: [] });
    await flush();
    const callsAfterB = setHoverCard.mock.calls.length;
    expect(setHoverCard).toHaveBeenLastCalledWith(null);

    // Older response (A) settles later and must be dropped.
    hitResolvers[0]({
      results: [{ graphic: { layer: layerA, attributes: makeAttrs() } }],
    });
    await flush();
    expect(setHoverCard.mock.calls.length).toBe(callsAfterB);
  });
});
