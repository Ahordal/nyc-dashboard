// lruMap.test.ts
//
// Unit tests for lruGet / lruSet: recency reorder on read, oldest-first
// eviction at capacity, and the overwrite-is-not-growth guarantee.

import { describe, it, expect } from "vitest";
import { lruGet, lruSet } from "./lruMap";

describe("lruGet", () => {
  it("returns undefined for a missing key and leaves the map untouched", () => {
    const map = new Map<string, number>([["a", 1]]);
    expect(lruGet(map, "b")).toBeUndefined();
    expect([...map.keys()]).toEqual(["a"]);
  });

  it("returns the value and moves the key to most-recently-used on a hit", () => {
    const map = new Map<string, number>([
      ["a", 1],
      ["b", 2],
      ["c", 3],
    ]);
    expect(lruGet(map, "a")).toBe(1);
    expect([...map.keys()]).toEqual(["b", "c", "a"]);
  });
});

describe("lruSet", () => {
  it("appends new keys as most-recently-used", () => {
    const map = new Map<string, number>();
    lruSet(map, "a", 1, 3);
    lruSet(map, "b", 2, 3);
    expect([...map.entries()]).toEqual([
      ["a", 1],
      ["b", 2],
    ]);
  });

  it("evicts the oldest key once the map is full", () => {
    const map = new Map<string, number>();
    lruSet(map, "a", 1, 2);
    lruSet(map, "b", 2, 2);
    lruSet(map, "c", 3, 2);
    expect([...map.keys()]).toEqual(["b", "c"]);
  });

  it("keeps a key alive when it was refreshed by lruGet before the flood", () => {
    const map = new Map<string, number>();
    lruSet(map, "a", 1, 2);
    lruSet(map, "b", 2, 2);
    lruGet(map, "a"); // a is now newest, b is oldest
    lruSet(map, "c", 3, 2);
    expect([...map.keys()]).toEqual(["a", "c"]);
  });

  it("overwrites an existing key in place without evicting anything", () => {
    const map = new Map<string, number>();
    lruSet(map, "a", 1, 2);
    lruSet(map, "b", 2, 2);
    lruSet(map, "a", 99, 2);
    expect([...map.entries()]).toEqual([
      ["b", 2],
      ["a", 99],
    ]);
  });
});
