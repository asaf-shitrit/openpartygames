// The canvas capability's data model: a stroke is numbers, never an ImageData, a Path2D or a
// canvas-produced data URL, so game state stays pure JSON (CLAUDE.md, plan/0003-doodle-bluff.md).

/** Palette index into DOODLE_INKS. Decoration only: no rule reads it. */
export type InkIndex = number;

/** Absolute grid point, [x, y], each an integer on a GRID square. */
export type GridPoint = readonly [number, number];

export interface Stroke {
  /** Palette index. */
  c: InkIndex;
  /** How long the stroke took, in TICK_MS units, capped at STROKE_MS_CAP. */
  d: number;
  /** Pause before this stroke started, in TICK_MS units, capped at GAP_MS_CAP. */
  g: number;
  /** [x0, y0, dx1, dy1, ...] — first point absolute, later points deltas. */
  p: number[];
}

/** v: 1 so an old snapshot still renders after an encoding change. */
export interface Doodle {
  v: 1;
  s: Stroke[];
}

export const GRID = 1024;
export const TICK_MS = 20;
export const STROKE_MS_CAP = 3000;
export const GAP_MS_CAP = 1000;
export const MIN_STEP = 6;
export const RDP_EPSILON = 4;
export const REPLAY_MS = 2200;
export const MAX_STROKES_PER_DOODLE = 64;
export const MAX_POINTS_PER_STROKE = 128;
export const MAX_POINTS_PER_DOODLE = 1200;

export function emptyDoodle(): Doodle {
  return { v: 1, s: [] };
}
