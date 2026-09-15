import { describe, expect, it } from "vitest";
import { countAt, easeOutCubic, formatPoints } from "./count-up";

describe("easeOutCubic", () => {
  it("starts at 0 and ends at 1", () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
  });

  it("clamps outside [0,1]", () => {
    expect(easeOutCubic(-1)).toBe(0);
    expect(easeOutCubic(2)).toBe(1);
  });

  it("is greater than linear partway through (fast start)", () => {
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5);
  });
});

describe("countAt", () => {
  it("starts at from and ends at to", () => {
    expect(countAt(0, 1000, 0)).toBe(0);
    expect(countAt(0, 1000, 1)).toBe(1000);
  });

  it("rounds to an integer", () => {
    expect(Number.isInteger(countAt(0, 7, 0.5))).toBe(true);
  });

  it("clamps progress beyond the range", () => {
    expect(countAt(0, 100, 2)).toBe(100);
    expect(countAt(0, 100, -1)).toBe(0);
  });

  it("works when counting down", () => {
    expect(countAt(500, 0, 1)).toBe(0);
    expect(countAt(500, 0, 0)).toBe(500);
  });
});

describe("formatPoints", () => {
  it("adds thousands separators", () => {
    expect(formatPoints(1500)).toBe("1,500");
  });

  it("formats small numbers plainly", () => {
    expect(formatPoints(7)).toBe("7");
  });

  it("formats zero", () => {
    expect(formatPoints(0)).toBe("0");
  });
});
