// Badge.tsx
//
// Small reusable "pill" label used throughout the dashboard for violation
// severity, violation codes, violation categories, inspection status
// flags (e.g. "Closed by DOHMH"), and geocoding confidence (e.g.
// "Verified" / "Unverified" / "Pending" location).
//
// This is the single source of truth for severity colors (Critical /
// Not Critical) so they can't drift out of sync between the places that
// render them (ViolationList, the info popup legend in RestaurantReport,
// etc). Sizing (padding, border-radius, line-height) and all status-flag
// colors (including the location-* variants below) come from the shared
// .violation-tag / .status-flag CSS classes in global.css.

import type { CSSProperties, ReactNode } from "react";

export type BadgeVariant =
  | "critical"
  | "not-critical"
  | "code"
  | "category"
  | "status-open"
  | "status-closed"
  | "status-unknown"
  | "location-verified"
  | "location-unverified"
  | "location-pending";

type SeverityStyle = {
  background: string;
  color: string;
};

// Central severity color mapping. Update colors here and every badge
// (violation tags, the info popup legend) picks up the change.
export const SEVERITY_STYLES: Record<"critical" | "not-critical", SeverityStyle> = {
  critical: { background: "#8B0000", color: "#ffffff" },
  "not-critical": { background: "#E6B800", color: "#1a1a1a" },
};

// Maps each variant to the existing CSS classes that carry the shared
// badge sizing plus whatever variant-specific styling (border, background,
// letter-spacing, etc.) already lives in global.css. The three location-*
// variants reuse the same STATUS FLAGS & BADGES section in global.css as
// status-open/closed/unknown (status-location-verified/unverified/pending),
// rather than inline colors, so they stay visually consistent with the
// rest of the badge family and pick up palette changes automatically.
const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  critical: "violation-tag severity-tag",
  "not-critical": "violation-tag severity-tag",
  code: "violation-tag violation-code-tag",
  category: "violation-tag category-tag",
  "status-open": "violation-tag status-flag status-open",
  "status-closed": "violation-tag status-flag status-closed",
  "status-unknown": "violation-tag status-flag status-unknown",
  "location-verified": "violation-tag status-flag status-location-verified",
  "location-unverified": "violation-tag status-flag status-location-unverified",
  "location-pending": "violation-tag status-flag status-location-pending",
};

type BadgeProps = {
  variant: BadgeVariant;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
};

export default function Badge({ variant, children, className, style }: BadgeProps) {
  const classes = [VARIANT_CLASSES[variant], className].filter(Boolean).join(" ");

  const severityStyle =
    variant === "critical" || variant === "not-critical"
      ? SEVERITY_STYLES[variant]
      : undefined;

  const combinedStyle: CSSProperties | undefined =
    severityStyle || style
      ? {
          ...(severityStyle && {
            backgroundColor: severityStyle.background,
            color: severityStyle.color,
          }),
          ...style,
        }
      : undefined;

  return (
    <span className={classes} style={combinedStyle}>
      {children}
    </span>
  );
}