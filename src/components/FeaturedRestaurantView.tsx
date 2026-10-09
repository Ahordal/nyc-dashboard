// FeaturedRestaurantView.tsx
//
// A featured restaurant's card, drawn from its dealt snapshot by the same
// renderer the pipeline uses, with the date it was featured. The flat card
// shows first; with WebGL, a rotatable 3D slab replaces it in place.

import { useEffect, useMemo, useRef, useState } from "react";

import { renderCard } from "../../shared/restaurantCard.mjs";
import cardTemplate from "../../shared/restaurantCard.svg?raw";
import type { DealtCard } from "../types/featured";
import type { GradeCounts } from "../types/gradeCounts";
import { dealtDate } from "../utils/featured";
import { formatDate } from "../utils/formatDate";
import { supportsWebGL } from "../utils/webgl";

// Inline, so the page's own fonts apply; the viewBox trims the template's
// shadow margin to just the card and its shadow.
const TEMPLATE_SIZE = 'width="700" height="900" viewBox="0 0 700 900"';
const CARD_VIEWBOX = 'viewBox="80 80 540 744"';

type FeaturedRestaurantViewProps = {
  dealt: DealtCard;
  // The map view's grade mix, drawn on the 3D card's back.
  gradeCounts: GradeCounts;
};

export default function FeaturedRestaurantView({ dealt, gradeCounts }: FeaturedRestaurantViewProps) {
  const cardSvg = useMemo(
    () =>
      renderCard(dealt.card, { template: cardTemplate, date: dealtDate(dealt.date) }).replace(
        TEMPLATE_SIZE,
        CARD_VIEWBOX,
      ),
    [dealt],
  );

  const slabRef = useRef<HTMLDivElement>(null);
  const artRef = useRef<HTMLDivElement>(null);
  const [showSlab, setShowSlab] = useState(false);

  // Snapshot at open: later map updates shouldn't rebuild the scene.
  const gradeCountsRef = useRef(gradeCounts);
  gradeCountsRef.current = gradeCounts;

  useEffect(() => {
    const host = slabRef.current;
    const art = artRef.current;
    if (!host || !art || !supportsWebGL()) return;

    let cancelled = false;
    let teardown: (() => void) | null = null;

    (async () => {
      try {
        const { mountCardSlab, cardFontFacesCss } = await import("../utils/cardSlab");
        const fontFacesCss = await cardFontFacesCss();
        if (cancelled) return;
        const remove = await mountCardSlab(host, art, {
          cardSvg: renderCard(dealt.card, {
            template: cardTemplate,
            date: dealtDate(dealt.date),
            fontFacesCss,
          }),
          gradeCounts: gradeCountsRef.current,
          autoRotate: !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
        });
        if (cancelled) {
          remove();
          return;
        }
        teardown = remove;
        setShowSlab(true);
      } catch (err) {
        // The flat card is already showing, so this is just a missed upgrade.
        console.error("FeaturedRestaurantView: 3D card failed to load", err);
      }
    })();

    return () => {
      cancelled = true;
      teardown?.();
      setShowSlab(false);
    };
  }, [dealt]);

  const { name, grade, score } = dealt.card;

  return (
    <div className="featured-card-body">
      <div className="restaurant-card-stage">
        {/* Rendered from our own pipeline data; renderCard escapes every text field. */}
        <div
          ref={artRef}
          className="restaurant-card-art"
          data-hidden={showSlab || undefined}
          dangerouslySetInnerHTML={{ __html: cardSvg }}
        />
        <div
          ref={slabRef}
          className="restaurant-card-slab"
          role={showSlab ? "img" : undefined}
          aria-label={
            showSlab
              ? `${name}, grade ${grade}, score ${score}. Rotatable 3D card.`
              : undefined
          }
          aria-hidden={showSlab ? undefined : true}
        />
      </div>

      <p className="restaurant-card-caption">Awarded · {formatDate(dealt.date)}</p>
      {showSlab && <p className="restaurant-card-hint">Drag to rotate · Scroll to zoom</p>}
    </div>
  );
}
