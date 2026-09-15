// Pure math for score count-ups: no DOM, no React, safe to unit test directly.

/** Cubic ease-out: fast start, gentle landing. */
export function easeOutCubic(t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  return 1 - (1 - clamped) ** 3;
}

/** Value at progress t in [0,1] (clamped), rounded to an integer. */
export function countAt(from: number, to: number, t: number): number {
  const eased = easeOutCubic(t);
  return Math.round(from + (to - from) * eased);
}

/** Formats a point value with thousands separators, e.g. 1500 -> "1,500". */
export function formatPoints(value: number): string {
  return value.toLocaleString("en-US");
}
