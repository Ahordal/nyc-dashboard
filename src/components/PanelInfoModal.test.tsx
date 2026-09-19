// @vitest-environment jsdom

// PanelInfoModal.test.tsx
//
// PanelInfoModal must always give the dialog an accessible name: either
// via its own `title` (aria-labelledby), or via `ariaLabel` for callers
// that render their own heading in `children` instead - both real
// usages (DashboardGuide, PanelHeader) do the latter.

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import PanelInfoModal from "./PanelInfoModal";

afterEach(() => {
  cleanup();
});

describe("PanelInfoModal", () => {
  it("names the dialog via its own title when one is given", () => {
    render(
      <PanelInfoModal isOpen onClose={() => {}} title="Map Legend">
        <p>content</p>
      </PanelInfoModal>,
    );

    expect(screen.getByRole("dialog", { name: "Map Legend" })).toBeDefined();
  });

  it("names the dialog via ariaLabel when the caller renders its own heading", () => {
    render(
      <PanelInfoModal isOpen onClose={() => {}} ariaLabel="Dashboard Information">
        <h2>Dashboard Information</h2>
        <p>content</p>
      </PanelInfoModal>,
    );

    expect(
      screen.getByRole("dialog", { name: "Dashboard Information" }),
    ).toBeDefined();
  });

  it("renders nothing when closed", () => {
    render(
      <PanelInfoModal isOpen={false} onClose={() => {}} ariaLabel="Hidden">
        <p>content</p>
      </PanelInfoModal>,
    );

    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
