import { describe, expect, it } from "vitest";
import {
  SUSPENSE_DOT_TEMPO,
  dotIntervalAt,
  filledDotCount,
  ringClosureFraction,
  suspenseDotBeats,
} from "./suspense-geometry";

describe("ringClosureFraction", () => {
  it("is 0 at the start and 1 once the duration has passed", () => {
    expect(ringClosureFraction(0, 2500)).toBe(0);
    expect(ringClosureFraction(2500, 2500)).toBe(1);
    expect(ringClosureFraction(9000, 2500)).toBe(1);
  });

  it("is linear in between", () => {
    expect(ringClosureFraction(1250, 2500)).toBeCloseTo(0.5);
  });

  it("never goes negative for a time before the beat started", () => {
    expect(ringClosureFraction(-500, 2500)).toBe(0);
  });

  it("is fully closed for a non-positive duration", () => {
    expect(ringClosureFraction(0, 0)).toBe(1);
  });
});

describe("dotIntervalAt", () => {
  const drain = SUSPENSE_DOT_TEMPO.drain;

  it("holds the base interval outside the ramp window", () => {
    expect(dotIntervalAt(15000, drain)).toBe(500);
    expect(dotIntervalAt(5000, drain)).toBe(500);
  });

  it("interpolates down to the minimum inside the ramp window", () => {
    expect(dotIntervalAt(2500, drain)).toBeCloseTo(375);
    expect(dotIntervalAt(0, drain)).toBe(250);
  });

  it("stays constant for a tempo with no ramp window", () => {
    const reveal = SUSPENSE_DOT_TEMPO.reveal;
    expect(dotIntervalAt(2500, reveal)).toBe(416);
    expect(dotIntervalAt(0, reveal)).toBe(416);
  });
});

describe("suspenseDotBeats", () => {
  it("spaces reveal beats evenly and caps the last one at the duration", () => {
    const beats = suspenseDotBeats(2500, SUSPENSE_DOT_TEMPO.reveal);
    expect(beats.map((beat) => beat.atMs)).toEqual([
      416, 832, 1248, 1664, 2080, 2496, 2500,
    ]);
    expect(beats.every((beat) => beat.haptic === "heartbeat")).toBe(true);
    expect(beats[0]?.id).toBe("dot-0");
  });

  it("bunches drain beats closer together near the end", () => {
    const beats = suspenseDotBeats(15000, SUSPENSE_DOT_TEMPO.drain);
    const last = beats.length - 1;
    const lastGap = (beats[last]?.atMs ?? 0) - (beats[last - 1]?.atMs ?? 0);
    const firstGap = (beats[0]?.atMs ?? 0) - 0;
    expect(lastGap).toBeLessThan(firstGap);
    expect(beats[last]?.atMs).toBe(15000);
  });

  it("returns no beats for a zero-length duration", () => {
    expect(suspenseDotBeats(0, SUSPENSE_DOT_TEMPO.reveal)).toEqual([]);
  });
});

describe("filledDotCount", () => {
  it("cycles through 0-3 and wraps back to 1", () => {
    expect(filledDotCount(0)).toBe(0);
    expect(filledDotCount(1)).toBe(1);
    expect(filledDotCount(2)).toBe(2);
    expect(filledDotCount(3)).toBe(3);
    expect(filledDotCount(4)).toBe(1);
    expect(filledDotCount(6)).toBe(3);
    expect(filledDotCount(7)).toBe(1);
  });

  it("never goes negative", () => {
    expect(filledDotCount(-1)).toBe(0);
  });
});
