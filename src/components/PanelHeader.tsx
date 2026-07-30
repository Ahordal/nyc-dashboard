// PanelHeader.tsx
//
// Reusable header displayed at the top of dashboard panels.
//
// Displays a panel title with an optional information button that
// toggles a contextual help popup.

import { useState, useRef, useEffect } from "react";
import type { ReactNode } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleInfo } from "@fortawesome/free-solid-svg-icons";

type PanelHeaderProps = {
  title: string;
  infoContent: ReactNode;
};

export default function PanelHeader({ title, infoContent }: PanelHeaderProps) {
  const [showInfo, setShowInfo] = useState(false);
  const headerRef = useRef<HTMLDivElement | null>(null);

  // Close the popup when clicking outside the header. Since every panel
  // renders its own PanelHeader, this prevents multiple help popups from
  // remaining open at the same time.

  useEffect(() => {
    if (!showInfo) return;

    function handleClickOutside(event: MouseEvent) {
      if (
        headerRef.current &&
        !headerRef.current.contains(event.target as Node)
      ) {
        setShowInfo(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showInfo]);

  return (
    <div className="panel-header" ref={headerRef}>
      <span className="panel-header-title">{title}</span>
      <button
        type="button"
        className="panel-header-info-button"
        onClick={() => setShowInfo((v) => !v)}
        aria-label={`About ${title}`}
        aria-expanded={showInfo}>
        <FontAwesomeIcon icon={faCircleInfo} />
      </button>

      {showInfo && <div className="panel-header-popup">{infoContent}</div>}
    </div>
  );
}
