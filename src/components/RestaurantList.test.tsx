// @vitest-environment jsdom

// RestaurantList.test.tsx
//
// Two effects independently call setPage when the list changes: one
// tracks the selected restaurant's page, one clamps `page` back into
// range if the list shrank. Both used to read `page` from the same
// stale render, so the clamp effect could override the tracking
// effect's correct target with page 1 in the same commit.

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { RestaurantProperties } from "../types/restaurant";

vi.mock("./PanelHeader", () => ({ default: () => null }));
vi.mock("./SortDropdown", () => ({ default: () => null }));
vi.mock("./NoticeOverlay", () => ({ default: () => null }));
vi.mock("./RestaurantCard", () => ({
  default: ({ restaurant }: { restaurant: RestaurantProperties }) => (
    <div>{restaurant.name}</div>
  ),
}));
vi.mock("./PaginationBar", () => ({
  default: ({ currentPage, totalPages }: { currentPage: number; totalPages: number }) => (
    <div data-testid="pagination">
      Page {currentPage} of {totalPages}
    </div>
  ),
}));

import RestaurantList from "./RestaurantList";

// jsdom doesn't implement Element.scrollTo; the page-change effect calls it.
Element.prototype.scrollTo = vi.fn();

afterEach(() => cleanup());

function makeRestaurant(id: string, date: string): RestaurantProperties {
  return {
    id,
    camis: id,
    name: id,
    search_index: id,
    boro: "Queens",
    building: "1",
    street: "Main St",
    display_street: "Main Street",
    zipcode: "11111",
    phone: "",
    cuisine: "American",
    location_status: "verified",
    grade: "A",
    score: 10,
    inspection_date: date,
    inspection_type: "Cycle Inspection",
    action: "No violations were recorded at the time of this inspection.",
    current_status_code: "open",
    current_status_label: "Open",
  };
}

// r0 (newest) .. r49 (oldest), one day apart - sorted index matches suffix.
const initialRestaurants = Array.from({ length: 50 }, (_, i) =>
  makeRestaurant(`r${i}`, `2026-06-19T00:00:00.000Z`.replace("19", String(19 - i).padStart(2, "0"))),
);

describe("RestaurantList pagination", () => {
  it("does not strand the selected restaurant on page 1 when the list shrinks but it's still on page 2", async () => {
    const { rerender } = render(
      <RestaurantList
        restaurants={initialRestaurants}
        selectedRestaurantId="r45"
      />,
    );

    // r45 is index 45 of 50 -> page 5.
    expect(await screen.findByText("Page 5 of 5")).toBeDefined();

    // New list: 14 restaurants newer than r45, plus r45 itself (still
    // selected) - r45 is now the oldest of 15, landing at index 14 ->
    // page 2. The pre-shrink page (5) is well past the new pageCount (2),
    // which is exactly what makes the clamp-to-range effect fire too.
    const newer = Array.from({ length: 14 }, (_, i) =>
      makeRestaurant(`n${i}`, `2027-01-14T00:00:00.000Z`.replace("14", String(14 - i).padStart(2, "0"))),
    );
    const shrunk = [...newer, ...initialRestaurants.filter((r) => r.id === "r45")];

    rerender(<RestaurantList restaurants={shrunk} selectedRestaurantId="r45" />);

    expect(await screen.findByText("Page 2 of 2")).toBeDefined();
    expect(screen.getByText("r45")).toBeDefined();
  });
});
