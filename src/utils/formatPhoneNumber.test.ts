// formatPhoneNumber.test.ts

import { describe, it, expect } from "vitest";
import { formatPhoneNumber } from "./formatPhoneNumber";

describe("formatPhoneNumber", () => {
  it("formats a 10-digit number", () => {
    expect(formatPhoneNumber("2125551234")).toBe("(212) - 555 - 1234");
  });

  it("strips non-digit characters before formatting", () => {
    expect(formatPhoneNumber("(212) 555-1234")).toBe("(212) - 555 - 1234");
  });

  it("passes through a number with too few digits unchanged", () => {
    expect(formatPhoneNumber("5551234")).toBe("5551234");
  });

  it("passes through a number with too many digits unchanged", () => {
    expect(formatPhoneNumber("12125551234")).toBe("12125551234");
  });

  it("returns an empty string for null", () => {
    expect(formatPhoneNumber(null)).toBe("");
  });

  it("returns an empty string for undefined", () => {
    expect(formatPhoneNumber(undefined)).toBe("");
  });

  it("returns an empty string for an empty input", () => {
    expect(formatPhoneNumber("")).toBe("");
  });
});
