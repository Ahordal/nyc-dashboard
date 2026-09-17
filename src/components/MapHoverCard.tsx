// MapHoverCard.tsx
//
// The small floating card shown next to a restaurant dot on hover, once
// the map is zoomed in past MapView's HOVER_CARD_MAX_SCALE. MapView owns
// the hover state and the show/hide logic; this file is just the markup.
//
// The card is measured after render and flipped to whichever side of the
// cursor has room, so it never gets clipped by .map-canvas-wrapper's
// overflow: hidden near a map edge.

import { useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { CATEGORY_COLORS } from "../utils/gradeCategory";

export type HoverCardState = {
  x: number;
  y: number;
  name: string;
  category: keyof typeof CATEGORY_COLORS;
  gradeText: string;
  scoreText: string;
};

// Offset from the cursor on its default (below-right) side.
const CURSOR_OFFSET = 12;
// Padding kept from the map canvas edges once flipped to the other side.
const EDGE_PADDING = 8;

export default function MapHoverCard({ card }: { card: HoverCardState }) {
  const color = CATEGORY_COLORS[card.category];
  const cardRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>({ visibility: "hidden" });

  useLayoutEffect(() => {
    const el = cardRef.current;
    const container = el?.offsetParent as HTMLElement | null;
    if (!el || !container) return;

    const cardWidth = el.offsetWidth;
    const cardHeight = el.offsetHeight;
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;

    const fitsRight =
      card.x + CURSOR_OFFSET + cardWidth <= containerWidth - EDGE_PADDING;
    const left = fitsRight
      ? card.x + CURSOR_OFFSET
      : card.x - CURSOR_OFFSET - cardWidth;

    const fitsBelow =
      card.y + CURSOR_OFFSET + cardHeight <= containerHeight - EDGE_PADDING;
    const top = fitsBelow
      ? card.y + CURSOR_OFFSET
      : card.y - CURSOR_OFFSET - cardHeight;

    setStyle({ left, top, visibility: "visible" });
  }, [card]);

  return (
    <div className="map-hover-card" ref={cardRef} style={style}>
      <span className="map-hover-card-name" style={{ color }}>
        {card.name}
      </span>
      <div className="map-hover-card-stats">
        <div
          className="badge-box"
          style={{
            borderColor: `color-mix(in srgb, ${color} 80%, transparent)`,
          }}>
          <span className="badge-label">GRADE</span>
          <span className="badge-val" style={{ color }}>
            {card.gradeText}
          </span>
        </div>
        <div
          className="badge-box"
          style={{
            borderColor: `color-mix(in srgb, ${color} 80%, transparent)`,
          }}>
          <span className="badge-label">SCORE</span>
          <span className="badge-val" style={{ color }}>
            {card.scoreText}
          </span>
        </div>
      </div>
    </div>
  );
}
