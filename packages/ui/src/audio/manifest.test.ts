import { describe, expect, it } from "vitest";
import { AUDIO_CREDITS, MUSIC_CREDITS } from "./credits";
import { musicSampleFor, musicSampleUrl, sampleFor, sampleUrl } from "./manifest";
import { CUE_IDS, MUSIC_IDS } from "./types";

describe("sample lookup", () => {
  it("resolves every credited cue to an audio path", () => {
    for (const credit of AUDIO_CREDITS) {
      expect(sampleFor(credit.cue)).toBe(credit);
      expect(sampleUrl(credit)).toBe(`/audio/${credit.file}`);
    }
  });

  it("returns null for a cue without a sample", () => {
    const sampled = new Set(AUDIO_CREDITS.map((credit) => credit.cue));
    const unsampled = CUE_IDS.filter((cue) => !sampled.has(cue));
    expect(unsampled.length).toBeGreaterThan(0);
    for (const cue of unsampled) expect(sampleFor(cue)).toBeNull();
  });

  it("credits only CC0 or CC-BY files", () => {
    for (const credit of AUDIO_CREDITS) {
      expect(["CC0-1.0", "CC-BY-3.0", "CC-BY-4.0"]).toContain(credit.license);
      expect(credit.sourceUrl.startsWith("https://")).toBe(true);
      expect(credit.assetUrl.startsWith("https://")).toBe(true);
      expect(credit.author.length).toBeGreaterThan(0);
    }
  });
});

describe("music sample lookup", () => {
  it("resolves every music id to its credit and path", () => {
    for (const id of MUSIC_IDS) {
      const credit = musicSampleFor(id);
      expect(credit).not.toBeNull();
      if (credit === null) continue;
      expect(credit.music).toBe(id);
      expect(musicSampleUrl(credit)).toBe(`/audio/${credit.file}`);
    }
  });

  it("credits only CC0 or CC-BY files with a valid loop region", () => {
    for (const credit of MUSIC_CREDITS) {
      expect(["CC0-1.0", "CC-BY-3.0", "CC-BY-4.0"]).toContain(credit.license);
      expect(credit.sourceUrl.startsWith("https://")).toBe(true);
      expect(credit.assetUrl.startsWith("https://")).toBe(true);
      expect(credit.author.length).toBeGreaterThan(0);
      expect(credit.loopStartSec).toBeGreaterThanOrEqual(0);
      expect(credit.loopEndSec).toBeGreaterThan(credit.loopStartSec);
    }
  });
});
