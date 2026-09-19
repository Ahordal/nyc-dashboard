// toTitleCase.test.ts

import { describe, it, expect } from "vitest";
import { toTitleCase } from "./toTitleCase";

describe("toTitleCase", () => {
  it("capitalizes the first letter of each space-separated word", () => {
    expect(toTitleCase("MARY DINER")).toBe("Mary Diner");
  });

  it("capitalizes after a hyphen too", () => {
    expect(toTitleCase("MARY-KATE'S DINER")).toBe("Mary-Kate's Diner");
  });

  it("does not capitalize after an apostrophe", () => {
    expect(toTitleCase("MCDONALD'S")).toBe("Mcdonald's");
  });

  it("handles a plain single word", () => {
    expect(toTitleCase("PIZZA")).toBe("Pizza");
  });

  it("handles multiple hyphens", () => {
    expect(toTitleCase("STIR-FRY-N-GO")).toBe("Stir-Fry-N-Go");
  });

  it("returns an empty string unchanged", () => {
    expect(toTitleCase("")).toBe("");
  });
});
