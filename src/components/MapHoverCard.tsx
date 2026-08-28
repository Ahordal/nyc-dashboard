// MapHoverCard.tsx
//
// The small floating card shown next to a restaurant dot on hover, once
// the map is zoomed in past MapView's HOVER_CARD_MAX_SCALE. MapView owns
// the hover state and the show/hide logic; this file is just the markup.

import { CATEGORY_COLORS } from "../utils/gradeColours";

export type HoverCardState = {
  x: number;
  y: number;
  name: string;
  category: keyof typeof CATEGORY_COLORS;
  gradeText: string;
  scoreText: string;
};

export default function MapHoverCard({ card }: { card: HoverCardState }) {
  const color = CATEGORY_COLORS[card.category];

  return (
    <div
      className="map-hover-card"
      style={{
        position: "absolute",
        left: card.x + 12,
        top: card.y + 12,
        pointerEvents: "none",
      }}>
      <span className="map-hover-card-name" style={{ color }}>
        {card.name}
      </span>
      <div className="map-hover-card-stats">
        <div className="badge-box">
          <span className="badge-label">GRADE</span>
          <span className="badge-val" style={{ color }}>
            {card.gradeText}
          </span>
        </div>
        <div className="badge-box">
          <span className="badge-label">SCORE</span>
          <span className="badge-val" style={{ color }}>
            {card.scoreText}
          </span>
        </div>
      </div>
    </div>
  );
}
