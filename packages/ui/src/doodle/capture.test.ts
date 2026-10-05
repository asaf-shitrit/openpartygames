import { describe, expect, it } from "vitest";
import { captureDuration, captureGap, doodleIsFull, finalizeStroke, finalizeStrokes } from "./capture";
import {
  doodleSchema,
  GAP_MS_CAP,
  GRID,
  MAX_POINTS_PER_DOODLE,
  MAX_POINTS_PER_STROKE,
  MAX_STROKES_PER_DOODLE,
  STROKE_MS_CAP,
  strokeSchema,
  TICK_MS,
} from "@opg/sdk";
import type { GridPoint, Stroke } from "@opg/sdk";
import { deltaDecode } from "./geometry";
import { DOODLE_INKS } from "./inks";

describe("captureDuration / captureGap", () => {
  it("quantizes to TICK_MS", () => {
    expect(captureDuration(207)).toBe(200);
    expect(captureGap(211)).toBe(220);
  });

  it("caps at STROKE_MS_CAP / GAP_MS_CAP", () => {
    expect(captureDuration(STROKE_MS_CAP + 5000)).toBe(STROKE_MS_CAP);
    expect(captureGap(GAP_MS_CAP + 5000)).toBe(GAP_MS_CAP);
  });

  it("floors a negative or zero measurement at zero", () => {
    expect(captureDuration(-50)).toBe(0);
    expect(captureGap(0)).toBe(0);
  });

  it("rounds to the nearest tick", () => {
    expect(captureDuration(TICK_MS / 2 - 1)).toBe(0);
    expect(captureDuration(TICK_MS / 2 + 1)).toBe(TICK_MS);
  });
});

describe("finalizeStroke", () => {
  it("packs ink, quantized timing and the simplified, delta-encoded points", () => {
    const raw: [number, number][] = [
      [0, 0],
      [10, 0],
      [20, 0],
      [500, 500],
    ];
    const stroke = finalizeStroke(2, raw, 150, 40);
    expect(stroke.c).toBe(2);
    expect(stroke.d).toBe(160); // 150 -> nearest 20ms tick
    expect(stroke.g).toBe(40);
    // (10,0) simplifies away (colinear with (0,0)-(20,0)); (20,0) survives, it bends toward (500,500).
    expect(deltaDecode(stroke.p)).toEqual([[0, 0], [20, 0], [500, 500]]);
  });

  it("packs an empty trail to an empty stroke path", () => {
    const stroke = finalizeStroke(0, [], 0, 0);
    expect(stroke.p).toEqual([]);
  });
});

/** A zigzag across the whole grid, every point a corner simplification must keep. */
function zigzagOf(length: number): GridPoint[] {
  return Array.from({ length }, (_, i) => [(i * 37) % GRID, i % 2 === 0 ? 0 : GRID - 1]);
}

function strokeOfPoints(count: number): Stroke {
  // A zigzag in the middle of the grid: every running point stays on it.
  const p = [500, 500];
  for (let i = 1; i < count; i += 1) p.push(i % 2 === 0 ? -1 : 1, i % 2 === 0 ? -40 : 40);
  return { c: 0, d: 0, g: 0, p };
}

// The pad and the rules share one stroke model, so whatever the pad can produce, the room accepts.
describe("a captured stroke passes the rules' schema", () => {
  it("at the point cap, the corners of the grid, the timing caps and every ink", () => {
    for (let ink = 0; ink < DOODLE_INKS.length; ink += 1) {
      const stroke = finalizeStroke(ink, zigzagOf(MAX_POINTS_PER_STROKE), STROKE_MS_CAP * 10, GAP_MS_CAP * 10);
      expect(strokeSchema.safeParse(stroke).success).toBe(true);
    }
  });
});

describe("finalizeStrokes splits a trail longer than the point cap (#126)", () => {
  const trail = zigzagOf(1000);

  it("emits only strokes the schema accepts, each within the cap", () => {
    const pieces = finalizeStrokes({ ink: 1, points: trail, durationMs: 2000, gapMs: 100 }, []);
    expect(pieces.length).toBeGreaterThan(1);
    for (const piece of pieces) expect(strokeSchema.safeParse(piece).success).toBe(true);
  });

  it("continues each piece from the last point of the one before, so it draws the same line", () => {
    const pieces = finalizeStrokes({ ink: 1, points: trail, durationMs: 2000, gapMs: 100 }, []);
    const decoded = pieces.map((piece) => deltaDecode(piece.p));
    for (let i = 1; i < decoded.length; i += 1) {
      expect(decoded[i]?.[0]).toEqual(decoded[i - 1]?.at(-1));
    }
    const joined = decoded.flatMap((points, i) => (i === 0 ? points : points.slice(1)));
    expect(joined).toEqual(trail);
  });

  it("keeps the ink, puts the pause before the first piece only and splits the time", () => {
    const pieces = finalizeStrokes({ ink: 3, points: trail, durationMs: 2000, gapMs: 100 }, []);
    expect(pieces.every((piece) => piece.c === 3)).toBe(true);
    expect(pieces[0]?.g).toBe(100);
    expect(pieces.slice(1).every((piece) => piece.g === 0)).toBe(true);
    expect(pieces.reduce((sum, piece) => sum + piece.d, 0)).toBeLessThanOrEqual(2000 + TICK_MS * pieces.length);
  });

  it("returns one stroke for a short trail, same as finalizeStroke", () => {
    const short = zigzagOf(10);
    expect(finalizeStrokes({ ink: 2, points: short, durationMs: 400, gapMs: 40 }, [])).toEqual([finalizeStroke(2, short, 400, 40)]);
  });

  it("stops at MAX_STROKES_PER_DOODLE so the doodle stays valid", () => {
    const existing = Array.from({ length: MAX_STROKES_PER_DOODLE - 2 }, () => strokeOfPoints(2));
    const pieces = finalizeStrokes({ ink: 0, points: trail, durationMs: 2000, gapMs: 0 }, existing);
    expect(pieces).toHaveLength(2);
    expect(doodleSchema.safeParse({ v: 1, s: [...existing, ...pieces] }).success).toBe(true);
  });

  it("emits nothing once the doodle is full", () => {
    const existing = Array.from({ length: MAX_STROKES_PER_DOODLE }, () => strokeOfPoints(2));
    expect(finalizeStrokes({ ink: 0, points: trail, durationMs: 2000, gapMs: 0 }, existing)).toEqual([]);
  });

  it("trims the last piece to the points the doodle has left", () => {
    const before = Array.from({ length: 8 }, () => strokeOfPoints(MAX_POINTS_PER_STROKE));
    const used = before.reduce((n, s) => n + s.p.length / 2, 0);
    const pieces = finalizeStrokes({ ink: 0, points: trail, durationMs: 2000, gapMs: 0 }, before);
    const added = pieces.reduce((n, s) => n + s.p.length / 2, 0);
    expect(used + added).toBe(MAX_POINTS_PER_DOODLE);
    for (const piece of pieces) expect(strokeSchema.safeParse(piece).success).toBe(true);
  });
});

describe("doodleIsFull", () => {
  it("is false for an empty doodle and true at either cap", () => {
    expect(doodleIsFull([])).toBe(false);
    expect(doodleIsFull(Array.from({ length: MAX_STROKES_PER_DOODLE }, () => strokeOfPoints(2)))).toBe(true);
    const heavy = Array.from({ length: Math.ceil(MAX_POINTS_PER_DOODLE / MAX_POINTS_PER_STROKE) }, () =>
      strokeOfPoints(MAX_POINTS_PER_STROKE),
    );
    expect(doodleIsFull(heavy)).toBe(true);
    expect(doodleIsFull(heavy.slice(2))).toBe(false);
  });
});
