// @vitest-environment jsdom

// InspectionBadges.test.tsx
//
// A null score must categorize as "pending" (getGradeCategory's own
// documented rule), not get coerced to 0 and land in the Grade A band.

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import InspectionBadges from "./InspectionBadges";
import { CATEGORY_COLORS } from "../utils/gradeColours";

afterEach(() => cleanup());

// jsdom normalizes inline hex colors to rgb() when read back off the style.
function hexToRgb(hex: string): string {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgb(${r}, ${g}, ${b})`;
}

describe("InspectionBadges", () => {
  it("categorizes a null score as pending, not Grade A", () => {
    render(<InspectionBadges score={null} grade={null} action="some action" />);

    // Grade and score boxes both fall back to "N/A" here; the score box is second.
    const scoreVal = screen.getAllByText("N/A")[1];
    expect(scoreVal.style.color).toBe(hexToRgb(CATEGORY_COLORS.pending));
  });

  it("categorizes a real score into the correct A/B/C band", () => {
    render(<InspectionBadges score={10} grade="A" action="some action" />);

    const scoreVal = screen.getByText("10");
    expect(scoreVal.style.color).toBe(hexToRgb(CATEGORY_COLORS.A));
  });
});
