// formatDate.ts
//
// Formats an ISO date string as a UTC display date; "—" for anything
// missing or unparseable.

export function formatDate(raw: string | null): string {
  if (!raw) return "—";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", { timeZone: "UTC" });
}
