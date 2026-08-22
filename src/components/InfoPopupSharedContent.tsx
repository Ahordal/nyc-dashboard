// InfoPopupSharedContent.tsx
//
// Reusable content shared between dashboard information popups.
//
// Keeps grade definitions and official NYC health resources consistent
// wherever they appear.

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import {
  faArrowUpRightFromSquare,
} from "@fortawesome/free-solid-svg-icons";

import {
  CATEGORY_COLORS,
} from "../utils/gradeCategory";

export function GradeRangeInfo() {
  return (
    <ul>
      <li>
        <strong
          style={{
            color: CATEGORY_COLORS.A,
          }}
        >
          A
        </strong>{" "}
        — 0 to 13 points
      </li>

      <li>
        <strong
          style={{
            color: CATEGORY_COLORS.B,
          }}
        >
          B
        </strong>{" "}
        — 14 to 27 points
      </li>

      <li>
        <strong
          style={{
            color: CATEGORY_COLORS.C,
          }}
        >
          C
        </strong>{" "}
        — 28 or more points
      </li>

      <li>
        <strong
          style={{
            color: CATEGORY_COLORS.closed,
          }}
        >
          CLOSED
        </strong>{" "}
        — Closed by DOHMH; violations
        requiring immediate action were
        cited
      </li>

      <li>
        <strong
          style={{
            color:
              CATEGORY_COLORS.pending,
          }}
        >
          N
        </strong>{" "}
        — Not Yet Graded, awaiting
        re-inspection after an initial
        visit
      </li>

      <li>
        <strong
          style={{
            color:
              CATEGORY_COLORS.pending,
          }}
        >
          P
        </strong>{" "}
        — Grade Pending, reopened after
        a prior closure
      </li>

      <li>
        <strong
          style={{
            color:
              CATEGORY_COLORS.pending,
          }}
        >
          Z
        </strong>{" "}
        — Grade Pending, awaiting
        official confirmation
      </li>

      <li>
        <strong>N/A</strong> — No grade
        recorded; shown in the color of
        its score-based category.
      </li>
    </ul>
  );
}

export function NYCHealthResources() {
  return (
    <ul>
      <li>
        <a
          href="https://www.nyc.gov/assets/doh/downloads/pdf/rii/restaurant-grading-faq.pdf"
          target="_blank"
          rel="noopener noreferrer"
        >
          How We Score and Grade
        </a>{" "}
        <FontAwesomeIcon
          icon={
            faArrowUpRightFromSquare
          }
          className="external-link-icon"
          aria-hidden="true"
        />
      </li>

      <li>
        <a
          href="https://www.nyc.gov/assets/doh/downloads/pdf/rii/inspection-cycle-and-letter-grading.pdf"
          target="_blank"
          rel="noopener noreferrer"
        >
          Inspection Cycle Overview
        </a>{" "}
        <FontAwesomeIcon
          icon={
            faArrowUpRightFromSquare
          }
          className="external-link-icon"
          aria-hidden="true"
        />
      </li>
    </ul>
  );
}