// Badge.tsx
// Reusable pill badge for violation severity, codes, categories, and status flags.
// Serves as the single source of truth for severity colors; base sizing and 
// other variant styles are defined in global.css.

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

// Central source of truth for violation severity colors. 
// eslint-disable-next-line react-refresh/only-export-components
export const SEVERITY_STYLES: Record<"critical" | "not-critical", SeverityStyle> = {
  critical: { background: "#8B0000", color: "#ffffff" },
  "not-critical": { background: "#E6B800", color: "#1a1a1a" },
};

// Maps variants to their shared base and modifier CSS classes in global.css.
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