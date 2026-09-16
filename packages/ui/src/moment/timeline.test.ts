import { describe, expect, it } from "vitest";
import type { Beat } from "./timeline";
import {
  CUE_GRACE_MS,
  anchorAt,
  beatIndexAt,
  beatIndexOf,
  isFreshEntry,
  msUntilNextBeat,
  spacedBeats,
} from "./timeline";

const BEATS: readonly Beat[] = [
  { id: "verdict", atMs: 8000 },
  { id: "decoy", atMs: 9000 },
  { id: "last-chance", atMs: 10500 },
];

describe("beatIndexAt", () => {
  it.each([
    ["empty beats", [], 5000, -1],
    ["before the first beat", BEATS, -1, -1],
    ["exactly on the first beat", BEATS, 8000, 0],
    ["between beats", BEATS, 8999, 0],
    ["exactly on a later beat", BEATS, 9000, 1],
    ["after the last beat", BEATS, 99999, 2],
  ])("%s", (_label, beats, elapsedMs, expected) => {
    expect(beatIndexAt(beats, elapsedMs)).toBe(expected);
  });
});

describe("msUntilNextBeat", () => {
  it.each([
    ["empty beats", [], 0, null],
    ["before the first beat", BEATS, 0, 8000],
    ["exactly on a beat", BEATS, 8000, 1000],
    ["between beats", BEATS, 9500, 1000],
    ["after the last beat", BEATS, 10500, null],
  ])("%s", (_label, beats, elapsedMs, expected) => {
    expect(msUntilNextBeat(beats, elapsedMs)).toBe(expected);
  });
});

describe("isFreshEntry", () => {
  const beat: Beat = { id: "verdict", atMs: 8000 };
  it.each([
    ["before the beat", 7999, CUE_GRACE_MS, false],
    ["exactly on the beat", 8000, CUE_GRACE_MS, true],
    ["inside the grace window", 8400, CUE_GRACE_MS, true],
    ["at the grace boundary", 8600, CUE_GRACE_MS, true],
    ["past the grace window", 8601, CUE_GRACE_MS, false],
    ["with a short custom grace", 8100, 50, false],
  ])("%s", (_label, elapsedMs, graceMs, expected) => {
    expect(isFreshEntry(beat, elapsedMs, graceMs)).toBe(expected);
  });
});

describe("anchorAt", () => {
  it("prefers timerStartedAt", () => {
    expect(anchorAt(1000, 5000, 2000)).toBe(1000);
  });

  it("falls back to deadline minus duration", () => {
    expect(anchorAt(null, 5000, 2000)).toBe(3000);
  });

  it("is null when both are null", () => {
    expect(anchorAt(null, null, 2000)).toBeNull();
  });

  it("keeps timerStartedAt when there is no deadline", () => {
    expect(anchorAt(1000, null, 2000)).toBe(1000);
  });

  it("treats a missing timerStartedAt like null", () => {
    expect(anchorAt(undefined, 5000, 2000)).toBe(3000);
    expect(anchorAt(undefined, null, 2000)).toBeNull();
  });
});

describe("spacedBeats", () => {
  it("returns nothing for zero or negative counts", () => {
    expect(
      spacedBeats({
        prefix: "mark",
        startMs: 0,
        count: 0,
        spanMs: 3600,
        maxStepMs: 450,
      }),
    ).toEqual([]);
    expect(
      spacedBeats({
        prefix: "mark",
        startMs: 0,
        count: -2,
        spanMs: 3600,
        maxStepMs: 450,
      }),
    ).toEqual([]);
  });

  it("spaces the count across the span", () => {
    expect(
      spacedBeats({
        prefix: "mark",
        startMs: 1500,
        count: 4,
        spanMs: 3600,
        maxStepMs: 450,
      }),
    ).toEqual([
      { id: "mark-0", atMs: 1500 },
      { id: "mark-1", atMs: 1950 },
      { id: "mark-2", atMs: 2400 },
      { id: "mark-3", atMs: 2850 },
    ]);
  });

  it("caps the step at maxStepMs", () => {
    expect(
      spacedBeats({
        prefix: "mark",
        startMs: 0,
        count: 2,
        spanMs: 8000,
        maxStepMs: 450,
      }),
    ).toEqual([
      { id: "mark-0", atMs: 0 },
      { id: "mark-1", atMs: 450 },
    ]);
  });

  it("carries the cue when one is given", () => {
    const beats = spacedBeats({
      prefix: "mark",
      startMs: 0,
      count: 1,
      spanMs: 400,
      maxStepMs: 400,
      cue: "scratch",
    });
    expect(beats[0]).toEqual({ id: "mark-0", atMs: 0, cue: "scratch" });
  });
});

describe("beatIndexOf", () => {
  it("finds a beat by id", () => {
    expect(beatIndexOf(BEATS, "decoy")).toBe(1);
  });

  it("is -1 for an unknown id", () => {
    expect(beatIndexOf(BEATS, "nope")).toBe(-1);
  });
});
