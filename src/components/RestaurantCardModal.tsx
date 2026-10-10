// RestaurantCardModal.tsx
//
// Any restaurant's card in a floating modal, opened from Restaurant Details:
// the rotatable card on the left, its awards and statistics on the right. On
// phones the panel folds into a bar under the card and slides up over it, so
// the modal never changes size.

import { useId, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faAward, faChevronUp, faXmark } from "@fortawesome/free-solid-svg-icons";

import AwardsPanel from "./AwardsPanel";
import ErrorBoundary from "./ErrorBoundary";
import PanelInfoModal from "./PanelInfoModal";
import RestaurantCardView from "./RestaurantCardView";
import type { AwardCounts } from "../types/dashboardMeta";
import type { GradeCounts } from "../types/gradeCounts";
import type { InspectionEvent, RestaurantProperties } from "../types/restaurant";
import { AWARDS, heldAwards } from "../utils/awards";

type RestaurantCardModalProps = {
  restaurant: RestaurantProperties;
  featuredDate: string | null;
  gradeCounts: GradeCounts;
  awardCounts: AwardCounts | null;
  history: InspectionEvent[];
  isLoadingHistory: boolean;
  isOpen: boolean;
  onClose: () => void;
};

export default function RestaurantCardModal({
  restaurant,
  featuredDate,
  gradeCounts,
  awardCounts,
  history,
  isLoadingHistory,
  isOpen,
  onClose,
}: RestaurantCardModalProps) {
  const panelId = useId();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Reopening starts on the card, not wherever the drawer was left.
  const handleClose = () => {
    setIsDrawerOpen(false);
    onClose();
  };

  const held = heldAwards(restaurant, featuredDate);

  return (
    <PanelInfoModal
      isOpen={isOpen}
      onClose={handleClose}
      ariaLabel="Awards & Statistics"
      className="awards-modal">
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
          onClick={handleClose}
          aria-label="Close">
          <FontAwesomeIcon icon={faXmark} />
        </button>
      </div>

      <div className="awards-modal-body">
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

        <div className="awards-modal-panel" data-open={isDrawerOpen}>
          {/* Phones only; CSS hides it where the panel has its own column. */}
          <button
            type="button"
            className="awards-drawer-toggle"
            onClick={() => setIsDrawerOpen((open) => !open)}
            aria-expanded={isDrawerOpen}
            aria-controls={panelId}>
            <span>
              Awards <span className="awards-drawer-count">{held.length} of {AWARDS.length}</span>
            </span>
            <span className="awards-drawer-preview" aria-hidden="true">
              {held.map(({ award }) => (
                <FontAwesomeIcon key={award.id} icon={award.icon} style={{ color: award.color }} />
              ))}
            </span>
            <FontAwesomeIcon icon={faChevronUp} className="awards-drawer-chevron" aria-hidden="true" />
          </button>

          <div id={panelId} className="awards-modal-panel-content">
            <AwardsPanel
              restaurant={restaurant}
              featuredDate={featuredDate}
              awardCounts={awardCounts}
              history={history}
              isLoadingHistory={isLoadingHistory}
            />
          </div>
        </div>
      </div>
    </PanelInfoModal>
  );
}
