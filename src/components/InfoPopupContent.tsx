// InfoPopupContent.tsx
//
// Shared layout template for dashboard information popups.
//
// Keeps section names and ordering consistent across panels while omitting
// sections that are not relevant to a particular panel.

import type { ReactNode } from "react";

type InfoPopupContentProps = {
  overview?: ReactNode;
  howToUse?: ReactNode;
  grades?: ReactNode;
  statuses?: ReactNode;
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
  howToUse,
  grades,
  statuses,
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