import { createRng, doodleSchema, GRID, MAX_POINTS_PER_STROKE, type Stroke } from "@opg/sdk";
import { describe, expect, it } from "vitest";
import { botDoodle } from "./bot";
import { chunkFits } from "./rules";

const SEEDS = [1, 2, 3, 7, 11, 29, 101, 977];

function pointCount(strokes: readonly Stroke[]): number {
  return strokes.reduce((sum, s) => sum + s.p.length / 2, 0);
}

/** Every absolute position the strokes visit. */
function visited(strokes: readonly Stroke[]): { xs: number[]; ys: number[] } {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const s of strokes) {
    let x = s.p[0] ?? 0;
    let y = s.p[1] ?? 0;
    xs.push(x);
    ys.push(y);
    for (let i = 2; i < s.p.length; i += 2) {
      x += s.p[i] ?? 0;
      y += s.p[i + 1] ?? 0;
      xs.push(x);
      ys.push(y);
    }
  }
  return { xs, ys };
}

describe("botDoodle", () => {
  it.each(SEEDS)("stays on the grid and under every cap (seed %i)", (seed) => {
    const strokes = botDoodle(createRng(seed));

    expect(doodleSchema.safeParse({ v: 1, s: strokes }).success).toBe(true);
    const { xs, ys } = visited(strokes);
    for (const n of [...xs, ...ys]) {
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(GRID - 1);
    }
    expect(chunkFits({ v: 1, s: [] }, strokes)).toBe(true);
    for (const s of strokes) expect(s.p.length / 2).toBeLessThanOrEqual(MAX_POINTS_PER_STROKE);
  });

  it.each(SEEDS)("draws something big enough to see (seed %i)", (seed) => {
    const strokes = botDoodle(createRng(seed));
    const { xs, ys } = visited(strokes);

    expect(pointCount(strokes)).toBeGreaterThanOrEqual(150);
    expect(strokes.length).toBeGreaterThanOrEqual(4);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(GRID / 8);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(GRID / 8);
  });
});
