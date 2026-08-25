import { describe, it, expect } from "vitest";
import { getGradeCategory, isClosedInspection, UNINSPECTED_GRADE } from "./gradeCategory";
import { CLOSED_ACTIONS } from "../../shared/inspectionStatus.mjs";

describe("isClosedInspection", () => {
  it("returns true for every recognized closure action", () => {
    for (const action of CLOSED_ACTIONS) {
      expect(isClosedInspection(action)).toBe(true);
    }
  });

  it("returns false for a non-closure action", () => {
    expect(isClosedInspection("Violations were cited in the following area(s).")).toBe(false);
  });
});

describe("getGradeCategory", () => {
  const [closedAction] = CLOSED_ACTIONS;

  it("takes closure precedence over any grade or score", () => {
    expect(getGradeCategory(closedAction, "A", 5)).toBe("closed");
  });

  it("returns uninspected for the sentinel grade", () => {
    expect(getGradeCategory("some action", UNINSPECTED_GRADE, null)).toBe("uninspected");
  });

  it.each(["Z", "P", "N"])("returns pending for administrative grade %s", (grade) => {
    expect(getGradeCategory("some action", grade, null)).toBe("pending");
  });

  it("treats a null score as pending rather than coercing to A", () => {
    expect(getGradeCategory("some action", null, null)).toBe("pending");
  });

  it("returns A at the low end and boundary of the A band", () => {
    expect(getGradeCategory("some action", "A", 0)).toBe("A");
    expect(getGradeCategory("some action", "A", 13)).toBe("A");
  });

  it("returns B just above the A boundary and at the B boundary", () => {
    expect(getGradeCategory("some action", "B", 14)).toBe("B");
    expect(getGradeCategory("some action", "B", 27)).toBe("B");
  });

  it("returns C just above the B boundary", () => {
    expect(getGradeCategory("some action", "C", 28)).toBe("C");
    expect(getGradeCategory("some action", "C", 500)).toBe("C");
  });
});
