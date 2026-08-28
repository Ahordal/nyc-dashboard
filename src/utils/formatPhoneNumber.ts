// formatPhoneNumber.ts
//
// Formats a 10-digit phone number for display. Anything that isn't a
// valid 10-digit number is returned unchanged.

export function formatPhoneNumber(raw: string | null | undefined): string {
  if (!raw) return "";

  const digits = raw.replace(/\D/g, "");

  if (digits.length !== 10) return raw;

  return `(${digits.slice(0, 3)}) - ${digits.slice(3, 6)} - ${digits.slice(6)}`;
}