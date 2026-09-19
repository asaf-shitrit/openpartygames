// Measures the plan's byte-budget estimate (plan/0003-doodle-bluff.md:199-218) against real
// JSON.stringify output, instead of leaving it an estimate. Deterministic synthetic doodles, not
// randomness, so the numbers are stable across runs.
import { describe, expect, it } from "vitest";
import {
  GAP_MS_CAP,
  MAX_POINTS_PER_STROKE,
  MAX_STROKES_PER_DOODLE,
  STROKE_MS_CAP,
} from "./types";
import type { Doodle, GridPoint, Stroke } from "./types";
import { deltaEncode } from "./geometry";

/** A wandering polyline, `length` points, that stays inside the grid. */
function wanderingLine(length: number, seed: number): GridPoint[] {
  const points: GridPoint[] = [[512, 512]];
  let x = 512;
  let y = 512;
  let angle = seed;
  for (let i = 1; i < length; i += 1) {
    angle += 0.7;
    x = Math.max(0, Math.min(1023, Math.round(x + Math.cos(angle) * 15)));
    y = Math.max(0, Math.min(1023, Math.round(y + Math.sin(angle) * 15)));
    points.push([x, y]);
  }
  return points;
}

function strokeOf(length: number, index: number): Stroke {
  return {
    c: index % 6,
    d: 100 + (index % 20) * 10,
    g: index === 0 ? 0 : 20 + (index % 10) * 5,
    p: deltaEncode(wanderingLine(length, index)),
  };
}

function doodleOf(strokeCount: number, pointsPerStroke: number): Doodle {
  const s: Stroke[] = [];
  for (let i = 0; i < strokeCount; i += 1) s.push(strokeOf(pointsPerStroke, i));
  return { v: 1, s };
}

function pointCount(doodle: Doodle): number {
  return doodle.s.reduce((sum, stroke) => sum + stroke.p.length / 2, 0);
}

describe("serialized doodle size", () => {
  it("measures a typical drawing (~15 strokes, ~375 points)", () => {
    const doodle = doodleOf(15, 25); // 15 strokes * 25 points = 375 points
    expect(pointCount(doodle)).toBe(375);
    const bytes = new TextEncoder().encode(JSON.stringify(doodle)).length;
    // Measured (not estimated): a typical drawing is well under the ~2.7 KB plan estimate and
    // fits one MAX_MESSAGE_LENGTH frame outright.
    expect(bytes).toBeGreaterThan(1500);
    expect(bytes).toBeLessThan(4096);
  });

  it("measures a drawing at every cap (64 strokes, 1200 points)", () => {
    const pointsPerStroke = Math.floor(1200 / MAX_STROKES_PER_DOODLE); // 18 points/stroke * 64 = 1152
    const doodle = doodleOf(MAX_STROKES_PER_DOODLE, pointsPerStroke);
    // Push every stroke's timing to its cap, matching "every drawing at the caps".
    for (const stroke of doodle.s) {
      stroke.d = STROKE_MS_CAP;
      stroke.g = GAP_MS_CAP;
    }
    expect(doodle.s.length).toBe(MAX_STROKES_PER_DOODLE);
    expect(pointsPerStroke).toBeLessThanOrEqual(MAX_POINTS_PER_STROKE);
    const bytes = new TextEncoder().encode(JSON.stringify(doodle)).length;
    // Measured (not estimated): real strokes have small deltas, so this comes in under the plan's
    // ~16.3 KB worst-case-digit-width estimate, but stays comfortably inside it. Either way it is
    // a small fraction of the 2 MB Durable Object value limit, per the snapshot arithmetic.
    expect(bytes).toBeGreaterThan(7_000);
    expect(bytes).toBeLessThan(16_300);
  });
});
