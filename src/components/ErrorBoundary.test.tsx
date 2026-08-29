// @vitest-environment jsdom

// ErrorBoundary.test.tsx
//
// Unit tests for ErrorBoundary: passes children through untouched,
// swaps in the fallback once a child throws, clears the error when
// resetKey changes, and stays in the fallback while resetKey holds.

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import ErrorBoundary from "./ErrorBoundary";

// A child that throws on demand, so a single test can render it both
// broken and healthy.
function Bomb({ explode }: { explode: boolean }) {
  if (explode) {
    throw new Error("boom");
  }
  return <div>healthy child</div>;
}

// This project runs Vitest without `globals`, so Testing Library's
// automatic per-test cleanup isn't registered - do it by hand.
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ErrorBoundary", () => {
  it("renders children when nothing throws", () => {
    render(
      <ErrorBoundary fallback={<div>fallback</div>}>
        <div>healthy child</div>
      </ErrorBoundary>,
    );

    expect(screen.getByText("healthy child")).toBeDefined();
    expect(screen.queryByText("fallback")).toBeNull();
  });

  it("renders the fallback once a child throws", () => {
    // React logs the caught error to console.error; silence it so the
    // test output stays readable.
    vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <ErrorBoundary fallback={<div>fallback</div>}>
        <Bomb explode />
      </ErrorBoundary>,
    );

    expect(screen.getByText("fallback")).toBeDefined();
    expect(screen.queryByText("healthy child")).toBeNull();
  });

  it("clears the error and re-renders children when resetKey changes", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    const { rerender } = render(
      <ErrorBoundary fallback={<div>fallback</div>} resetKey="a">
        <Bomb explode />
      </ErrorBoundary>,
    );

    expect(screen.getByText("fallback")).toBeDefined();

    // New resetKey + a child that no longer throws: the boundary should
    // drop the error and show the children again.
    rerender(
      <ErrorBoundary fallback={<div>fallback</div>} resetKey="b">
        <Bomb explode={false} />
      </ErrorBoundary>,
    );

    expect(screen.getByText("healthy child")).toBeDefined();
    expect(screen.queryByText("fallback")).toBeNull();
  });

  it("stays in the fallback when resetKey is unchanged", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    const { rerender } = render(
      <ErrorBoundary fallback={<div>fallback</div>} resetKey="a">
        <Bomb explode />
      </ErrorBoundary>,
    );

    expect(screen.getByText("fallback")).toBeDefined();

    rerender(
      <ErrorBoundary fallback={<div>fallback</div>} resetKey="a">
        <Bomb explode={false} />
      </ErrorBoundary>,
    );

    expect(screen.getByText("fallback")).toBeDefined();
    expect(screen.queryByText("healthy child")).toBeNull();
  });
});
