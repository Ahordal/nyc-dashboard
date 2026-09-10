// percentShare.ts
//
// Turns a set of counts into integer percentages that sum to exactly 100
// (largest-remainder / Hamilton rounding), plus a display formatter that
// shows "<1%" for a nonzero count that rounds down to zero.

export function largestRemainderPercents(values: number[]): number[] {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (total === 0) return values.map(() => 0);

  const raw = values.map((value) => (value / total) * 100);
  const result = raw.map((value) => Math.floor(value));
  let leftover = 100 - result.reduce((sum, value) => sum + value, 0);

  // Hand the leftover points to the largest fractional parts.
  for (const { index } of raw
    .map((value, index) => ({ index, frac: value - result[index] }))
    .sort((a, b) => b.frac - a.frac)) {
    if (leftover <= 0) break;
    result[index] += 1;
    leftover -= 1;
  }

  return result;
}

export function formatShare(pct: number, count: number): string {
  if (count > 0 && pct === 0) return "<1%";
  return `${pct}%`;
}
