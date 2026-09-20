// @vitest-environment jsdom

// inputModality.test.ts

import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { initInputModality } from "./inputModality";

function keydown(key: string, modifiers: Partial<KeyboardEventInit> = {}) {
  window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, ...modifiers }));
}

function pointerdown() {
  window.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
}

describe("initInputModality", () => {
  // Registers listeners once, same as the single main.tsx call site.
  beforeAll(() => {
    initInputModality();
  });

  beforeEach(() => {
    delete document.documentElement.dataset.inputModality;
  });

  it("leaves the modality unset before any input", () => {
    expect(document.documentElement.dataset.inputModality).toBeUndefined();
  });

  it("flips to keyboard on a nav key", () => {
    keydown("Tab");
    expect(document.documentElement.dataset.inputModality).toBe("keyboard");
  });

  it("flips to pointer on a pointerdown", () => {
    keydown("Tab");
    pointerdown();
    expect(document.documentElement.dataset.inputModality).toBe("pointer");
  });

  it("does not flip modality on a non-nav key", () => {
    keydown("a");
    expect(document.documentElement.dataset.inputModality).toBeUndefined();
  });

  it("ignores a nav key combined with a modifier", () => {
    keydown("Tab", { ctrlKey: true });
    expect(document.documentElement.dataset.inputModality).toBeUndefined();
  });

  it("flips back to keyboard after a pointer event", () => {
    pointerdown();
    keydown("ArrowDown");
    expect(document.documentElement.dataset.inputModality).toBe("keyboard");
  });
});
