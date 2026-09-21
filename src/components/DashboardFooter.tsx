// DashboardFooter.tsx
//
// Site-level attribution bar spanning the full width of the dashboard.

import { useState } from "react";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faLinkedin,
  faGithub,
} from "@fortawesome/free-brands-svg-icons";
import { faXmark } from "@fortawesome/free-solid-svg-icons";

import PanelInfoModal from "./PanelInfoModal";
import PrivacyPolicyContent from "./PrivacyPolicyContent";

export default function DashboardFooter() {
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);

  return (
    <footer className="dashboard-footer-bar">
      <div className="footer-location">
        <span className="footer-location-label">LOC: NYC, NY</span>

        <span className="footer-location-coords">
          // &nbsp; 40.71&deg; N, 74.01&deg; W
        </span>
      </div>

      <div className="footer-links">
        <a href="https://alexhordal.ca" target="_blank" rel="noreferrer">
          alexhordal.ca
        </a>

        <span className="footer-divider">|</span>

        <a
          href="https://opendata.cityofnewyork.us/"
          target="_blank"
          rel="noreferrer">
          NYC Open Data
        </a>

        <span className="footer-divider">|</span>

        <button
          type="button"
          className="footer-link-button"
          onClick={() => setShowPrivacyModal(true)}
        >
          Privacy Policy
        </button>

        <span className="footer-divider">|</span>

        <a
          href="https://www.linkedin.com/in/alex-hordal/"
          target="_blank"
          rel="noreferrer"
          aria-label="LinkedIn">
          <FontAwesomeIcon icon={faLinkedin} aria-hidden="true" />
        </a>

        <a
          href="https://github.com/Ahordal/nyc-dashboard"
          target="_blank"
          rel="noreferrer"
          aria-label="GitHub repository">
          <FontAwesomeIcon icon={faGithub} aria-hidden="true" />
        </a>
      </div>

      <div className="footer-copyright">&copy; Alex Hordal 2026</div>

      <PanelInfoModal
        isOpen={showPrivacyModal}
        onClose={() => setShowPrivacyModal(false)}
        ariaLabel="Privacy Policy"
      >
        <div className="panel-header info-modal-panel-header">
          <h2 className="panel-header-title">Privacy Policy</h2>

          <button
            type="button"
            className="panel-header-info-button"
            onClick={() => setShowPrivacyModal(false)}
            aria-label="Close"
          >
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>

        <PrivacyPolicyContent />
      </PanelInfoModal>
    </footer>
  );
}