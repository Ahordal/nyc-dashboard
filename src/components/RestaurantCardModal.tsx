// RestaurantCardModal.tsx
//
// A featured restaurant's card in a floating modal, opened from the gold
// certificate in Restaurant Details. Its info button swaps in what being
// featured means.

import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCertificate, faCircleInfo, faXmark } from "@fortawesome/free-solid-svg-icons";

import PanelInfoModal from "./PanelInfoModal";
import FeaturedRestaurantView from "./FeaturedRestaurantView";
import FEATURED_INFO_CONTENT from "./FeaturedInfoContent";
import type { DealtCard } from "../types/featured";

type RestaurantCardModalProps = {
  dealt: DealtCard;
  isOpen: boolean;
  onClose: () => void;
};

export default function RestaurantCardModal({ dealt, isOpen, onClose }: RestaurantCardModalProps) {
  const [showInfo, setShowInfo] = useState(false);

  // Reopens on the card, not wherever the info toggle was left.
  const handleClose = () => {
    setShowInfo(false);
    onClose();
  };

  return (
    <PanelInfoModal isOpen={isOpen} onClose={handleClose} ariaLabel="Featured restaurant">
      <div className="panel-header info-modal-panel-header">
        <h2 className="panel-header-title">
          <FontAwesomeIcon
            icon={faCertificate}
            className="panel-header-title-icon restaurant-card-modal-icon"
            aria-hidden="true"
          />
          Featured Restaurant
        </h2>

        <div className="restaurant-card-modal-actions">
          <button
            type="button"
            className="panel-header-info-button tooltip-left"
            data-tooltip={showInfo ? undefined : "Info"}
            onClick={() => setShowInfo((current) => !current)}
            aria-label="About featured restaurants"
            aria-expanded={showInfo}>
            <FontAwesomeIcon icon={faCircleInfo} />
          </button>

          <button
            type="button"
            className="panel-header-info-button"
            onClick={handleClose}
            aria-label="Close">
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>
      </div>

      {/* The card always sizes the frame, so toggling info never resizes the modal. */}
      <div className="restaurant-card-frame" data-show-info={showInfo || undefined}>
        <FeaturedRestaurantView dealt={dealt} />
        {showInfo && <div className="restaurant-card-info">{FEATURED_INFO_CONTENT}</div>}
      </div>
    </PanelInfoModal>
  );
}
