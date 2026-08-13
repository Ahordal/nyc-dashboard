// utils/getViolationDescription.ts
//
// Resolves a ViolationCodeLookup entry (which can be either a plain
// string, or an object carrying description + category) down to a
// single displayable string. Centralizes this so ViolationCard.tsx and
// ViolationList.tsx don't each maintain their own copy of the same
// string/object handling.

import type { ViolationCodeEntry } from "../types/restaurant";

export function getViolationDescription(
  entry: ViolationCodeEntry | undefined,
): string {
  if (typeof entry === "string") return entry;
  return entry?.description ?? "Description unavailable";
}