// explorerTabs.test.ts
//
// Unit tests for the Explorer tab helpers: the id builders and the
// APG-style keyboard index resolver (arrow wraparound, Home/End, and
// no-op for unrelated keys).

import { describe, it, expect } from "vitest";

import {
  EXPLORER_TABS,
  nextTabIndex,
  tabButtonId,
  tabPanelId,
} from "./explorerTabs";

const COUNT = EXPLORER_TABS.length;

describe("tab id builders", () => {
  it("derive matching button and panel ids from a tab name", () => {
    expect(tabButtonId("list")).toBe("explorer-tab-list");
    expect(tabPanelId("list")).toBe("explorer-panel-list");
    expect(tabButtonId("report")).toBe("explorer-tab-report");
  });
});

describe("nextTabIndex", () => {
  it("steps forward on ArrowRight/ArrowDown", () => {
    expect(nextTabIndex("ArrowRight", 0, COUNT)).toBe(1);
    expect(nextTabIndex("ArrowDown", 1, COUNT)).toBe(2);
  });

  it("steps backward on ArrowLeft/ArrowUp", () => {
    expect(nextTabIndex("ArrowLeft", 2, COUNT)).toBe(1);
    expect(nextTabIndex("ArrowUp", 1, COUNT)).toBe(0);
  });

  it("wraps around at both ends", () => {
    expect(nextTabIndex("ArrowRight", COUNT - 1, COUNT)).toBe(0);
    expect(nextTabIndex("ArrowLeft", 0, COUNT)).toBe(COUNT - 1);
  });

  it("jumps to the ends on Home/End", () => {
    expect(nextTabIndex("Home", 2, COUNT)).toBe(0);
    expect(nextTabIndex("End", 0, COUNT)).toBe(COUNT - 1);
  });

  it("returns null for keys it doesn't handle", () => {
    expect(nextTabIndex("Enter", 0, COUNT)).toBeNull();
    expect(nextTabIndex("a", 0, COUNT)).toBeNull();
    expect(nextTabIndex("Tab", 0, COUNT)).toBeNull();
  });
});
