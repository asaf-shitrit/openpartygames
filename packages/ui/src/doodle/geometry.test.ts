import { describe, expect, it } from "vitest";
import {
  deltaDecode,
  deltaEncode,
  doodleBounds,
  gridPointOf,
  simplifyStroke,
} from "./geometry";
import { GRID } from "./types";
import type { Doodle, GridPoint } from "./types";

const RECT = { left: 100, top: 200, width: 300, height: 300 };

function doodleOf(points: GridPoint[][]): Doodle {
  return {
    v: 1,
    s: points.map((strokePoints) => ({
      c: 0,
      d: 0,
      g: 0,
      p: deltaEncode(strokePoints),
    })),
  };
}

describe("gridPointOf", () => {
  it("maps the top-left corner to grid 0,0", () => {
    expect(gridPointOf(100, 200, RECT)).toEqual([0, 0]);
  });

  it("maps the bottom-right corner to the far grid edge", () => {
    expect(gridPointOf(400, 500, RECT)).toEqual([GRID - 1, GRID - 1]);
  });

  it("maps the center to the middle of the grid", () => {
    expect(gridPointOf(250, 350, RECT)).toEqual([Math.round((GRID - 1) / 2), Math.round((GRID - 1) / 2)]);
  });

  it("clamps points outside the rect", () => {
    expect(gridPointOf(-500, -500, RECT)).toEqual([0, 0]);
    expect(gridPointOf(5000, 5000, RECT)).toEqual([GRID - 1, GRID - 1]);
  });

  it("tolerates a zero-size rect instead of dividing by zero", () => {
    const zero = { left: 10, top: 10, width: 0, height: 0 };
    expect(gridPointOf(10, 10, zero)).toEqual([0, 0]);
  });
});

describe("simplifyStroke", () => {
  it("returns an empty stroke unchanged", () => {
    expect(simplifyStroke([])).toEqual([]);
  });

  it("keeps a single point", () => {
    const points: GridPoint[] = [[10, 10]];
    expect(simplifyStroke(points)).toEqual([[10, 10]]);
  });

  it("drops samples within MIN_STEP of the last kept point", () => {
    const points: GridPoint[] = [
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
      [100, 0],
    ];
    expect(simplifyStroke(points)).toEqual([[0, 0], [100, 0]]);
  });

  it("collapses a straight line to its endpoints", () => {
    const points: GridPoint[] = [];
    for (let i = 0; i <= 100; i += 10) points.push([i, i]);
    expect(simplifyStroke(points)).toEqual([[0, 0], [100, 100]]);
  });

  it("keeps a point that bends the line beyond RDP_EPSILON", () => {
    const points: GridPoint[] = [
      [0, 0],
      [50, 0],
      [100, 50],
      [200, 50],
    ];
    const simplified = simplifyStroke(points);
    expect(simplified[0]).toEqual([0, 0]);
    expect(simplified[simplified.length - 1]).toEqual([200, 50]);
    expect(simplified.length).toBeGreaterThan(2);
  });

  it("always keeps the stroke's final point", () => {
    const points: GridPoint[] = [
      [0, 0],
      [10, 0],
      [20, 0],
      [20, 3],
    ];
    const simplified = simplifyStroke(points);
    expect(simplified[simplified.length - 1]).toEqual([20, 3]);
  });
});

describe("deltaEncode / deltaDecode", () => {
  it("round-trips an empty stroke", () => {
    expect(deltaEncode([])).toEqual([]);
    expect(deltaDecode([])).toEqual([]);
  });

  it("round-trips a single point", () => {
    const points: GridPoint[] = [[12, 34]];
    expect(deltaDecode(deltaEncode(points))).toEqual(points);
  });

  it("round-trips several points, including negative deltas", () => {
    const points: GridPoint[] = [
      [500, 500],
      [512, 490],
      [480, 470],
      [480, 470],
    ];
    const encoded = deltaEncode(points);
    expect(encoded).toEqual([500, 500, 12, -10, -32, -20, 0, 0]);
    expect(deltaDecode(encoded)).toEqual(points);
  });
});

describe("doodleBounds", () => {
  it("bounds an untouched doodle to the origin", () => {
    expect(doodleBounds({ v: 1, s: [] })).toEqual({ minX: 0, minY: 0, maxX: 0, maxY: 0 });
  });

  it("bounds a single point to itself", () => {
    expect(doodleBounds(doodleOf([[[50, 60]]]))).toEqual({
      minX: 50,
      minY: 60,
      maxX: 50,
      maxY: 60,
    });
  });

  it("spans across every stroke", () => {
    const doodle = doodleOf([
      [[10, 900], [20, 800]],
      [[900, 10], [850, 40]],
    ]);
    expect(doodleBounds(doodle)).toEqual({ minX: 10, minY: 10, maxX: 900, maxY: 900 });
  });
});
