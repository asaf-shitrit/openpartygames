import { describe, expect, it } from "vitest";
import { paintDoodle } from "./paint";
import type { DoodleCanvasContext } from "./paint";
import { deltaEncode } from "./geometry";
import { DOODLE_INKS } from "./inks";
import type { Doodle, GridPoint } from "./types";

type Call =
  | { op: "save" | "restore" | "beginPath" | "stroke" }
  | { op: "clearRect"; x: number; y: number; width: number; height: number }
  | { op: "moveTo" | "lineTo"; x: number; y: number };

function recordingContext() {
  const calls: Call[] = [];
  const ctx: DoodleCanvasContext = {
    strokeStyle: "",
    lineWidth: 1,
    lineCap: "butt",
    lineJoin: "miter",
    save: () => calls.push({ op: "save" }),
    restore: () => calls.push({ op: "restore" }),
    clearRect: (x, y, width, height) => calls.push({ op: "clearRect", x, y, width, height }),
    beginPath: () => calls.push({ op: "beginPath" }),
    moveTo: (x, y) => calls.push({ op: "moveTo", x, y }),
    lineTo: (x, y) => calls.push({ op: "lineTo", x, y }),
    stroke: () => calls.push({ op: "stroke" }),
  };
  return { ctx, calls };
}

function doodleOf(strokePoints: GridPoint[][], colors: number[] = []): Doodle {
  return {
    v: 1,
    s: strokePoints.map((points, i) => ({
      c: colors[i] ?? 0,
      d: 100,
      g: 0,
      p: deltaEncode(points),
    })),
  };
}

const BOX = { width: 300, height: 300 };

describe("paintDoodle", () => {
  it("clears the box even for an empty doodle", () => {
    const { ctx, calls } = recordingContext();
    paintDoodle(ctx, { v: 1, s: [] }, { inks: DOODLE_INKS, box: BOX });
    expect(calls).toEqual([
      { op: "save" },
      { op: "clearRect", x: 0, y: 0, width: 300, height: 300 },
      { op: "restore" },
    ]);
  });

  it("paints a stroke's points scaled into the box, using its ink", () => {
    const { ctx, calls } = recordingContext();
    const doodle = doodleOf([[[0, 0], [1023, 1023]]], [2]);
    paintDoodle(ctx, doodle, { inks: DOODLE_INKS, box: BOX });
    expect(ctx.strokeStyle).toBe(DOODLE_INKS[2]);
    expect(calls).toEqual([
      { op: "save" },
      { op: "clearRect", x: 0, y: 0, width: 300, height: 300 },
      { op: "beginPath" },
      { op: "moveTo", x: 0, y: 0 },
      { op: "lineTo", x: 300, y: 300 },
      { op: "stroke" },
      { op: "restore" },
    ]);
  });

  it("draws a single-point stroke as a dot (a degenerate zero-length line)", () => {
    const { ctx, calls } = recordingContext();
    const doodle = doodleOf([[[512, 512]]]);
    paintDoodle(ctx, doodle, { inks: DOODLE_INKS, box: BOX });
    expect(calls.filter((c) => c.op === "lineTo")).toHaveLength(1);
  });

  it("skips strokes before `current` fully, paints current up to its fraction, skips the rest", () => {
    const { ctx, calls } = recordingContext();
    const doodle = doodleOf([
      [[0, 0], [100, 0], [200, 0]],
      [[0, 100], [100, 100], [200, 100], [300, 100]],
      [[0, 200], [100, 200]],
    ]);
    paintDoodle(ctx, doodle, {
      inks: DOODLE_INKS,
      box: BOX,
      upTo: { complete: 1, current: 1, fraction: 0.5 },
    });
    const moveTos = calls.filter((c) => c.op === "moveTo");
    const lineTos = calls.filter((c) => c.op === "lineTo");
    // Stroke 0 (complete): full 3 points -> 1 moveTo + 2 lineTo.
    // Stroke 1 (current, fraction 0.5 of 4 points): ceil(0.5*3)+1 = 3 points -> 1 moveTo + 2 lineTo.
    // Stroke 2 (after current): skipped entirely.
    expect(moveTos).toHaveLength(2);
    expect(lineTos).toHaveLength(4);
  });

  it("falls back to the first ink for an out-of-range palette index", () => {
    const { ctx } = recordingContext();
    const doodle = doodleOf([[[0, 0], [10, 10]]], [99]);
    paintDoodle(ctx, doodle, { inks: DOODLE_INKS, box: BOX });
    expect(ctx.strokeStyle).toBe(DOODLE_INKS[0]);
  });
});
