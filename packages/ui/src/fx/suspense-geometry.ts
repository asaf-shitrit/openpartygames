// Pure geometry and timing for the Suspense element: a tightening ring plus three heartbeat
// dots that stand in for the drumroll on a silent phone. happy-dom has no canvas and returns an
// all-zero getBoundingClientRect, so (as with Confetti/confetti-paint.ts) all of the math lives
// here as plain-number functions and the component itself just renders their output.
import type { Beat } from "../moment/timeline";
import type { HapticName } from "../haptics";

export interface SuspenseDotTempo {
  /** Interval between dot ticks outside the ramp window. */
  baseMs: number;
  /** Interval at the moment the beat ends, once ramping has fully kicked in. */
  minMs: number;
  /** How long before the end the interval ramps from baseMs down to minMs. 0 disables ramping. */
  rampWindowMs: number;
}

/**
 * reveal: the 2.5s drumroll/caught-result beat, dots at a constant ~416ms.
 * drain: the 15s last-chance beat, dots ramping from 500ms to 250ms in the final 5s.
 */
export const SUSPENSE_DOT_TEMPO = {
  reveal: { baseMs: 416, minMs: 416, rampWindowMs: 0 },
  drain: { baseMs: 500, minMs: 250, rampWindowMs: 5000 },
} as const satisfies Record<string, SuspenseDotTempo>;

export type SuspenseVariant = keyof typeof SUSPENSE_DOT_TEMPO;

/** Fraction of the ring closed, in [0, 1]. Clamped, so a late mount reads as fully closed. */
export function ringClosureFraction(elapsedMs: number, durationMs: number): number {
  if (durationMs <= 0) return 1;
  return Math.min(1, Math.max(0, elapsedMs / durationMs));
}

/** The dot tick interval with this much time left before the beat ends. */
export function dotIntervalAt(remainingMs: number, tempo: SuspenseDotTempo): number {
  const { baseMs, minMs, rampWindowMs } = tempo;
  if (rampWindowMs <= 0 || remainingMs >= rampWindowMs) return baseMs;
  const t = Math.max(0, remainingMs) / rampWindowMs;
  return minMs + (baseMs - minMs) * t;
}

const DOT_HAPTIC: HapticName = "heartbeat";

/**
 * One beat per dot tick from 0 to durationMs, each carrying the heartbeat haptic. The interval
 * ramps as time runs out, per `tempo`, so the beats bunch up toward the end of a "drain" beat.
 */
export function suspenseDotBeats(durationMs: number, tempo: SuspenseDotTempo): Beat[] {
  const beats: Beat[] = [];
  let elapsed = 0;
  let index = 0;
  while (elapsed < durationMs) {
    elapsed += dotIntervalAt(durationMs - elapsed, tempo);
    beats.push({
      id: `dot-${index}`,
      atMs: Math.min(elapsed, durationMs),
      haptic: DOT_HAPTIC,
    });
    index += 1;
  }
  return beats;
}

/** How many of the 3 dots are solid: fills 1, 2, 3, then loops back to 1 on the next tick. */
export function filledDotCount(ticksReached: number): number {
  if (ticksReached <= 0) return 0;
  return ((ticksReached - 1) % 3) + 1;
}
