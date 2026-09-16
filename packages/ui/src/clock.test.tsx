import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import {
  CLOCK_SAMPLE_WINDOW,
  clockOffsetFrom,
  createServerClock,
  nextClockSamples,
} from "./clock";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("nextClockSamples", () => {
  it("appends the newest sample last", () => {
    expect(nextClockSamples([1, 2], 3)).toEqual([1, 2, 3]);
  });

  it("keeps only the newest CLOCK_SAMPLE_WINDOW samples", () => {
    const many = Array.from({ length: CLOCK_SAMPLE_WINDOW + 3 }, (_, i) => i);
    const trimmed = nextClockSamples(many, 99);
    expect(trimmed).toHaveLength(CLOCK_SAMPLE_WINDOW);
    expect(trimmed.at(-1)).toBe(99);
    expect(trimmed[0]).toBe(4);
  });
});

describe("clockOffsetFrom", () => {
  it("returns 0 when there are no samples", () => {
    expect(clockOffsetFrom([])).toBe(0);
  });

  it("picks the largest sample, the least latency-biased estimate", () => {
    expect(clockOffsetFrom([100, -20, 40])).toBe(100);
  });
});

describe("createServerClock", () => {
  it("adds the current offset to the client clock", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000);
    const clock = createServerClock(() => 500);
    expect(clock.now()).toBe(1_500);
  });

  it("reads the offset again on every call", () => {
    let offset = 0;
    const clock = createServerClock(() => offset);
    const before = clock.now();
    offset = 10_000;
    expect(clock.now()).toBeGreaterThanOrEqual(before + 10_000);
  });
});
