import { describe, expect, it } from "vitest";
import {
  doodleSchema,
  emptyDoodle,
  GAP_MS_CAP,
  GRID,
  MAX_INK_INDEX,
  MAX_POINTS_PER_STROKE,
  MAX_STROKES_PER_DOODLE,
  STROKE_MS_CAP,
  strokeSchema,
} from "./doodle";
import type { Stroke } from "./doodle";

function stroke(patch: Partial<Stroke> = {}): Stroke {
  return { c: 0, d: 200, g: 40, p: [10, 10, 5, -5], ...patch };
}

describe("strokeSchema", () => {
  it("accepts a stroke at every cap", () => {
    const p = [GRID - 1, 0, ...Array.from({ length: (MAX_POINTS_PER_STROKE - 1) * 2 }, () => 0)];
    const atCaps = stroke({ c: MAX_INK_INDEX, d: STROKE_MS_CAP, g: GAP_MS_CAP, p });
    expect(strokeSchema.safeParse(atCaps).success).toBe(true);
  });

  it("accepts a path that touches every grid edge", () => {
    const p = [0, 0, GRID - 1, GRID - 1, -(GRID - 1), 0, GRID - 1, -(GRID - 1)];
    expect(strokeSchema.safeParse(stroke({ p })).success).toBe(true);
  });

  it.each([
    ["an ink past the palette range", stroke({ c: MAX_INK_INDEX + 1 })],
    ["a duration over the cap", stroke({ d: STROKE_MS_CAP + 1 })],
    ["a gap over the cap", stroke({ g: GAP_MS_CAP + 1 })],
    ["a single coordinate", stroke({ p: [5] })],
    ["an odd-length point list", stroke({ p: [5, 5, 1] })],
    ["a first point off the grid", stroke({ p: [GRID, 0] })],
    ["a delta longer than the grid", stroke({ p: [0, 0, GRID, 0] })],
    ["a path that walks off the right edge", stroke({ p: [GRID - 1, 0, 1, 0] })],
    ["a path that walks off the top edge", stroke({ p: [5, 5, 0, -6] })],
    ["a path that drifts off after many small steps", stroke({ p: [900, 500, 50, 0, 50, 0, 50, 0] })],
    ["a fractional coordinate", stroke({ p: [0.5, 0] })],
    ["too many points", stroke({ p: Array.from({ length: (MAX_POINTS_PER_STROKE + 1) * 2 }, () => 0) })],
  ])("refuses %s", (_label, bad) => {
    expect(strokeSchema.safeParse(bad).success).toBe(false);
  });
});

describe("doodleSchema", () => {
  it("accepts the empty doodle", () => {
    expect(doodleSchema.safeParse(emptyDoodle()).success).toBe(true);
  });

  it("refuses more strokes than the cap", () => {
    const s = Array.from({ length: MAX_STROKES_PER_DOODLE + 1 }, () => stroke());
    expect(doodleSchema.safeParse({ v: 1, s }).success).toBe(false);
  });

  it("refuses an encoding version it does not know", () => {
    expect(doodleSchema.safeParse({ v: 2, s: [] }).success).toBe(false);
  });
});
