import { describe, expect, it } from "vitest";
import {
  msUntilNextSecond,
  ringFraction,
  secondsLeft,
  timerStage,
} from "./timer-stage";

describe("timerStage", () => {
  it.each([
    [null, "idle"],
    [10_001, "calm"],
    [10_000, "hurry"],
    [5_000, "urgent"],
    [3_000, "final"],
    [0, "done"],
    [-500, "done"],
  ] as const)("%s ms left is %s", (msLeft, stage) => {
    expect(timerStage(msLeft)).toBe(stage);
  });
});

describe("secondsLeft", () => {
  it("is null without a deadline", () => {
    expect(secondsLeft(null, 0)).toBeNull();
  });

  it("ceils and clamps at zero", () => {
    expect(secondsLeft(10_500, 0)).toBe(11);
    expect(secondsLeft(10_000, 0)).toBe(10);
    expect(secondsLeft(1_000, 5_000)).toBe(0);
  });
});

describe("msUntilNextSecond", () => {
  it("returns the ms remaining to the next whole-second boundary", () => {
    expect(msUntilNextSecond(10_000, 7_500)).toBe(500);
    expect(msUntilNextSecond(10_000, 8_000)).toBe(1_000);
  });

  it("never returns less than 16ms", () => {
    expect(msUntilNextSecond(10_000, 9_990)).toBe(16);
  });

  it("handles a deadline already passed", () => {
    expect(msUntilNextSecond(10_000, 10_050)).toBe(950);
  });
});

describe("ringFraction", () => {
  it("is null without a start time or deadline", () => {
    expect(ringFraction(null, 10_000, 0)).toBeNull();
    expect(ringFraction(0, null, 0)).toBeNull();
  });

  it("is 1 at the start and 0 at the deadline", () => {
    expect(ringFraction(0, 10_000, 0)).toBe(1);
    expect(ringFraction(0, 10_000, 10_000)).toBe(0);
    expect(ringFraction(0, 10_000, 5_000)).toBe(0.5);
  });

  it("clamps to [0,1] outside the window", () => {
    expect(ringFraction(0, 10_000, -1_000)).toBe(1);
    expect(ringFraction(0, 10_000, 20_000)).toBe(0);
  });

  it("is 0 for a non-positive duration", () => {
    expect(ringFraction(10_000, 10_000, 5_000)).toBe(0);
    expect(ringFraction(10_000, 5_000, 5_000)).toBe(0);
  });
});
