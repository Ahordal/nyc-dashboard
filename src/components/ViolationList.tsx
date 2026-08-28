// ViolationList.tsx
//
// Renders an inspection's violations sorted critical-first, each with its
// severity tag and official category.

import type { Violation, ViolationCodeLookup } from "../types/restaurant";

import ViolationCard from "./ViolationCard";

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
        {sortedViolations.map((v, i) => (
          <ViolationCard
            key={`${v.code}-${i}`}
            violation={v}
            violationCodes={violationCodes}
          />
        ))}
      </ul>
    </>
  );
}