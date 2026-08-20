// NoticeOverlay.tsx
//
// Generic self-dismissing notification overlay. Triggers on changes to triggerKey,
// auto-hiding after durationMs, with rAF animation frame reset to replay CSS fades.

import { useEffect, useRef, useState, type ReactNode } from "react";

type NoticeOverlayProps = {
  /** Primitive or stringified key (e.g. combined filters, sort state) that triggers the toast on change. */
  triggerKey: string | number;
  /** How long the notice stays visible before disappearing. Default is 2000ms. */
  durationMs?: number;
  children: ReactNode;
};

export default function NoticeOverlay({
  triggerKey,
  durationMs = 2000,
  children,
}: NoticeOverlayProps) {
  const [visible, setVisible] = useState(false);
  const isFirstRender = useRef(true);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Skip initial mount so toast doesn't flash on first page load
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Momentarily toggle off to restart CSS animations on quick re-triggers
    setVisible(false);

    const rafId = requestAnimationFrame(() => {
      setVisible(true);
      timeoutRef.current = setTimeout(() => {
        setVisible(false);
      }, durationMs);
    });

    return () => {
      cancelAnimationFrame(rafId);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [triggerKey, durationMs]);

  if (!visible) return null;

  return (
    <div className="filter-notice-overlay">
      <div className="filter-notice-text">{children}</div>
    </div>
  );
}