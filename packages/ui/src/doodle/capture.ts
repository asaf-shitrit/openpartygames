// Pure stroke-capture arithmetic: quantizing and capping the timing a pad measures, and turning
// a raw pointer trail into a stored Stroke. No DOM — the pad calls this from its pointerup
// handler with numbers it already has.
import { deltaEncode, simplifyStroke } from "./geometry";
import type { GridPoint, InkIndex, Stroke } from "./types";
import { GAP_MS_CAP, STROKE_MS_CAP, TICK_MS } from "./types";

function quantizeAndCap(ms: number, cap: number): number {
  const quantized = Math.round(Math.max(0, ms) / TICK_MS) * TICK_MS;
  return Math.min(quantized, cap);
}

/** Duration in TICK_MS units, capped at STROKE_MS_CAP. */
export function captureDuration(ms: number): number {
  return quantizeAndCap(ms, STROKE_MS_CAP);
}

/** Pause before a stroke, in TICK_MS units, capped at GAP_MS_CAP. */
export function captureGap(ms: number): number {
  return quantizeAndCap(ms, GAP_MS_CAP);
}

/** Simplifies a raw pointer trail and packs it into a stored Stroke. */
export function finalizeStroke(
  ink: InkIndex,
  rawPoints: readonly GridPoint[],
  durationMs: number,
  gapMs: number,
): Stroke {
  return {
    c: ink,
    d: captureDuration(durationMs),
    g: captureGap(gapMs),
    p: deltaEncode(simplifyStroke(rawPoints)),
  };
}
