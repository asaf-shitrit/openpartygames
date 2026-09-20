import { describe, expect, it } from "vitest";
import { captureDuration, captureGap, finalizeStroke } from "./capture";
import { GAP_MS_CAP, STROKE_MS_CAP, TICK_MS } from "./types";
import { deltaDecode } from "./geometry";

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
