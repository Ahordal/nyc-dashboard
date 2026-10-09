// FeaturedRestaurantView.tsx
//
// A featured restaurant's card, drawn from its dealt snapshot by the same
// renderer the pipeline uses, with the date it was featured.

import { useMemo } from "react";

import { renderCard } from "../../shared/restaurantCard.mjs";
import cardTemplate from "../../shared/restaurantCard.svg?raw";
import type { DealtCard } from "../types/featured";
import { dealtDate } from "../utils/featured";
import { formatDate } from "../utils/formatDate";

// Inline, so the page's own fonts apply; the viewBox trims the template's
// shadow margin to just the card and its shadow.
const TEMPLATE_SIZE = 'width="700" height="900" viewBox="0 0 700 900"';
const CARD_VIEWBOX = 'viewBox="80 80 540 744"';

type FeaturedRestaurantViewProps = {
  dealt: DealtCard;
};

export default function FeaturedRestaurantView({ dealt }: FeaturedRestaurantViewProps) {
  const cardSvg = useMemo(
    () =>
      renderCard(dealt.card, { template: cardTemplate, date: dealtDate(dealt.date) }).replace(
        TEMPLATE_SIZE,
        CARD_VIEWBOX,
      ),
    [dealt],
  );

  return (
    <div className="featured-card-body">
      {/* Rendered from our own pipeline data; renderCard escapes every text field. */}
      <div className="restaurant-card-art" dangerouslySetInnerHTML={{ __html: cardSvg }} />

      <p className="restaurant-card-caption">Featured · {formatDate(dealt.date)}</p>
    </div>
  );
}
