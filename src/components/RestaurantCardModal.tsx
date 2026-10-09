// RestaurantCardModal.tsx
//
// Any restaurant's card in a floating modal, opened from Restaurant
// Details. The card carries the awards it holds now; the right-hand panel
// (awards list and statistics) is still to come.

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faAward, faXmark } from "@fortawesome/free-solid-svg-icons";

import ErrorBoundary from "./ErrorBoundary";
import PanelInfoModal from "./PanelInfoModal";
import RestaurantCardView from "./RestaurantCardView";
import type { GradeCounts } from "../types/gradeCounts";
import type { RestaurantProperties } from "../types/restaurant";

type RestaurantCardModalProps = {
  restaurant: RestaurantProperties;
  featuredDate: string | null;
  gradeCounts: GradeCounts;
  isOpen: boolean;
  onClose: () => void;
};

export default function RestaurantCardModal({
  restaurant,
  featuredDate,
  gradeCounts,
  isOpen,
  onClose,
}: RestaurantCardModalProps) {
  return (
    <PanelInfoModal isOpen={isOpen} onClose={onClose} ariaLabel="Awards & Statistics">
      <div className="panel-header info-modal-panel-header">
        <h2 className="panel-header-title">
          <FontAwesomeIcon
            icon={faAward}
            className="panel-header-title-icon restaurant-card-modal-icon"
            aria-hidden="true"
          />
          Awards &amp; Statistics
        </h2>

        <button
          type="button"
          className="panel-header-info-button"
          onClick={onClose}
          aria-label="Close">
          <FontAwesomeIcon icon={faXmark} />
        </button>
      </div>

      {/* A card failure stays in the modal instead of blanking the dashboard. */}
      <ErrorBoundary
        context="restaurant card"
        resetKey={restaurant.id}
        fallback={<p className="restaurant-card-caption">This card couldn&apos;t be drawn.</p>}>
        <RestaurantCardView
          restaurant={restaurant}
          featuredDate={featuredDate}
          gradeCounts={gradeCounts}
        />
      </ErrorBoundary>
    </PanelInfoModal>
  );
}
