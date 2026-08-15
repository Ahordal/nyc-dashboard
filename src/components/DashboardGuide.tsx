// DashboardGuide.tsx
//
// Dashboard-wide reference for concepts shared across multiple panels.
//
// The panel itself shows just a header (with an information button) and
// a compact row of dataset stats -- last updated, restaurant count, and
// inspection count. The information button opens a centered modal with
// the full dashboard guide (grades, statuses, filters, data notes,
// resources), since that content is too long to live in the panel body.

import { useState } from "react";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleInfo, faXmark } from "@fortawesome/free-solid-svg-icons";

import PanelInfoModal from "./PanelInfoModal";
import InfoPopupContent from "./InfoPopupContent";

import {
  GradeRangeInfo,
  NYCHealthResources,
} from "./InfoPopupSharedContent";

import type { DashboardMeta } from "../types/dashboardMeta";

type DashboardGuideProps = {
  meta: DashboardMeta | null;
};

// Shown in place of a value that hasn't loaded yet (or failed to load),
// so the stat row is always present rather than appearing only once
// dashboard-meta.json is available.
const PLACEHOLDER = "—";

function formatLastUpdated(lastUpdated: string | null | undefined): string {
  if (!lastUpdated) {
    return PLACEHOLDER;
  }

  const parsed = new Date(lastUpdated);

  if (Number.isNaN(parsed.getTime())) {
    return PLACEHOLDER;
  }

  return parsed.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatCount(count: number | null | undefined): string {
  if (count == null) {
    return PLACEHOLDER;
  }

  return count.toLocaleString();
}

// Renders nothing for a missing baseline (null/undefined) or an actual
// zero-change day -- only a real +/- change gets a badge. Reuses the
// dashboard-guide-meta-delta CSS classes, which already existed in
// global.css waiting for a caller.
function formatDelta(delta: number | null | undefined) {
  if (delta == null || delta === 0) {
    return null;
  }

  const isPositive = delta > 0;

  return (
    <span
      className={`dashboard-guide-meta-delta ${
        isPositive
          ? "dashboard-guide-meta-delta-positive"
          : "dashboard-guide-meta-delta-negative"
      }`}
    >
      {isPositive ? "+" : "\u2212"}
      {Math.abs(delta).toLocaleString()}
    </span>
  );
}

export default function DashboardGuide({ meta }: DashboardGuideProps) {
  const [showInfoModal, setShowInfoModal] = useState(false);

  return (
    <section className="panel dashboard-guide-panel">
      <div className="panel-header">
        <span className="panel-header-title">
          Dashboard Information
        </span>

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

      <div className="dashboard-guide-meta">
        <div className="dashboard-guide-meta-item">
          <span className="dashboard-guide-meta-label">
            Data Last Updated: &nbsp; 
          </span>

          <span className="dashboard-guide-meta-value">
            {formatLastUpdated(meta?.lastUpdated)}
          </span>
        </div>

        <div className="dashboard-guide-meta-item">
          <span className="dashboard-guide-meta-label">
            Total Restaurant Count: &nbsp; 
          </span>

          <span className="dashboard-guide-meta-value">
            {formatCount(meta?.restaurantCount)}
            {formatDelta(meta?.restaurantDelta)}
          </span>
        </div>

        <div className="dashboard-guide-meta-item">
          <span className="dashboard-guide-meta-label">
            Total Inspection Records: &nbsp; 
          </span>

          <span className="dashboard-guide-meta-value">
            {formatCount(meta?.inspectionCount)}
            {formatDelta(meta?.inspectionDelta)}
          </span>
        </div>
      </div>

      <PanelInfoModal
        isOpen={showInfoModal}
        onClose={() => {
          setShowInfoModal(false);
        }}
      >
        <div className="panel-header" style={{ marginBottom: "1.5rem", borderRadius: "4px" }}>
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
          overview={
            <p>
              Explores NYC restaurant inspection records through the map,
              summary panels, restaurant details, inspection reports, and
              performance chart.
            </p>
          }
          howToUse={
            <ul>
              <li>
                Grade and Borough controls can be combined to narrow the
                restaurants shown.
              </li>

              <li>
                Search further narrows the current results by restaurant
                name or cuisine.
              </li>

              <li>
                Restaurant lists and dashboard summaries update with the
                current map view, filters, and search.
              </li>
            </ul>
          }
          grades={<GradeRangeInfo />}
          dataNotes={
            <ul>
              <li>
                Historical inspection reports may differ from a
                restaurant&apos;s latest grade, score, or recorded status.
              </li>

              <li>
                Inspections without numerical scores may be excluded from
                score-based charts and summaries.
              </li>

              <li>
                Restaurant locations are geocoded; some could not be
                automatically confirmed and are flagged on the map as
                &quot;Location Unverified&quot; rather than assumed correct.
              </li>

              <li>
                Displayed addresses are reformatted from the source dataset
                (ordinal suffixes, casing) and may differ slightly from
                official listings.
              </li>

              <li>
                Google Street View imagery is provided by Google Maps and
                may not reflect the current storefront or business
                operations.
              </li>
            </ul>
          }
          resources={<NYCHealthResources />}
        />
      </PanelInfoModal>
    </section>
  );
}