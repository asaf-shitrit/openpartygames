import { describe, expect, it } from "vitest";
import { MARKER_ADVANCE, fitTextSize, longestWordLength } from "./text-fit";

describe("longestWordLength", () => {
  it("counts the longest word, not the whole string", () => {
    expect(longestWordLength("flight attendant")).toBe(9);
  });

  it("counts code points, so an emoji is one character", () => {
    expect(longestWordLength("🎉🎉")).toBe(2);
  });

  it("is zero for empty and whitespace-only text", () => {
    expect(longestWordLength("")).toBe(0);
    expect(longestWordLength("   ")).toBe(0);
  });
});

describe("fitTextSize", () => {
  const opts = { max: 72, min: 24, widthPx: 240 };

  it("leaves short words at the full size", () => {
    expect(fitTextSize("zebra", opts)).toBe(72);
  });

  it("shrinks a word that would not fit", () => {
    const size = fitTextSize("refrigerator", opts);
    expect(size).toBeLessThan(72);
    expect(size * "refrigerator".length * MARKER_ADVANCE).toBeLessThanOrEqual(240);
  });

  it("never goes below the floor, however long the word", () => {
    expect(fitTextSize("a".repeat(80), opts)).toBe(24);
  });

  it("keeps the longest word inside the width for every pack word we ship", () => {
    for (const word of ["dishwasher", "washing machine", "flight attendant", "police officer"]) {
      const size = fitTextSize(word, opts);
      const widest = longestWordLength(word) * size * MARKER_ADVANCE;
      expect(widest).toBeLessThanOrEqual(opts.widthPx);
    }
  });

  it("falls back to the full size for empty text", () => {
    expect(fitTextSize("", opts)).toBe(72);
  });
});
