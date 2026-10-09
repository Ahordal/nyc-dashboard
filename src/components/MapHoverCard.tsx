// MapHoverCard.tsx
//
// The floating card next to a restaurant dot on hover, past
// HOVER_CARD_MAX_SCALE. MapView owns hover state and show/hide; this is just the markup.
//
// Measured after render and flipped to whichever side of the cursor has
// room, so it never clips against .map-canvas-wrapper's overflow: hidden.

import { useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import InspectionBadges from "./InspectionBadges";
import { CATEGORY_COLORS, getGradeCategory } from "../utils/gradeCategory";

export type HoverCardState = {
  x: number;
  y: number;
  name: string;
  grade: string | null;
  score: number | null;
  action: string;
  featured: boolean;
};

// Offset from the cursor on its default (below-right) side.
const CURSOR_OFFSET = 12;
// Padding kept from the map canvas edges once flipped to the other side.
const EDGE_PADDING = 8;

export default function MapHoverCard({ card }: { card: HoverCardState }) {
  const color = CATEGORY_COLORS[getGradeCategory(card.action, card.grade, card.score)];
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
      <InspectionBadges
        score={card.score}
        grade={card.grade}
        action={card.action}
        featured={card.featured}
      />
    </div>
  );
}
