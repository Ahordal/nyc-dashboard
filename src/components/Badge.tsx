// Badge.tsx
//
// Small reusable "pill" label used throughout the dashboard for violation
// severity, violation codes, violation categories, and inspection status
// flags (e.g. "Closed by DOHMH").
//
// This is the single source of truth for severity colors (Critical /
// Not Critical) so they can't drift out of sync between the places that
// render them (ViolationList, the info popup legend in RestaurantReport,
// etc). Sizing (padding, border-radius, line-height) comes from the shared
// .violation-tag CSS class in global.css.

import type { CSSProperties, ReactNode } from "react";

export type BadgeVariant =
  | "critical"
  | "not-critical"
  | "code"
  | "category"
  | "status-open"
  | "status-closed"
  | "status-unknown";

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
// letter-spacing, etc.) already lives in global.css.
const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  critical: "violation-tag severity-tag",
  "not-critical": "violation-tag severity-tag",
  code: "violation-tag violation-code-tag",
  category: "violation-tag category-tag",
  "status-open": "violation-tag status-flag status-open",
  "status-closed": "violation-tag status-flag status-closed",
  "status-unknown": "violation-tag status-flag status-unknown",
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