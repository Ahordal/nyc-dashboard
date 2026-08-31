// reportInspection.test.ts
//
// Unit tests for resolveReportInspectionId: honour a valid selection,
// fall back to the latest event when the selection is stale or absent.

import { describe, it, expect } from "vitest";
import { resolveReportInspectionId } from "./reportInspection";
import type { InspectionEvent } from "../types/restaurant";

const event = (id: string): InspectionEvent => ({
  id,
  date: "2024-01-01",
  score: null,
  grade: null,
  inspection_type: "Cycle Inspection",
  action: "Violations were cited in the following area(s).",
  violations: [],
});

describe("resolveReportInspectionId", () => {
  const history = [event("i1"), event("i2"), event("i3")];

  it("returns the selected id when it belongs to the current history", () => {
    expect(resolveReportInspectionId("i2", history)).toBe("i2");
  });

  it("falls back to the latest event when the selection is stale", () => {
    expect(resolveReportInspectionId("gone", history)).toBe("i3");
  });

  it("falls back to the latest event when nothing is selected", () => {
    expect(resolveReportInspectionId(null, history)).toBe("i3");
  });

  it("returns null for empty history with nothing selected", () => {
    expect(resolveReportInspectionId(null, [])).toBeNull();
  });

  it("returns null for empty history even with a stale selection", () => {
    expect(resolveReportInspectionId("i1", [])).toBeNull();
  });
});
