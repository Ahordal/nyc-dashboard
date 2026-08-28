// getViolationDescription.ts
//
// Resolves a violation-code entry (a plain string, or an object with
// description + category) to a single displayable string, so
// ViolationCard and ViolationList don't each repeat the handling.

import type { ViolationCodeDetails } from "../types/restaurant";

export function getViolationDescription(
  entry: ViolationCodeDetails | undefined,
): string {
  if (typeof entry === "string") return entry;
  return entry?.description ?? "Description unavailable";
}