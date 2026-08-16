// InfoPopupContent.tsx
//
// Shared layout template for dashboard information popups.
//
// Keeps section names and ordering consistent across panels while omitting
// sections that are not relevant to a particular panel.

import type { ReactNode } from "react";

type InfoPopupContentProps = {
  overview?: ReactNode;
  dataSource?: ReactNode;
  howToUse?: ReactNode;
  grades?: ReactNode;
  violations?: ReactNode;
  statuses?: ReactNode;
  dataAttribution?: ReactNode;
  dataNotes?: ReactNode;
  resources?: ReactNode;
};

type InfoPopupSectionProps = {
  title: string;
  children: ReactNode;
};

function InfoPopupSection({
  title,
  children,
}: InfoPopupSectionProps) {
  return (
    <div className="info-popup-section">
      <h4 className="section-header">
        {title}
      </h4>

      {children}
    </div>
  );
}

export default function InfoPopupContent({
  overview,
  dataSource,
  howToUse,
  grades,
  violations,
  statuses,
  dataAttribution,
  dataNotes,
  resources,
}: InfoPopupContentProps) {
  return (
    <>
      {overview && (
        <InfoPopupSection title="Overview">
          {overview}
        </InfoPopupSection>
      )}

      {dataSource && (
        <InfoPopupSection title="Data Source & Freshness">
          {dataSource}
        </InfoPopupSection>
      )}

      {howToUse && (
        <InfoPopupSection title="How to Use">
          {howToUse}
        </InfoPopupSection>
      )}

      {grades && (
        <InfoPopupSection title="Grades & Score Ranges">
          {grades}
        </InfoPopupSection>
      )}

      {statuses && (
        <InfoPopupSection title="Status Indicators">
          {statuses}
        </InfoPopupSection>
      )}

      {violations && (
        <InfoPopupSection title="Violations">
          {violations}
        </InfoPopupSection>
      )}

      {dataAttribution && (
        <InfoPopupSection title="Data Attribution">
          {dataAttribution}
        </InfoPopupSection>
      )}

      {dataNotes && (
        <InfoPopupSection title="Data Notes">
          {dataNotes}
        </InfoPopupSection>
      )}

      {resources && (
        <InfoPopupSection title="NYC Health Resources">
          {resources}
        </InfoPopupSection>
      )}
    </>
  );
}