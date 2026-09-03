// @vitest-environment jsdom

// useBottomSheet.test.ts
//
// Unit tests for useBottomSheet: the handle toggle and the
// open / collapse helpers.

import { describe, it, expect } from "vitest";
import { act, renderHook } from "@testing-library/react";

import { useBottomSheet } from "./useBottomSheet";

describe("useBottomSheet", () => {
  it("defaults to peek and toggles peek <-> open", () => {
    const { result } = renderHook(() => useBottomSheet());

    expect(result.current.detent).toBe("peek");

    act(() => result.current.toggle());
    expect(result.current.detent).toBe("open");

    act(() => result.current.toggle());
    expect(result.current.detent).toBe("peek");
  });

  it("honours a non-default initial detent", () => {
    const { result } = renderHook(() => useBottomSheet("open"));
    expect(result.current.detent).toBe("open");
  });

  it("open() and collapse() set an explicit detent", () => {
    const { result } = renderHook(() => useBottomSheet());

    act(() => result.current.open());
    expect(result.current.detent).toBe("open");

    act(() => result.current.collapse());
    expect(result.current.detent).toBe("peek");
  });

  it("setDetent sets an explicit detent", () => {
    const { result } = renderHook(() => useBottomSheet());

    act(() => result.current.setDetent("open"));
    expect(result.current.detent).toBe("open");
  });
});
