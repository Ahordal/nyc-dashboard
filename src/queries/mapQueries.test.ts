import { describe, it, expect } from "vitest";
import {
  buildSearchClause,
  buildDefinitionExpression,
  buildGradeWhereClause,
  queryVisibleRestaurants,
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

// A stand-in GeoJSONLayer that records every query it's asked to run,
// so the tests can assert on how queryVisibleRestaurants shaped them
// without loading the ArcGIS SDK's real layer machinery.
function makeFakeLayer(
  pages: { features: { attributes: Record<string, unknown> }[]; exceededTransferLimit: boolean }[],
) {
  const captured: Record<string, unknown>[] = [];
  let pageIndex = 0;

  const layer = {
    definitionExpression: null as string | null,
    loadCount: 0,
    async load() {
      this.loadCount += 1;
    },
    createQuery() {
      const query: Record<string, unknown> = {
        clone() {
          return { ...this };
        },
      };
      return query;
    },
    async queryFeatures(query: Record<string, unknown>) {
      captured.push(query);
      const page = pages[Math.min(pageIndex, pages.length - 1)];
      pageIndex += 1;
      return page;
    },
    captured,
  };

  return layer;
}

const ONE_EMPTY_PAGE = [{ features: [], exceededTransferLimit: false }];

describe("queryVisibleRestaurants", () => {
  it("queries the map extent when no radius is passed", async () => {
    const layer = makeFakeLayer(ONE_EMPTY_PAGE);
    const view = { extent: { type: "extent", xmin: 1 } };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await queryVisibleRestaurants(view as any, layer as any);

    const q = layer.captured[0];
    expect(q.geometry).toBe(view.extent);
    expect(q.distance).toBeUndefined();
    expect(q.units).toBeUndefined();
    expect(q.spatialRelationship).toBe("intersects");
    expect(layer.loadCount).toBe(1);
  });

  it("queries a point + distance in miles when a radius is passed", async () => {
    const layer = makeFakeLayer(ONE_EMPTY_PAGE);
    const view = { extent: { type: "extent", xmin: 1 } };
    const radius = {
      point: { longitude: -73.9855, latitude: 40.758 },
      miles: 0.5,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await queryVisibleRestaurants(view as any, layer as any, radius);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const geometry = layer.captured[0].geometry as any;
    expect(geometry.type).toBe("point");
    expect(geometry.longitude).toBeCloseTo(-73.9855, 6);
    expect(geometry.latitude).toBeCloseTo(40.758, 6);
    expect(layer.captured[0].distance).toBe(0.5);
    expect(layer.captured[0].units).toBe("miles");
    expect(layer.captured[0].geometry).not.toBe(view.extent);
  });

  it("falls back to 1=1 when the layer has no definitionExpression", async () => {
    const layer = makeFakeLayer(ONE_EMPTY_PAGE);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await queryVisibleRestaurants({ extent: {} } as any, layer as any);
    expect(layer.captured[0].where).toBe("1=1");
  });

  it("passes the layer's definitionExpression through as the where clause", async () => {
    const layer = makeFakeLayer(ONE_EMPTY_PAGE);
    layer.definitionExpression = "boro IN ('Brooklyn')";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await queryVisibleRestaurants({ extent: {} } as any, layer as any);
    expect(layer.captured[0].where).toBe("boro IN ('Brooklyn')");
  });

  it("pages until exceededTransferLimit clears, advancing start each time", async () => {
    const layer = makeFakeLayer([
      {
        features: [{ attributes: { id: "a" } }],
        exceededTransferLimit: true,
      },
      {
        features: [{ attributes: { id: "b" } }],
        exceededTransferLimit: false,
      },
    ]);

    const result = await queryVisibleRestaurants(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { extent: {} } as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      layer as any,
    );

    expect(result.map((r) => r.id)).toEqual(["a", "b"]);
    expect(layer.captured).toHaveLength(2);
    expect(layer.captured[0].start).toBe(0);
    expect(layer.captured[1].start).toBe(2000);
  });

  it("stops paging on an empty page even if the limit flag is still set", async () => {
    const layer = makeFakeLayer([
      { features: [], exceededTransferLimit: true },
    ]);
    const result = await queryVisibleRestaurants(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { extent: {} } as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      layer as any,
    );
    expect(result).toEqual([]);
    expect(layer.captured).toHaveLength(1);
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
