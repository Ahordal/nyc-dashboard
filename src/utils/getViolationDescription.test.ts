// getViolationDescription.test.ts

import { describe, it, expect } from "vitest";
import { getViolationDescription } from "./getViolationDescription";
import type { ViolationCodeDetails } from "../types/restaurant";

describe("getViolationDescription", () => {
  it("returns a string entry as-is", () => {
    const entry = "Raw description string" as unknown as ViolationCodeDetails;
    expect(getViolationDescription(entry)).toBe("Raw description string");
  });

  it("returns the description field of an object entry", () => {
    const entry: ViolationCodeDetails = {
      description: "Facility not vermin proof",
      category: "critical",
    };
    expect(getViolationDescription(entry)).toBe("Facility not vermin proof");
  });

  it("falls back to a placeholder when the entry is undefined", () => {
    expect(getViolationDescription(undefined)).toBe("Description unavailable");
  });
});
