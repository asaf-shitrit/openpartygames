import { describe, expect, it } from "vitest";
import { CUE_IDS } from "./types";
import { DRUMROLL_DEFAULT_MS, recipeDurationMs, recipeFor } from "./synth";

describe("recipeFor", () => {
  it("gives every cue at least one audible voice", () => {
    for (const cue of CUE_IDS) {
      const recipe = recipeFor(cue);
      expect(recipe.voices.length).toBeGreaterThan(0);
      for (const voice of recipe.voices) {
        expect(voice.durationMs).toBeGreaterThan(0);
        expect(voice.gain).toBeGreaterThan(0);
        expect(voice.gain).toBeLessThanOrEqual(1);
        expect(voice.offsetMs).toBeGreaterThanOrEqual(0);
        expect(voice.fromHz).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("keeps a slice short and a drumroll long", () => {
    expect(recipeDurationMs(recipeFor("tick"))).toBeLessThan(100);
    expect(recipeDurationMs(recipeFor("drumroll"))).toBeGreaterThanOrEqual(
      DRUMROLL_DEFAULT_MS,
    );
  });

  it("scales the drumroll with durationMs", () => {
    const short = recipeFor("drumroll", 1000);
    const long = recipeFor("drumroll", 4000);
    expect(long.voices.length).toBeGreaterThan(short.voices.length);
    expect(recipeDurationMs(long)).toBeGreaterThanOrEqual(4000);
    expect(recipeDurationMs(long)).toBeLessThan(4400);
  });

  it("falls back to the default drumroll length", () => {
    expect(recipeFor("drumroll").voices.length).toBe(
      recipeFor("drumroll", DRUMROLL_DEFAULT_MS).voices.length,
    );
  });

  it("sweeps the slam tone down and filters the whoosh", () => {
    const slam = recipeFor("slam").voices;
    expect(slam[0]?.fromHz).toBeGreaterThan(slam[0]?.toHz ?? 0);
    const whoosh = recipeFor("whoosh").voices;
    expect(whoosh[0]?.kind).toBe("noise");
    expect(whoosh[0]?.filter?.type).toBe("bandpass");
  });

  it("leaves filterless voices null and keeps the slice clipped", () => {
    const tick = recipeFor("tick").voices[0];
    expect(tick?.filter).toBeNull();
    expect(tick?.wave).toBe("square");
    expect(tick?.durationMs).toBeLessThan(50);
  });

  it("gives drumroll hits a playback rate and a crash tail", () => {
    const drumroll = recipeFor("drumroll", 200).voices;
    const noiseVoices = drumroll.filter((voice) => voice.kind === "noise");
    expect(noiseVoices.length).toBeGreaterThan(0);
    for (const voice of noiseVoices) {
      expect(voice.filter).not.toBeNull();
      expect(voice.rate).toBeGreaterThan(0);
    }
  });

  it("returns a zero duration for an empty recipe", () => {
    expect(recipeDurationMs({ voices: [] })).toBe(0);
  });
});
