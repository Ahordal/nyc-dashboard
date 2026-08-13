// ViolationList.tsx
// Renders a sorted list of violations for a given inspection, complete with colored severity tags.

import type { Violation, ViolationCodeLookup } from "../types/restaurant";
import { getViolationDescription } from "../utils/getViolationDescription";

const VIOLATION_FLAG_STYLES: Record<
  string,
  { label: string; background: string; color: string }
> = {
  Critical: { label: "Critical", background: "#8B0000", color: "#ffffff" },
  "Not Critical": {
    label: "Not Critical",
    background: "#E6B800",
    color: "#1a1a1a",
  },
};

type ViolationListProps = {
  violations: Violation[];
  violationCodes: ViolationCodeLookup;
};

export default function ViolationList({
  violations,
  violationCodes,
}: ViolationListProps) {
  if (!violations || violations.length === 0) {
    return null;
  }

  // Sort critical violations to the top
  const sortedViolations = [...violations].sort((a, b) => {
    const rank = (flag: string) =>
      flag === "Critical" ? 0 : flag === "Not Critical" ? 1 : 2;
    return rank(a.critical_flag) - rank(b.critical_flag);
  });

  return (
    <>
      <h4 className="section-header">Violations</h4>
      <ul className="violations-list">
        {sortedViolations.map((v, i) => {
          const flagStyle = VIOLATION_FLAG_STYLES[v.critical_flag];
          return (
            <li
              key={`${v.code}-${i}`}
              style={
                flagStyle
                  ? { borderLeftColor: flagStyle.background }
                  : undefined
              }>
              <span className="violation-code">{v.code}</span>
              <span className="violation-description">
                {getViolationDescription(violationCodes[v.code])}
              </span>{" "}
              &nbsp;
              {flagStyle && (
                <span
                  className="violation-tag"
                  style={{
                    backgroundColor: flagStyle.background,
                    color: flagStyle.color,
                  }}>
                  {flagStyle.label}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}