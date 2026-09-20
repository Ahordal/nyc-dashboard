// mapRenderer.test.ts
//
// pointsRenderer.valueExpression is the Arcade mirror of getGradeCategory()'s
// precedence (see mapRenderer.ts's header comment) — it isn't exported on
// its own, but its syntax here is plain JS (var/if/return, no Arcade-only
// operators besides IsEmpty), so it can run as a real function against
// sample features to catch it drifting out of sync with the other two copies.

import { describe, it, expect } from "vitest";
import { pointsRenderer } from "./mapRenderer";

type Feature = {
  current_status_code?: string;
  grade?: string | null;
  score?: number | null;
};

const isEmpty = (value: unknown) => value === null || value === undefined;

const evaluate = new Function(
  "$feature",
  "IsEmpty",
  pointsRenderer.valueExpression as string,
) as (feature: Feature, isEmptyFn: typeof isEmpty) => string;

function categoryFor(feature: Feature): string {
  return evaluate(feature, isEmpty);
}

describe("pointsRenderer's grade-category Arcade expression", () => {
  it("classifies a low score as A", () => {
    expect(categoryFor({ grade: "A", score: 13 })).toBe("A");
  });

  it("classifies a mid score as B", () => {
    expect(categoryFor({ grade: "B", score: 27 })).toBe("B");
  });

  it("classifies a high score as C", () => {
    expect(categoryFor({ grade: "C", score: 28 })).toBe("C");
  });

  it("treats a missing score as pending, not C", () => {
    expect(categoryFor({ score: null })).toBe("pending");
  });

  it.each(["Z", "P", "N"])("treats grade %s as pending", (grade) => {
    expect(categoryFor({ grade, score: 5 })).toBe("pending");
  });

  it("treats grade U as uninspected regardless of score", () => {
    expect(categoryFor({ grade: "U", score: 5 })).toBe("uninspected");
  });

  it("treats a closed status as closed regardless of grade or score", () => {
    expect(
      categoryFor({ current_status_code: "closed", grade: "A", score: 5 }),
    ).toBe("closed");
  });
});
