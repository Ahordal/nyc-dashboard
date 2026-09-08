// @vitest-environment jsdom

// useGeolocation.test.ts
//
// Unit tests for useGeolocation: the success path, each error code
// mapping to an errorKind, the insecure / unsupported short-circuits
// (no getCurrentPosition call), the maximumAge flip on the second
// request, and a stale callback being ignored after a newer request.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

import { useGeolocation } from "./useGeolocation";

type SuccessCb = PositionCallback;
type ErrorCb = PositionErrorCallback;

const getCurrentPosition = vi.fn();

function setGeolocation(value: unknown) {
  Object.defineProperty(navigator, "geolocation", {
    value,
    configurable: true,
  });
}

function setSecureContext(value: boolean) {
  Object.defineProperty(window, "isSecureContext", {
    value,
    configurable: true,
  });
}

function makeCoords(latitude: number, longitude: number, accuracy: number) {
  return {
    coords: { latitude, longitude, accuracy },
  } as GeolocationPosition;
}

function geoError(code: number) {
  return {
    code,
    message: "",
    PERMISSION_DENIED: 1,
    POSITION_UNAVAILABLE: 2,
    TIMEOUT: 3,
  } as GeolocationPositionError;
}

beforeEach(() => {
  getCurrentPosition.mockReset();
  setGeolocation({ getCurrentPosition });
  setSecureContext(true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useGeolocation", () => {
  it("starts idle with no position or error", () => {
    const { result } = renderHook(() => useGeolocation());

    expect(result.current.status).toBe("idle");
    expect(result.current.position).toBeNull();
    expect(result.current.errorKind).toBeNull();
  });

  it("goes locating, then success with the fix on a granted request", () => {
    const { result } = renderHook(() => useGeolocation());

    act(() => result.current.requestLocation());
    expect(result.current.status).toBe("locating");

    const onSuccess = getCurrentPosition.mock.calls[0][0] as SuccessCb;
    act(() => onSuccess(makeCoords(40.758, -73.9855, 27)));

    expect(result.current.status).toBe("success");
    expect(result.current.position).toEqual({
      latitude: 40.758,
      longitude: -73.9855,
      accuracy: 27,
    });
    expect(result.current.errorKind).toBeNull();
  });

  it("accepts a recent cached fix on the first request, forces a fresh one after", () => {
    const { result } = renderHook(() => useGeolocation());

    act(() => result.current.requestLocation());
    expect(getCurrentPosition.mock.calls[0][2]).toMatchObject({
      enableHighAccuracy: true,
      maximumAge: 30_000,
      timeout: 10_000,
    });

    const onSuccess = getCurrentPosition.mock.calls[0][0] as SuccessCb;
    act(() => onSuccess(makeCoords(40.7, -74, 20)));

    act(() => result.current.requestLocation());
    expect(getCurrentPosition.mock.calls[1][2]).toMatchObject({
      maximumAge: 0,
      timeout: 15_000,
    });
  });

  it.each([
    [1, "denied"],
    [2, "unavailable"],
    [3, "timeout"],
  ] as const)("maps error code %i to errorKind %s", (code, kind) => {
    const { result } = renderHook(() => useGeolocation());

    act(() => result.current.requestLocation());
    const onError = getCurrentPosition.mock.calls[0][1] as ErrorCb;
    act(() => onError(geoError(code)));

    expect(result.current.status).toBe("error");
    expect(result.current.errorKind).toBe(kind);
  });

  it("short-circuits to an insecure error without calling the API", () => {
    setSecureContext(false);
    const { result } = renderHook(() => useGeolocation());

    act(() => result.current.requestLocation());

    expect(result.current.status).toBe("error");
    expect(result.current.errorKind).toBe("insecure");
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it("reports unavailable when the browser has no geolocation API", () => {
    setGeolocation(undefined);
    const { result } = renderHook(() => useGeolocation());

    act(() => result.current.requestLocation());

    expect(result.current.status).toBe("error");
    expect(result.current.errorKind).toBe("unavailable");
  });

  it("clearLocation resets to idle and drops the fix", () => {
    const { result } = renderHook(() => useGeolocation());

    act(() => result.current.requestLocation());
    const onSuccess = getCurrentPosition.mock.calls[0][0] as SuccessCb;
    act(() => onSuccess(makeCoords(40.758, -73.9855, 27)));
    expect(result.current.status).toBe("success");

    act(() => result.current.clearLocation());

    expect(result.current.status).toBe("idle");
    expect(result.current.position).toBeNull();
    expect(result.current.errorKind).toBeNull();
  });

  it("uses the fast cached path again after a clear", () => {
    const { result } = renderHook(() => useGeolocation());

    act(() => result.current.requestLocation());
    const onSuccess = getCurrentPosition.mock.calls[0][0] as SuccessCb;
    act(() => onSuccess(makeCoords(40.7, -74, 20)));

    act(() => result.current.clearLocation());
    act(() => result.current.requestLocation());

    // Without the clear this would be maximumAge: 0 (a refresh).
    expect(getCurrentPosition.mock.calls[1][2]).toMatchObject({
      maximumAge: 30_000,
    });
  });

  it("ignores a callback that resolves after clearLocation", () => {
    const { result } = renderHook(() => useGeolocation());

    act(() => result.current.requestLocation());
    const onSuccess = getCurrentPosition.mock.calls[0][0] as SuccessCb;

    act(() => result.current.clearLocation());
    act(() => onSuccess(makeCoords(40.758, -73.9855, 27)));

    expect(result.current.status).toBe("idle");
    expect(result.current.position).toBeNull();
  });

  it("ignores a stale callback once a newer request is in flight", () => {
    const { result } = renderHook(() => useGeolocation());

    act(() => result.current.requestLocation());
    const firstSuccess = getCurrentPosition.mock.calls[0][0] as SuccessCb;

    act(() => result.current.requestLocation());
    act(() => firstSuccess(makeCoords(1, 1, 1)));

    expect(result.current.position).toBeNull();
    expect(result.current.status).toBe("locating");

    const secondSuccess = getCurrentPosition.mock.calls[1][0] as SuccessCb;
    act(() => secondSuccess(makeCoords(40.758, -73.9855, 27)));

    expect(result.current.position).toEqual({
      latitude: 40.758,
      longitude: -73.9855,
      accuracy: 27,
    });
  });
});
