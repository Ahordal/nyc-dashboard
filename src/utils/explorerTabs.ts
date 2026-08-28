// explorerTabs.ts
//
// Shared identity for the Restaurant Explorer's tabs: the tab order and
// the id helpers that tie each <button role="tab"> in ExplorerTabs to its
// <div role="tabpanel"> in dashboard.tsx.

export type ExplorerTab = "list" | "details" | "report";

export const EXPLORER_TABS: { id: ExplorerTab; label: string }[] = [
  { id: "list", label: "Restaurant List" },
  { id: "details", label: "Restaurant Details" },
  { id: "report", label: "Inspection Reports" },
];

export const tabButtonId = (tab: ExplorerTab) => `explorer-tab-${tab}`;
export const tabPanelId = (tab: ExplorerTab) => `explorer-panel-${tab}`;

// Maps a keydown on the tab list to the index that should receive focus
// next, following the APG tabs pattern: Left/Up and Right/Down step with
// wraparound, Home/End jump to the ends. Returns null for any other key
// (the handler then leaves the event alone).
export function nextTabIndex(
  key: string,
  currentIndex: number,
  tabCount: number,
): number | null {
  switch (key) {
    case "ArrowRight":
    case "ArrowDown":
      return (currentIndex + 1) % tabCount;
    case "ArrowLeft":
    case "ArrowUp":
      return (currentIndex - 1 + tabCount) % tabCount;
    case "Home":
      return 0;
    case "End":
      return tabCount - 1;
    default:
      return null;
  }
}
