// DashboardGuide.tsx
//
// Shows dataset metadata (last updated, restaurant count, inspection
// count) and a modal trigger for the full dashboard reference guide.

import { useState } from "react";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleInfo, faXmark } from "@fortawesome/free-solid-svg-icons";

import PanelInfoModal from "./PanelInfoModal";
import InfoPopupContent from "./InfoPopupContent";
import DashboardGuideMeta from "./DashboardGuideMeta";

import {
  DashboardOverview,
  DashboardHowToUse,
  DataAttribution,
  DataNotes,
  GradeRangeInfo,
  NYCHealthResources,
} from "./InfoPopupSharedContent";

import type { DashboardMeta } from "../types/dashboardMeta";

type DashboardGuideProps = {
  meta: DashboardMeta | null;
};

export default function DashboardGuide({ meta }: DashboardGuideProps) {
  const [showInfoModal, setShowInfoModal] = useState(false);

  return (
    <section className="panel dashboard-guide-panel">
      <div className="panel-header">
        <h2 className="panel-header-title">
          Dashboard Information
        </h2>

        <button
          type="button"
          className="panel-header-info-button"
          onClick={() => {
            setShowInfoModal(true);
          }}
          aria-label="About Dashboard Information"
        >
          <FontAwesomeIcon icon={faCircleInfo} />
        </button>
      </div>

      <DashboardGuideMeta meta={meta} />

      <PanelInfoModal
        isOpen={showInfoModal}
        onClose={() => {
          setShowInfoModal(false);
        }}
      >
        <div className="panel-header info-modal-panel-header">
          <span className="panel-header-title">
            Dashboard Information
          </span>
          
          <button
            type="button"
            className="panel-header-info-button"
            onClick={() => setShowInfoModal(false)}
            aria-label="Close"
          >
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>

        <InfoPopupContent
          overview={<DashboardOverview />}
          howToUse={<DashboardHowToUse />}
          grades={<GradeRangeInfo />}
          dataAttribution={<DataAttribution />}
          dataNotes={<DataNotes />}
          resources={<NYCHealthResources />}
        />
      </PanelInfoModal>
    </section>
  );
}