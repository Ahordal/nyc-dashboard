// DashboardFooter.tsx
//
// Site-level attribution bar spanning the full width of the dashboard.

import { useState } from "react";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faLinkedin,
  faGithub,
} from "@fortawesome/free-brands-svg-icons";
import { faBrain, faXmark } from "@fortawesome/free-solid-svg-icons";

import PanelInfoModal from "./PanelInfoModal";

export default function DashboardFooter() {
  const [showAiModal, setShowAiModal] = useState(false);

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

        <a
          href="https://www.linkedin.com/in/alex-hordal/"
          target="_blank"
          rel="noreferrer"
          aria-label="LinkedIn">
          <FontAwesomeIcon icon={faLinkedin} aria-hidden="true" />
        </a>

        <span className="footer-divider">|</span>

        <a
          href="https://github.com/Ahordal/nyc-dashboard"
          target="_blank"
          rel="noreferrer"
          aria-label="GitHub repository">
          <FontAwesomeIcon icon={faGithub} aria-hidden="true" />
        </a>

        <span className="footer-divider">|</span>

        <button
          type="button"
          className="footer-icon-button"
          onClick={() => setShowAiModal(true)}
          aria-label="About AI-Assisted Development"
        >
          <FontAwesomeIcon icon={faBrain} aria-hidden="true" />
        </button>
      </div>

      <div className="footer-copyright">&copy; Alex Hordal 2026</div>

      <PanelInfoModal
        isOpen={showAiModal}
        onClose={() => setShowAiModal(false)}
        ariaLabel="AI-Assisted Development"
      >
        <div className="panel-header info-modal-panel-header ai-assisted-modal-header">
          <h2 className="panel-header-title">
            <FontAwesomeIcon
              icon={faBrain}
              className="panel-header-title-icon"
              aria-hidden="true"
            />
            AI-Assisted Development
          </h2>

          <button
            type="button"
            className="panel-header-info-button"
            onClick={() => setShowAiModal(false)}
            aria-label="Close"
          >
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>

        <div className="info-popup-content">
          <p>
            This dashboard was developed through a combination of
            traditional development and iterative AI-assisted workflows.
          </p>
        </div>
      </PanelInfoModal>
    </footer>
  );
}