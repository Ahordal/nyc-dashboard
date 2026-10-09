// FeaturedInfoContent.tsx
//
// What featured restaurants are, shared by the card modal and the
// Restaurant List's header in featured mode.

import InfoPopupContent from "./InfoPopupContent";

// Mirrors the eligibility rules in pipeline/deal-cards.mjs.
const FEATURED_INFO_CONTENT = (
  <InfoPopupContent
    overview={
      <ul>
        <li>
          Each day, five independent restaurants with an A grade are featured,
          one from each borough. Each restaurant is only featured once.
        </li>

        <li>
          Today&apos;s featured restaurants have a gold ring on the map. Every
          featured restaurant keeps a gold certificate beside its grade and score.
        </li>
      </ul>
    }
    howToUse={
      <ul>
        <li>
          Select the gold certificate on the map, or Today under Featured in
          Filters, to show only today&apos;s featured restaurants; select it
          again to show all.
        </li>

        <li>
          Select the gold certificate in Restaurant Details to see a featured
          restaurant&apos;s card.
        </li>
      </ul>
    }
    dataNotes={
      <ul>
        <li>
          To be featured, a restaurant needs an A grade from an inspection in
          the last 12 months, must be open, must have a verified location, and
          must not be a chain (its name appears at fewer than three locations).
        </li>

        <li>
          An A grade can still include minor violations. A feature recognises
          the grade, not a review of the food.
        </li>

        <li>
          The card shows the grade and score from the inspection that earned
          it. The latest results are always in the restaurant&apos;s Inspection
          History.
        </li>
      </ul>
    }
  />
);

export default FEATURED_INFO_CONTENT;
