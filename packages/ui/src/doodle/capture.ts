// Pure stroke-capture arithmetic: quantizing and capping the timing a pad measures, and turning
// a raw pointer trail into a stored Stroke. No DOM — the pad calls this from its pointerup
// handler with numbers it already has.
import { deltaEncode, simplifyStroke } from "./geometry";
import type { GridPoint, InkIndex, Stroke } from "@opg/sdk";
import {
  GAP_MS_CAP,
  MAX_POINTS_PER_DOODLE,
  MAX_POINTS_PER_STROKE,
  MAX_STROKES_PER_DOODLE,
  STROKE_MS_CAP,
  TICK_MS,
} from "@opg/sdk";

function quantizeAndCap(ms: number, cap: number): number {
  const quantized = Math.round(Math.max(0, ms) / TICK_MS) * TICK_MS;
  return Math.min(quantized, cap);
}

/** Duration in ms, rounded to the nearest TICK_MS and capped at STROKE_MS_CAP. */
export function captureDuration(ms: number): number {
  return quantizeAndCap(ms, STROKE_MS_CAP);
}

/** Pause before a stroke, in ms, rounded to the nearest TICK_MS and capped at GAP_MS_CAP. */
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

/** Points a doodle already holds across all its strokes. */
function pointsIn(strokes: readonly Stroke[]): number {
  return strokes.reduce((sum, stroke) => sum + stroke.p.length / 2, 0);
}

/** True when the room would refuse any further stroke: the stroke or the point cap is spent. */
export function doodleIsFull(strokes: readonly Stroke[]): boolean {
  return strokes.length >= MAX_STROKES_PER_DOODLE || pointsIn(strokes) >= MAX_POINTS_PER_DOODLE;
}

/**
 * Cuts a trail into runs of at most MAX_POINTS_PER_STROKE points; each run starts on the last
 * point of the one before, so the pieces draw the same line.
 */
function splitTrail(points: readonly GridPoint[]): GridPoint[][] {
  const pieces: GridPoint[][] = [];
  const span = MAX_POINTS_PER_STROKE - 1;
  for (let start = 0; start < points.length - 1; start += span) {
    pieces.push(points.slice(start, start + span + 1));
  }
  return pieces.length > 0 ? pieces : [[...points]];
}

/** What the pad measured for one finished line, before it becomes Strokes. */
export interface RawTrail {
  ink: InkIndex;
  points: readonly GridPoint[];
  durationMs: number;
  gapMs: number;
}

/**
 * Simplifies a raw pointer trail and packs it into stored Strokes, splitting at the point cap and
 * stopping at the doodle's stroke and point caps, so the result always passes `doodleSchema` when
 * appended to `existing`. Time is shared out by how much of the line each piece covers; only the
 * first piece carries the pause.
 */
export function finalizeStrokes(trail: RawTrail, existing: readonly Stroke[]): Stroke[] {
  const { ink, points, durationMs, gapMs } = trail;
  const simplified = simplifyStroke(points);
  const segments = simplified.length - 1;
  let strokesLeft = MAX_STROKES_PER_DOODLE - existing.length;
  let pointsLeft = MAX_POINTS_PER_DOODLE - pointsIn(existing);
  const out: Stroke[] = [];
  for (const piece of splitTrail(simplified)) {
    if (strokesLeft <= 0 || pointsLeft <= 0) break;
    const kept = piece.slice(0, pointsLeft);
    out.push({
      c: ink,
      // A single point (a tap) has no line to share out, so it keeps the whole time.
      d: captureDuration(segments > 0 ? (durationMs * (piece.length - 1)) / segments : durationMs),
      g: out.length === 0 ? captureGap(gapMs) : 0,
      p: deltaEncode(kept),
    });
    strokesLeft -= 1;
    pointsLeft -= kept.length;
  }
  return out;
}
