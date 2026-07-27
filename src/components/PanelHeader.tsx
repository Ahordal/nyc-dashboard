// PanelHeader.tsx
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

  // Since this component renders in every panel at once, closing on an
  // outside click prevents multiple popups from staying open across the
  // dashboard simultaneously with no way to dismiss them individually.
  useEffect(() => {
    if (!showInfo) return;

    function handleClickOutside(event: MouseEvent) {
      if (headerRef.current && !headerRef.current.contains(event.target as Node)) {
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
        aria-expanded={showInfo}
      >
        <FontAwesomeIcon icon={faCircleInfo} />
      </button>

      {showInfo && <div className="panel-header-popup">{infoContent}</div>}
    </div>
  );
}