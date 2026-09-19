// @vitest-environment jsdom

// useBottomSheet.test.ts
//
// Unit tests for useBottomSheet: defaults, open(), and setDetent().

import { describe, it, expect } from "vitest";
import { act, renderHook } from "@testing-library/react";

import { useBottomSheet } from "./useBottomSheet";

describe("useBottomSheet", () => {
  it("defaults to peek", () => {
    const { result } = renderHook(() => useBottomSheet());
    expect(result.current.detent).toBe("peek");
  });

  it("honours a non-default initial detent", () => {
    const { result } = renderHook(() => useBottomSheet("open"));
    expect(result.current.detent).toBe("open");
  });

  it("open() sets the detent to open", () => {
    const { result } = renderHook(() => useBottomSheet());

    act(() => result.current.open());
    expect(result.current.detent).toBe("open");
  });

  it("setDetent sets an explicit detent", () => {
    const { result } = renderHook(() => useBottomSheet());

    act(() => result.current.setDetent("open"));
    expect(result.current.detent).toBe("open");
  });
});
