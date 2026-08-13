// ViolationCard.tsx
//
// Renders a single violation entry within a Violations list: severity,
// code, and category badges, plus the violation's description text.

import type { Violation, ViolationCodeLookup } from "../types/restaurant";
import { getViolationDescription } from "../utils/getViolationDescription";

import Badge, { SEVERITY_STYLES } from "./Badge";

type ViolationCardProps = {
  violation: Violation;
  violationCodes: ViolationCodeLookup;
};

function severityVariant(flag: string): "critical" | "not-critical" | null {
  if (flag === "Critical") return "critical";
  if (flag === "Not Critical") return "not-critical";
  return null;
}

export default function ViolationCard({
  violation,
  violationCodes,
}: ViolationCardProps) {
  const variant = severityVariant(violation.critical_flag);

  const lookupData = violationCodes[violation.code];

  const description = getViolationDescription(lookupData);

  const category = typeof lookupData === "object" && lookupData !== null
    ? lookupData.category
    : null;

  const borderColor = variant
    ? SEVERITY_STYLES[variant].background
    : "var(--border-panel)";

  return (
    <li className="violation-item" style={{ borderLeftColor: borderColor }}>
      {/* Header row containing severity tag, violation code, and category */}
      <div className="violation-header-row">
        {variant && <Badge variant={variant}>{violation.critical_flag}</Badge>}

        <Badge variant="code">{violation.code}</Badge>

        {category && category !== "Uncategorized" && (
          <Badge variant="category">{category}</Badge>
        )}
      </div>

      {/* Justified description text */}
      <div className="violation-description">
        {description}
      </div>
    </li>
  );
}