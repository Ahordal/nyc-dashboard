// FeaturedInfoContent.tsx
//
// What featured restaurants are, shown in the
// Restaurant List's header in featured mode.

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faStar } from "@fortawesome/free-solid-svg-icons";
import InfoPopupContent from "./InfoPopupContent";

// Mirrors the eligibility rules in pipeline/deal-cards.mjs.
const FEATURED_INFO_CONTENT = (
  <InfoPopupContent
    overview={
      <ul>
        <li>
          Each day, five independent restaurants with an A on their last two
          graded inspections are featured, one from each borough. A
          restaurant can be featured again after a year.
        </li>

        <li>
          Today&apos;s featured restaurants have a gold ring on the map.
        </li>

        <li>
          The gold star{" "}
          <FontAwesomeIcon
            icon={faStar}
            className="legend-featured-text"
            aria-hidden="true"
          />{" "}
          beside a grade and score marks today&apos;s featured restaurants.
          It passes to the next five each day; Restaurant Details keeps the
          date a restaurant was featured.
        </li>
      </ul>
    }
    howToUse={
      <ul>
        <li>
          Select the gold star on the map, or Today under Featured in
          Filters, to show only today&apos;s featured restaurants; select it
          again to show all.
        </li>

        <li>
          Select the gold Awards button in Restaurant Details to see a
          featured restaurant&apos;s card, with the star among its awards.
        </li>
      </ul>
    }
    dataNotes={
      <ul>
        <li>
          To be featured, a restaurant needs an A grade from an inspection in
          the last 12 months and an A on the graded inspection before that,
          must be open, must have a verified location, must not be a chain
          (its name, ignoring store numbers, appears at fewer than three
          locations), and must not have been featured in the past year.
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
