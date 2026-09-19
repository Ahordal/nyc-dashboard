// formatDate.test.ts

import { describe, it, expect } from "vitest";
import { formatDate } from "./formatDate";

describe("formatDate", () => {
  it("formats a valid ISO date as a UTC display date", () => {
    expect(formatDate("2026-01-15T00:00:00.000Z")).toBe("1/15/2026");
  });

  it("returns an em dash for null", () => {
    expect(formatDate(null)).toBe("—");
  });

  it("returns an em dash for an unparseable string", () => {
    expect(formatDate("not a date")).toBe("—");
  });
});
