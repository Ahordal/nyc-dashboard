// DashboardGuide.tsx
//
// Dashboard-wide reference for concepts shared across multiple panels.
//
// Uses an accordion so grade definitions, status meanings, filtering rules,
// data notes, and official resources are documented once without taking over
// the dashboard layout.

import type {
  ReactNode,
} from "react";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import {
  faChevronRight,
} from "@fortawesome/free-solid-svg-icons";

import {
  GradeRangeInfo,
  NYCHealthResources,
} from "./InfoPopupSharedContent";

type DashboardGuideSectionProps = {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
};

function DashboardGuideSection({
  title,
  children,
  defaultOpen = false,
}: DashboardGuideSectionProps) {
  return (
    <details
      className="dashboard-guide-section"
      open={defaultOpen}
    >
      <summary>
        <FontAwesomeIcon
          icon={faChevronRight}
          className="dashboard-guide-chevron"
          aria-hidden="true"
        />

        <span>{title}</span>
      </summary>

      <div className="dashboard-guide-section-content">
        {children}
      </div>
    </details>
  );
}

export default function DashboardGuide() {
  return (
    <section className="panel dashboard-guide-panel">
      <div className="panel-header">
        <span className="panel-header-title">
          Dashboard Guide
        </span>
      </div>

      <div className="dashboard-guide-content">
        <DashboardGuideSection
          title="Dashboard Overview"
          defaultOpen
        >
          <p>
            Explores NYC restaurant inspection records through the map,
            summary panels, restaurant details, inspection reports, and
            performance chart.
          </p>
        </DashboardGuideSection>

        <DashboardGuideSection title="Grades & Score Ranges">
          <GradeRangeInfo />
        </DashboardGuideSection>

        <DashboardGuideSection title="Status Indicators">
          <ul>
            <li>
              <span className="violation-tag status-open">
                Open
              </span>{" "}
              — Most recent inspection wasn&apos;t a closure.
            </li>

            <li>
              <span className="violation-tag status-unknown">
                Unknown
              </span>{" "}
              — No reliable status was recorded.
            </li>

            <li>
              <span className="violation-tag status-closed">
                Closed by DOHMH
              </span>{" "}
              — Most recent inspection resulted in a closure.
            </li>
          </ul>

          <p className="dashboard-guide-note">
            Statuses reflect the latest available dataset record, not live
            business operations.
          </p>
        </DashboardGuideSection>

        <DashboardGuideSection title="Filters & Search">
          <ul>
            <li>
              Grade and Borough controls can be combined to narrow the
              restaurants shown.
            </li>

            <li>
              Search further narrows the current results by restaurant name
              or cuisine.
            </li>

            <li>
              Restaurant lists and dashboard summaries update with the
              current map view, filters, and search.
            </li>
          </ul>
        </DashboardGuideSection>

        <DashboardGuideSection title="Data Notes">
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
              Google Street View imagery is provided by Google Maps and may
              not reflect the current storefront or business operations.
            </li>
          </ul>
        </DashboardGuideSection>

        <DashboardGuideSection title="NYC Health Resources">
          <NYCHealthResources />
        </DashboardGuideSection>
      </div>
    </section>
  );
}