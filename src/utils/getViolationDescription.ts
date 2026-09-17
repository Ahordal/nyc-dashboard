// getViolationDescription.ts
//
// Normalizes a string-or-{description,category} entry to one string, so
// callers skip the branching.

import type { ViolationCodeDetails } from "../types/restaurant";

export function getViolationDescription(
  entry: ViolationCodeDetails | undefined,
): string {
  if (typeof entry === "string") return entry;
  return entry?.description ?? "Description unavailable";
}