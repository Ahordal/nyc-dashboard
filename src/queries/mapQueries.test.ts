import { describe, it, expect } from "vitest";
import {
  buildSearchClause,
  buildDefinitionExpression,
  buildGradeWhereClause,
  CATEGORY_CLAUSES,
} from "./mapQueries";
import type { Filters } from "../types/filters";

const NO_FILTERS: Filters = { grades: [], boroughs: [] };

describe("buildSearchClause", () => {
  it("returns null for an empty or whitespace-only query", () => {
    expect(buildSearchClause("")).toBeNull();
    expect(buildSearchClause("   ")).toBeNull();
  });

  it("matches nothing for a query with no searchable characters", () => {
    expect(buildSearchClause("#!~")).toBe("1=0");
  });

  it("uppercases and normalizes & into AND", () => {
    expect(buildSearchClause("mac & cheese")).toBe(
      "(UPPER(search_index) LIKE '%MAC%' AND UPPER(search_index) LIKE '%AND%' AND UPPER(search_index) LIKE '%CHEESE%')",
    );
  });

  it("strips apostrophes and periods rather than collapsing them to spaces", () => {
    expect(buildSearchClause("joe's")).toBe("(UPPER(search_index) LIKE '%JOES%')");
  });

  it("strips diacritics so an accented query still matches", () => {
    expect(buildSearchClause("café")).toBe("(UPPER(search_index) LIKE '%CAFE%')");
  });
});

describe("buildDefinitionExpression", () => {
  it("returns an empty string when nothing is active", () => {
    expect(buildDefinitionExpression(NO_FILTERS, "")).toBe("");
  });

  it("combines a borough filter and a search clause with AND", () => {
    const filters: Filters = { grades: [], boroughs: ["Manhattan", "Queens"] };
    expect(buildDefinitionExpression(filters, "pizza")).toBe(
      "boro IN ('Manhattan','Queens') AND (UPPER(search_index) LIKE '%PIZZA%')",
    );
  });

  it("applies only the borough clause when search is empty", () => {
    const filters: Filters = { grades: [], boroughs: ["Brooklyn"] };
    expect(buildDefinitionExpression(filters, "")).toBe("boro IN ('Brooklyn')");
  });
});

describe("buildGradeWhereClause", () => {
  it("returns null when no grades are selected", () => {
    expect(buildGradeWhereClause([])).toBeNull();
  });

  it("ORs together clauses for each selected grade", () => {
    expect(buildGradeWhereClause(["A", "C"])).toBe(
      `((${CATEGORY_CLAUSES.A}) OR (${CATEGORY_CLAUSES.C}))`,
    );
  });

  it("ignores an unrecognized grade key", () => {
    expect(buildGradeWhereClause(["not-a-grade"])).toBeNull();
  });
});

describe("CATEGORY_CLAUSES", () => {
  it("keeps the A/B/C score bands contiguous and non-overlapping", () => {
    expect(CATEGORY_CLAUSES.A).toContain("score <= 13");
    expect(CATEGORY_CLAUSES.B).toContain("score BETWEEN 14 AND 27");
    expect(CATEGORY_CLAUSES.C).toContain("score >= 28");
  });

  it("excludes the uninspected sentinel from every letter-grade clause", () => {
    for (const key of ["A", "B", "C"] as const) {
      expect(CATEGORY_CLAUSES[key]).toContain("'U'");
    }
  });
});
