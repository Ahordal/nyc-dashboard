// @vitest-environment jsdom

// useUrlSync.test.ts
//
// Unit tests for the pure URL helpers in useUrlSync: isSearchRadiusMiles
// validation, parseRadiusParam parsing and range checks,
// parseInitialUrlState query decoding, and buildUrlQuery serialization
// plus a parse/build round-trip. Also covers the hook's mount-time
// read/write interaction via renderHook.

import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import {
  parseRadiusParam,
  parseInitialUrlState,
  buildUrlQuery,
  useUrlSync,
} from "./useUrlSync";
import type { UrlSyncState } from "./useUrlSync";
import { isSearchRadiusMiles } from "../types/searchRadius";

describe("isSearchRadiusMiles", () => {
  it("accepts exactly the three supported radii", () => {
    expect(isSearchRadiusMiles(0.25)).toBe(true);
    expect(isSearchRadiusMiles(0.5)).toBe(true);
    expect(isSearchRadiusMiles(1)).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isSearchRadiusMiles(0)).toBe(false);
    expect(isSearchRadiusMiles(0.75)).toBe(false);
    expect(isSearchRadiusMiles(2)).toBe(false);
    expect(isSearchRadiusMiles(Number.NaN)).toBe(false);
  });
});

describe("parseRadiusParam", () => {
  it("parses a well-formed lat,lng,miles triple", () => {
    expect(parseRadiusParam("40.75800,-73.98550,0.5")).toEqual({
      point: { latitude: 40.758, longitude: -73.9855 },
      miles: 0.5,
    });
  });

  it("returns null for null / empty / wrong arity", () => {
    expect(parseRadiusParam(null)).toBeNull();
    expect(parseRadiusParam("")).toBeNull();
    expect(parseRadiusParam("40.75,-73.98")).toBeNull();
    expect(parseRadiusParam("40.75,-73.98,0.5,extra")).toBeNull();
  });

  it("returns null when a component is not a finite number", () => {
    expect(parseRadiusParam("abc,-73.98,0.5")).toBeNull();
    expect(parseRadiusParam("40.75,def,0.5")).toBeNull();
    expect(parseRadiusParam("40.75,-73.98,Infinity")).toBeNull();
  });

  it("returns null for out-of-range coordinates", () => {
    expect(parseRadiusParam("120,-73.98,0.5")).toBeNull();
    expect(parseRadiusParam("40.75,-200,0.5")).toBeNull();
  });

  it("returns null for an unsupported radius value", () => {
    expect(parseRadiusParam("40.75,-73.98,0.75")).toBeNull();
    expect(parseRadiusParam("40.75,-73.98,5")).toBeNull();
  });
});

describe("parseInitialUrlState", () => {
  it("returns fully-empty state for an empty query string", () => {
    expect(parseInitialUrlState("")).toEqual({
      grades: [],
      boroughs: [],
      searchQuery: "",
      camis: null,
      radius: null,
    });
  });

  it("splits comma lists and trims the search query", () => {
    const state = parseInitialUrlState(
      "?grades=A,B&boroughs=Manhattan,Queens&q=%20pizza%20",
    );
    expect(state.grades).toEqual(["A", "B"]);
    expect(state.boroughs).toEqual(["Manhattan", "Queens"]);
    expect(state.searchQuery).toBe("pizza");
  });

  it("accepts `id` as a fallback for `camis`", () => {
    expect(parseInitialUrlState("?id=41234567").camis).toBe("41234567");
    expect(parseInitialUrlState("?camis=50000000").camis).toBe("50000000");
  });

  it("carries a valid radius through and drops a malformed one", () => {
    expect(parseInitialUrlState("?radius=40.758,-73.9855,1").radius).toEqual({
      point: { latitude: 40.758, longitude: -73.9855 },
      miles: 1,
    });
    expect(parseInitialUrlState("?radius=nope").radius).toBeNull();
  });
});

describe("buildUrlQuery", () => {
  const empty: UrlSyncState = {
    grades: [],
    boroughs: [],
    searchQuery: "",
    selectedRestaurantCamis: null,
    searchRadiusPoint: null,
    searchRadiusMiles: 0.25,
  };

  it("emits nothing when no state is active", () => {
    expect(buildUrlQuery({ ...empty })).toBe("");
  });

  it("serializes filters, search, and selection", () => {
    const query = buildUrlQuery({
      ...empty,
      grades: ["A", "B"],
      boroughs: ["Brooklyn"],
      searchQuery: "  tacos ",
      selectedRestaurantCamis: "41234567",
    });
    const params = new URLSearchParams(query);
    expect(params.get("grades")).toBe("A,B");
    expect(params.get("boroughs")).toBe("Brooklyn");
    expect(params.get("q")).toBe("tacos");
    expect(params.get("camis")).toBe("41234567");
    expect(params.has("radius")).toBe(false);
  });

  it("serializes the radius as lat,lng,miles rounded to 5 dp", () => {
    const query = buildUrlQuery({
      ...empty,
      searchRadiusPoint: { latitude: 40.758012345, longitude: -73.98549999 },
      searchRadiusMiles: 0.5,
    });
    expect(new URLSearchParams(query).get("radius")).toBe(
      "40.75801,-73.98550,0.5",
    );
  });

  it("omits the radius when no point is set even if miles is non-default", () => {
    expect(
      buildUrlQuery({ ...empty, searchRadiusPoint: null, searchRadiusMiles: 1 }),
    ).toBe("");
  });

  it("round-trips a placed radius back through parseRadiusParam", () => {
    const query = buildUrlQuery({
      ...empty,
      searchRadiusPoint: { latitude: 40.6782, longitude: -73.9442 },
      searchRadiusMiles: 1,
    });
    const raw = new URLSearchParams(query).get("radius");
    expect(parseRadiusParam(raw)).toEqual({
      point: { latitude: 40.6782, longitude: -73.9442 },
      miles: 1,
    });
  });
});

describe("useUrlSync", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function makeState(overrides: Partial<UrlSyncState> = {}): UrlSyncState {
    return {
      grades: [],
      boroughs: [],
      searchQuery: "",
      selectedRestaurantCamis: null,
      searchRadiusPoint: null,
      searchRadiusMiles: 0.25,
      ...overrides,
    };
  }

  it("doesn't overwrite the URL with default state before onInit's update lands", () => {
    window.history.pushState({}, "", "/?camis=41234567");
    const replaceStateSpy = vi.spyOn(window.history, "replaceState");
    const onInit = vi.fn();

    const { rerender } = renderHook(
      ({ state }) => useUrlSync(state, onInit),
      { initialProps: { state: makeState() } },
    );

    expect(onInit).toHaveBeenCalledWith(
      expect.objectContaining({ camis: "41234567" }),
    );
    // The write-effect's first pass runs in the same commit as onInit,
    // before the parent has applied onInit's state — it must not fire
    // replaceState with the pre-init default (empty) query here.
    expect(replaceStateSpy).not.toHaveBeenCalled();

    // Parent applies onInit's state (as dashboard.tsx does) and re-renders.
    rerender({ state: makeState({ selectedRestaurantCamis: "41234567" }) });

    expect(replaceStateSpy).toHaveBeenCalledTimes(1);
    expect(replaceStateSpy).toHaveBeenCalledWith(
      {},
      "",
      expect.stringContaining("camis=41234567"),
    );
  });

  it("writes on the first pass when there's no initial URL state to restore", () => {
    window.history.pushState({}, "", "/");
    const replaceStateSpy = vi.spyOn(window.history, "replaceState");
    const onInit = vi.fn();

    renderHook(({ state }) => useUrlSync(state, onInit), {
      initialProps: { state: makeState() },
    });

    expect(onInit).not.toHaveBeenCalled();
    expect(replaceStateSpy).toHaveBeenCalledTimes(1);
  });
});
