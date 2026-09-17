// explorerTabs.ts
//
// Ties ExplorerTabs' <button role="tab"> elements to their <div role="tabpanel"> in dashboard.tsx.

export type ExplorerTab = "list" | "details" | "report";

export const EXPLORER_TABS: { id: ExplorerTab; label: string }[] = [
  { id: "list", label: "Restaurant List" },
  { id: "details", label: "Restaurant Details" },
  { id: "report", label: "Inspection Reports" },
];

export const tabButtonId = (tab: ExplorerTab) => `explorer-tab-${tab}`;
export const tabPanelId = (tab: ExplorerTab) => `explorer-panel-${tab}`;

// Keydown -> next index: arrows wrap, Home/End jump to ends, per the
// APG tabs pattern. Null for any other key.
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
