// The canvas capability's stroke model. A drawing is numbers, never an ImageData, a Path2D or a
// canvas data URL, so game state stays plain JSON. The pad encodes with it, the renderer draws with
// it and a game's rules validate with it: one definition, so a phone can never encode a drawing
// the server then refuses.
import { z } from "zod";

/** Every point sits on a GRID × GRID square, whatever size the screen draws it at. */
export const GRID = 1024;
/** Stroke timings are whole multiples of this many ms. */
export const TICK_MS = 20;
export const STROKE_MS_CAP = 3000;
export const GAP_MS_CAP = 1000;
export const MAX_INK_INDEX = 31;

export const MAX_STROKES_PER_DOODLE = 64;
export const MAX_POINTS_PER_STROKE = 128;
export const MAX_POINTS_PER_DOODLE = 1200;

/** Absolute grid point, [x, y], each an integer in [0, GRID). */
export type GridPoint = readonly [number, number];

function inRange(n: number, min: number, max: number): boolean {
  return n >= min && n <= max;
}

/** [x0, y0, dx1, dy1, ...]: the first point is absolute, on the grid; later points are deltas. */
const strokePointsSchema = z
  .array(z.int())
  .min(2)
  .max(MAX_POINTS_PER_STROKE * 2)
  .refine((p) => p.length % 2 === 0, "odd-length point array")
  .refine(
    (p) => inRange(p[0] ?? Number.NaN, 0, GRID - 1) && inRange(p[1] ?? Number.NaN, 0, GRID - 1),
    "first point out of grid bounds",
  )
  .refine((p) => p.slice(2).every((n) => inRange(n, -(GRID - 1), GRID - 1)), "delta out of grid bounds")
  .superRefine((p, ctx) => {
    const at = firstOffGridPoint(p);
    if (at !== null) ctx.addIssue({ code: "custom", message: `point ${at} walks off the grid` });
  });

function onGrid(x: number, y: number): boolean {
  return inRange(x, 0, GRID - 1) && inRange(y, 0, GRID - 1);
}

/** Index of the first point whose running position leaves the grid, or null when all stay on it. */
function firstOffGridPoint(p: readonly number[]): number | null {
  let x = p[0] ?? 0;
  let y = p[1] ?? 0;
  if (!onGrid(x, y)) return 0;
  for (let i = 2; i < p.length; i += 2) {
    x += p[i] ?? 0;
    y += p[i + 1] ?? 0;
    if (!onGrid(x, y)) return i / 2;
  }
  return null;
}

export const strokeSchema = z.object({
  /** Palette index. Decoration only: no rule reads it. */
  c: z.int().min(0).max(MAX_INK_INDEX),
  /** How long the stroke took, in ms, capped at STROKE_MS_CAP. */
  d: z.int().min(0).max(STROKE_MS_CAP),
  /** Pause before this stroke started, in ms, capped at GAP_MS_CAP. */
  g: z.int().min(0).max(GAP_MS_CAP),
  p: strokePointsSchema,
});

export type Stroke = z.infer<typeof strokeSchema>;
/** Palette index of a stroke's ink. */
export type InkIndex = Stroke["c"];

/** `v` versions the encoding, so a saved drawing still renders after it changes. */
export const doodleSchema = z.object({
  v: z.literal(1),
  s: z.array(strokeSchema).max(MAX_STROKES_PER_DOODLE),
});

export type Doodle = z.infer<typeof doodleSchema>;

export function emptyDoodle(): Doodle {
  return { v: 1, s: [] };
}
