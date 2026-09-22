// MobileInfoContent.tsx
//
// The single info document shown in the phone Info drawer: desktop's
// Dashboard Information sections plus the map's legend (its own info
// button is hidden at this width). Map-corner-only/desktop-only how-to
// items are dropped; a couple of touch lines are added instead.

import InfoPopupContent from "./InfoPopupContent";
import {
  DashboardOverview,
  DashboardHowToUse,
  DataAttribution,
  DataNotes,
  GradeRangeInfo,
  LegendTable,
  NYCHealthResources,
  PrivacyPolicyInfo,
} from "./InfoPopupSharedContent";

import { CATEGORY_COLORS } from "../utils/gradeCategory";

const MOBILE_INFO_CONTENT = (
  <>
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
          <p>
            Use the restaurant listing panel to browse and inspect individual
            establishments when multiple locations share overlapping points.
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
              <li>
                Twist with two fingers to rotate the map; tap the compass icon
                below the zoom buttons to reorient to north.
              </li>
            </>
          }
        />
      }
      grades={<GradeRangeInfo />}
      dataAttribution={<DataAttribution />}
      dataNotes={<DataNotes />}
      resources={<NYCHealthResources />}
      privacyPolicy={<PrivacyPolicyInfo />}
    />

    <h3 className="dashboard-guide-mark">
      I <span style={{ color: CATEGORY_COLORS.closed }}>♥</span> NY
    </h3>
  </>
);

export default MOBILE_INFO_CONTENT;
