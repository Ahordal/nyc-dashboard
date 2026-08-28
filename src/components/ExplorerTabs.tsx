// ExplorerTabs.tsx
//
// The Restaurant Explorer's view switcher, built as an ARIA tab list:
// arrow/Home/End move between tabs (with wraparound) and activate on
// focus, matching the APG tabs pattern. Each tab is wired to its pane in
// dashboard.tsx via shared id / aria-controls values (see EXPLORER_TABS).

import type { KeyboardEvent } from "react";

import {
  EXPLORER_TABS,
  nextTabIndex,
  tabButtonId,
  tabPanelId,
  type ExplorerTab,
} from "../utils/explorerTabs";

type ExplorerTabsProps = {
  activeTab: ExplorerTab;
  onTabChange: (tab: ExplorerTab) => void;
};

export default function ExplorerTabs({
  activeTab,
  onTabChange,
}: ExplorerTabsProps) {
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const currentIndex = EXPLORER_TABS.findIndex((tab) => tab.id === activeTab);
    const nextIndex = nextTabIndex(
      event.key,
      currentIndex,
      EXPLORER_TABS.length,
    );

    if (nextIndex === null) {
      return;
    }

    event.preventDefault();

    const nextTab = EXPLORER_TABS[nextIndex];
    onTabChange(nextTab.id);
    document.getElementById(tabButtonId(nextTab.id))?.focus();
  }

  return (
    <div
      className="explorer-tabs"
      role="tablist"
      aria-label="Restaurant explorer views"
      onKeyDown={handleKeyDown}>
      {EXPLORER_TABS.map((tab) => {
        const isActive = tab.id === activeTab;

        return (
          <button
            key={tab.id}
            type="button"
            id={tabButtonId(tab.id)}
            role="tab"
            aria-selected={isActive}
            aria-controls={tabPanelId(tab.id)}
            tabIndex={isActive ? 0 : -1}
            className={isActive ? "explorer-tab active" : "explorer-tab"}
            onClick={() => onTabChange(tab.id)}>
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
