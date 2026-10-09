// RestaurantCardModal.tsx
//
// A featured restaurant's card in a floating modal, opened from the gold
// certificate in Restaurant Details. What the award means lives in the
// Restaurant List's featured header, not here.

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCertificate, faXmark } from "@fortawesome/free-solid-svg-icons";

import PanelInfoModal from "./PanelInfoModal";
import FeaturedRestaurantView from "./FeaturedRestaurantView";
import type { DealtCard } from "../types/featured";

type RestaurantCardModalProps = {
  dealt: DealtCard;
  isOpen: boolean;
  onClose: () => void;
};

export default function RestaurantCardModal({ dealt, isOpen, onClose }: RestaurantCardModalProps) {
  return (
    <PanelInfoModal isOpen={isOpen} onClose={onClose} ariaLabel="Featured Award">
      <div className="panel-header info-modal-panel-header">
        <h2 className="panel-header-title">
          <FontAwesomeIcon
            icon={faCertificate}
            className="panel-header-title-icon restaurant-card-modal-icon"
            aria-hidden="true"
          />
          Featured Award
        </h2>

        <button
          type="button"
          className="panel-header-info-button"
          onClick={onClose}
          aria-label="Close">
          <FontAwesomeIcon icon={faXmark} />
        </button>
      </div>

      <FeaturedRestaurantView dealt={dealt} />
    </PanelInfoModal>
  );
}
