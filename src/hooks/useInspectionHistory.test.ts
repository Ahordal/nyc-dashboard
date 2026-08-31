// @vitest-environment jsdom

// useInspectionHistory.test.ts
//
// Unit tests for useInspectionHistory: null camis, fetch-and-populate,
// the shared LRU cache (hit skips the network), non-ok and network
// failures falling back to empty, and abort on camis change / unmount.

import { afterEach, describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

import { useInspectionHistory } from "./useInspectionHistory";
import type { InspectionEvent } from "../types/restaurant";

function makeEvent(id: string): InspectionEvent {
  return { id } as InspectionEvent;
}

function jsonResponse(data: unknown): Response {
  return { ok: true, json: () => Promise.resolve(data) } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useInspectionHistory", () => {
  it("returns empty, non-loading state and never fetches when camis is null", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useInspectionHistory(null));

    expect(result.current.history).toEqual([]);
    expect(result.current.isLoadingHistory).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetches the camis history file and exposes it once resolved", async () => {
    const events = [makeEvent("a"), makeEvent("b")];
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(events));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useInspectionHistory("41"));

    expect(result.current.isLoadingHistory).toBe(true);

    await waitFor(() => expect(result.current.isLoadingHistory).toBe(false));

    expect(result.current.history).toEqual(events);
    expect(fetchMock).toHaveBeenCalledWith(
      "/data/history/41.json",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("serves a revisited camis from cache without a second fetch", async () => {
    const events = [makeEvent("a")];
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(events));
    vi.stubGlobal("fetch", fetchMock);

    const { result, rerender } = renderHook(
      ({ camis }) => useInspectionHistory(camis),
      { initialProps: { camis: "41" as string | null } },
    );

    await waitFor(() => expect(result.current.history).toEqual(events));

    rerender({ camis: null });
    await waitFor(() => expect(result.current.history).toEqual([]));

    rerender({ camis: "41" });

    expect(result.current.history).toEqual(events);
    expect(result.current.isLoadingHistory).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to empty history on a non-ok response", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: false, json: () => Promise.resolve([]) } as Response);
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useInspectionHistory("99"));

    await waitFor(() => expect(result.current.isLoadingHistory).toBe(false));
    expect(result.current.history).toEqual([]);
  });

  it("falls back to empty history when the fetch rejects", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useInspectionHistory("99"));

    await waitFor(() => expect(result.current.isLoadingHistory).toBe(false));
    expect(result.current.history).toEqual([]);
  });

  it("aborts the in-flight request when camis changes before it resolves", async () => {
    const fetchMock = vi.fn().mockReturnValue(new Promise(() => {}));
    vi.stubGlobal("fetch", fetchMock);

    const { rerender, unmount } = renderHook(
      ({ camis }) => useInspectionHistory(camis),
      { initialProps: { camis: "1" as string | null } },
    );

    const firstSignal = fetchMock.mock.calls[0][1].signal as AbortSignal;
    expect(firstSignal.aborted).toBe(false);

    rerender({ camis: "2" });
    expect(firstSignal.aborted).toBe(true);

    unmount();
    const secondSignal = fetchMock.mock.calls[1][1].signal as AbortSignal;
    expect(secondSignal.aborted).toBe(true);
  });
});
