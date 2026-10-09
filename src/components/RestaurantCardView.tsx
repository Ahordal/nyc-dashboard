// RestaurantCardView.tsx
//
// Any restaurant's card, drawn from its live record by the same renderer the
// pipeline uses: coloured by its current grade or status, with the awards it
// holds now (utils/awards.ts). A loading animation holds its place while the 3D slab loads;
// the flat card shows only where 3D can't (no WebGL, or a load failure).

import { useEffect, useMemo, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faAward } from "@fortawesome/free-solid-svg-icons";

import { formatCardDate, renderCard } from "../../shared/restaurantCard.mjs";
import type { CardRestaurant } from "../../shared/restaurantCard.mjs";
import cardTemplate from "../../shared/restaurantCard.svg?raw";
import type { GradeCounts } from "../types/gradeCounts";
import type { RestaurantProperties } from "../types/restaurant";
import { heldAwards } from "../utils/awards";
import { formatDate } from "../utils/formatDate";
import { getGradeCategory, type GradeCategory } from "../utils/gradeCategory";
import { supportsWebGL } from "../utils/webgl";

// Inline, so the page's own fonts apply; the viewBox trims the template's
// shadow margin to just the card and its shadow.
const TEMPLATE_SIZE = 'width="700" height="900" viewBox="0 0 700 900"';
const CARD_VIEWBOX = 'viewBox="80 80 540 744"';

const SPOKEN_STATUS: Record<GradeCategory, string> = {
  A: "grade A",
  B: "grade B",
  C: "grade C",
  pending: "grade pending",
  uninspected: "not yet inspected",
  closed: "closed by DOHMH",
};

type RestaurantCardViewProps = {
  restaurant: RestaurantProperties;
  // Latest hand's date, so Featured joins the award row on its day.
  featuredDate: string | null;
  // Every restaurant's grade mix, drawn on the 3D card's back.
  gradeCounts: GradeCounts;
};

// The layer hands inspection_date over as epoch ms at UTC midnight (ArcGIS
// treats date-like strings as dates), despite the string type. Noon UTC on
// that day keeps it on its own calendar day in New York.
function inspectedFooter(category: GradeCategory, inspectionDate: string | number): string {
  if (category === "uninspected") return "NOT YET INSPECTED";
  const day = new Date(inspectionDate);
  const noon = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), 12));
  return `INSPECTED · ${formatCardDate(noon)}`;
}

export default function RestaurantCardView({
  restaurant,
  featuredDate,
  gradeCounts,
}: RestaurantCardViewProps) {
  const category = getGradeCategory(restaurant.action, restaurant.grade, restaurant.score);

  const card: CardRestaurant = useMemo(
    () => ({
      name: restaurant.name,
      category,
      score: category === "uninspected" ? null : restaurant.score,
      boro: restaurant.boro,
      cuisine: restaurant.cuisine,
      awards: heldAwards(restaurant, featuredDate).map(({ award }) => ({
        width: award.icon.icon[0],
        d: String(award.icon.icon[4]),
        color: award.color,
      })),
    }),
    [restaurant, category, featuredDate],
  );
  const footer = inspectedFooter(category, restaurant.inspection_date);

  const cardSvg = useMemo(
    () => renderCard(card, { template: cardTemplate, footer }).replace(TEMPLATE_SIZE, CARD_VIEWBOX),
    [card, footer],
  );

  const slabRef = useRef<HTMLDivElement>(null);
  const artRef = useRef<HTMLDivElement>(null);
  // The flat card stays in layout throughout: it sizes the stage and is
  // what the 3D card lines up with.
  const [phase, setPhase] = useState<"loading" | "3d" | "flat">(() =>
    supportsWebGL() ? "loading" : "flat",
  );
  const showSlab = phase === "3d";

  // Snapshot at open: later map updates shouldn't rebuild the scene.
  const gradeCountsRef = useRef(gradeCounts);
  gradeCountsRef.current = gradeCounts;

  useEffect(() => {
    const host = slabRef.current;
    const art = artRef.current;
    if (!host || !art || !supportsWebGL()) return;
    setPhase("loading");

    let cancelled = false;
    let teardown: (() => void) | null = null;

    (async () => {
      try {
        const { mountCardSlab, cardFontFacesCss } = await import("../utils/cardSlab");
        const fontFacesCss = await cardFontFacesCss();
        if (cancelled) return;
        const remove = await mountCardSlab(host, art, {
          cardSvg: renderCard(card, { template: cardTemplate, footer, fontFacesCss }),
          gradeCounts: gradeCountsRef.current,
          autoRotate: !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
        });
        if (cancelled) {
          remove();
          return;
        }
        teardown = remove;
        setPhase("3d");
      } catch (err) {
        console.error("RestaurantCardView: 3D card failed to load", err);
        if (!cancelled) setPhase("flat");
      }
    })();

    return () => {
      cancelled = true;
      teardown?.();
    };
  }, [card, footer]);

  const spokenScore = card.score == null ? "no score" : `score ${card.score}`;

  return (
    <div className="featured-card-body">
      <div className="restaurant-card-stage">
        {/* Rendered from our own pipeline data; renderCard escapes every text field. */}
        <div
          ref={artRef}
          className="restaurant-card-art"
          data-hidden={phase !== "flat" || undefined}
          dangerouslySetInnerHTML={{ __html: cardSvg }}
        />
        <div
          ref={slabRef}
          className="restaurant-card-slab"
          role={showSlab ? "img" : undefined}
          aria-label={
            showSlab
              ? `${restaurant.name}, ${SPOKEN_STATUS[category]}, ${spokenScore}. Rotatable 3D card.`
              : undefined
          }
          aria-hidden={showSlab ? undefined : true}
        />
        {phase === "loading" && (
          <div className="restaurant-card-loading" role="status">
            <FontAwesomeIcon icon={faAward} className="restaurant-card-loading-icon" aria-hidden="true" />
            <span className="restaurant-card-loading-label">Loading card…</span>
          </div>
        )}
      </div>

      <p className="restaurant-card-caption">
        {category === "uninspected"
          ? "Not yet inspected"
          : `Inspected · ${formatDate(restaurant.inspection_date)}`}
      </p>
      {showSlab && <p className="restaurant-card-hint">Drag to rotate · Scroll to zoom</p>}
    </div>
  );
}
