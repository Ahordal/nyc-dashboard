// MobileInfoContent.tsx
//
// The single info document shown in the phone Info drawer. Combines the
// desktop Dashboard Information sections with the map's legend (the
// map's own info button is hidden at this width). Map-corner-only and
// desktop-only how-to items are left out; a couple of touch lines are
// added instead.

import InfoPopupContent from "./InfoPopupContent";
import {
  DashboardOverview,
  DashboardHowToUse,
  DataAttribution,
  DataNotes,
  GradeRangeInfo,
  LegendTable,
  NYCHealthResources,
} from "./InfoPopupSharedContent";

const MOBILE_INFO_CONTENT = (
  <InfoPopupContent
    overview={<DashboardOverview />}
    legend={
      <>
        <LegendTable />
        <p>
          The map utilizes bivariate symbology: circle size corresponds to the
          approximate inspection score (larger circle = higher score), and
          circle color represents the inspection grade.
        </p>
      </>
    }
    howToUse={
      <DashboardHowToUse
        extra={
          <>
            <li>
              Tap a dot on the map to preview that restaurant, then tap its
              card to see full details.
            </li>
            <li>
              Pinch to zoom; tap the satellite/map icon to toggle satellite
              imagery.
            </li>
            <li>
              Tap the location arrow icon in the map&apos;s top-right corner
              to show your position on the map as a blue dot.
            </li>
          </>
        }
      />
    }
    grades={<GradeRangeInfo />}
    dataAttribution={<DataAttribution />}
    dataNotes={<DataNotes />}
    resources={<NYCHealthResources />}
  />
);

export default MOBILE_INFO_CONTENT;
