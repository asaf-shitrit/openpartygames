// Pure synth recipes: cue id in, voices out. The backend turns voices into Web Audio nodes,
// so the whole sound design is data and stays unit-testable without a browser.
import type { CueId } from "./types";

export type VoiceKind = "tone" | "noise";
export type SynthFilterType = "lowpass" | "bandpass";

export interface SynthFilter {
  type: SynthFilterType;
  fromHz: number;
  toHz: number;
  q: number;
}

export interface SynthVoice {
  kind: VoiceKind;
  offsetMs: number;
  durationMs: number;
  /** Relative amplitude, 0..1. The engine scales it by the cue's own gain. */
  gain: number;
  fromHz: number;
  toHz: number;
  wave: OscillatorType;
  /** Noise playback rate; 1 is the base hiss. */
  rate: number;
  filter: SynthFilter | null;
}

export interface CueRecipe {
  voices: readonly SynthVoice[];
}

interface ToneSpec {
  durationMs: number;
  fromHz: number;
  offsetMs?: number;
  toHz?: number;
  gain?: number;
  wave?: OscillatorType;
  filter?: SynthFilter;
}

interface NoiseSpec {
  durationMs: number;
  offsetMs?: number;
  gain?: number;
  rate?: number;
  filter?: SynthFilter;
}

function toneVoice(spec: ToneSpec): SynthVoice {
  return {
    kind: "tone",
    offsetMs: spec.offsetMs ?? 0,
    durationMs: spec.durationMs,
    gain: spec.gain ?? 1,
    fromHz: spec.fromHz,
    toHz: spec.toHz ?? spec.fromHz,
    wave: spec.wave ?? "sine",
    rate: 1,
    filter: spec.filter ?? null,
  };
}

function noiseVoice(spec: NoiseSpec): SynthVoice {
  return {
    kind: "noise",
    offsetMs: spec.offsetMs ?? 0,
    durationMs: spec.durationMs,
    gain: spec.gain ?? 1,
    fromHz: 0,
    toHz: 0,
    wave: "sine",
    rate: spec.rate ?? 1,
    filter: spec.filter ?? null,
  };
}

export const DRUMROLL_DEFAULT_MS = 2000;
const DRUMROLL_HIT_MS = 34;

/** One shot per beat of a drumroll, then a cymbal-ish crash on the last hit. */
function drumrollVoices(durationMs: number): readonly SynthVoice[] {
  const hits = Math.max(1, Math.floor(durationMs / DRUMROLL_HIT_MS));
  const roll = Array.from({ length: hits }, (_, index) =>
    noiseVoice({
      offsetMs: index * DRUMROLL_HIT_MS,
      durationMs: 26,
      gain: 0.16,
      rate: 0.9 + (index % 4) * 0.06,
      filter: { type: "bandpass", fromHz: 1500, toHz: 1100, q: 1.6 },
    }),
  );
  const crashAt = hits * DRUMROLL_HIT_MS;
  return [
    ...roll,
    noiseVoice({
      offsetMs: crashAt,
      durationMs: 140,
      gain: 0.5,
      filter: { type: "bandpass", fromHz: 2200, toHz: 700, q: 1.2 },
    }),
    toneVoice({
      offsetMs: crashAt + 20,
      durationMs: 260,
      fromHz: 210,
      toHz: 80,
      gain: 0.4,
      wave: "triangle",
    }),
  ];
}

const ONE_SHOT = {
  whoosh: {
    voices: [
      noiseVoice({
        durationMs: 340,
        gain: 0.5,
        filter: { type: "bandpass", fromHz: 420, toHz: 3200, q: 0.9 },
      }),
      toneVoice({ durationMs: 240, fromHz: 320, toHz: 900, gain: 0.12 }),
    ],
  },
  scratch: {
    voices: [
      noiseVoice({
        durationMs: 70,
        gain: 0.42,
        filter: { type: "bandpass", fromHz: 3200, toHz: 1400, q: 2.4 },
      }),
      noiseVoice({
        offsetMs: 95,
        durationMs: 55,
        gain: 0.3,
        filter: { type: "bandpass", fromHz: 2600, toHz: 1100, q: 2.4 },
      }),
    ],
  },
  drumroll: { voices: drumrollVoices(DRUMROLL_DEFAULT_MS) },
  slam: {
    voices: [
      toneVoice({
        durationMs: 420,
        fromHz: 190,
        toHz: 46,
        gain: 0.95,
        wave: "triangle",
      }),
      noiseVoice({
        durationMs: 90,
        gain: 0.55,
        filter: { type: "lowpass", fromHz: 1400, toHz: 400, q: 0.7 },
      }),
    ],
  },
  buzzer: {
    voices: [
      toneVoice({
        durationMs: 420,
        fromHz: 162,
        toHz: 150,
        gain: 0.3,
        wave: "sawtooth",
      }),
      toneVoice({
        durationMs: 420,
        fromHz: 168,
        toHz: 156,
        gain: 0.26,
        wave: "square",
      }),
    ],
  },
  boing: {
    voices: [
      toneVoice({
        durationMs: 340,
        fromHz: 720,
        toHz: 150,
        gain: 0.6,
        wave: "triangle",
      }),
      toneVoice({
        offsetMs: 40,
        durationMs: 180,
        fromHz: 980,
        toHz: 260,
        gain: 0.22,
      }),
    ],
  },
  marker: {
    voices: [
      noiseVoice({
        durationMs: 95,
        gain: 0.38,
        filter: { type: "bandpass", fromHz: 3600, toHz: 2400, q: 2.2 },
      }),
      noiseVoice({
        offsetMs: 130,
        durationMs: 70,
        gain: 0.26,
        filter: { type: "bandpass", fromHz: 3000, toHz: 2000, q: 2.2 },
      }),
    ],
  },
  sneak: {
    voices: [
      toneVoice({ durationMs: 90, fromHz: 220, toHz: 300, gain: 0.16 }),
      toneVoice({
        offsetMs: 120,
        durationMs: 90,
        fromHz: 260,
        toHz: 350,
        gain: 0.14,
      }),
      toneVoice({
        offsetMs: 240,
        durationMs: 110,
        fromHz: 300,
        toHz: 420,
        gain: 0.12,
      }),
      noiseVoice({
        offsetMs: 60,
        durationMs: 220,
        gain: 0.06,
        filter: { type: "bandpass", fromHz: 1200, toHz: 800, q: 1.4 },
      }),
    ],
  },
  tape: {
    voices: [
      noiseVoice({
        durationMs: 80,
        gain: 0.5,
        filter: { type: "lowpass", fromHz: 1100, toHz: 500, q: 0.9 },
      }),
      toneVoice({
        durationMs: 120,
        fromHz: 150,
        toHz: 90,
        gain: 0.24,
        wave: "triangle",
      }),
    ],
  },
  pop: {
    voices: [
      toneVoice({ durationMs: 70, fromHz: 340, toHz: 940, gain: 0.55 }),
      noiseVoice({
        durationMs: 28,
        gain: 0.22,
        filter: { type: "lowpass", fromHz: 3000, toHz: 1400, q: 0.8 },
      }),
    ],
  },
  tick: {
    voices: [
      toneVoice({
        durationMs: 36,
        fromHz: 1180,
        toHz: 900,
        gain: 0.26,
        wave: "square",
      }),
    ],
  },
  "tick-final": {
    voices: [
      toneVoice({
        durationMs: 70,
        fromHz: 820,
        toHz: 620,
        gain: 0.4,
        wave: "square",
      }),
      toneVoice({ durationMs: 70, fromHz: 410, toHz: 310, gain: 0.22 }),
    ],
  },
  "jingle-start": {
    voices: [
      toneVoice({ durationMs: 90, fromHz: 392, gain: 0.4, wave: "triangle" }),
      toneVoice({
        offsetMs: 90,
        durationMs: 90,
        fromHz: 494,
        gain: 0.42,
        wave: "triangle",
      }),
      toneVoice({
        offsetMs: 180,
        durationMs: 90,
        fromHz: 587,
        gain: 0.44,
        wave: "triangle",
      }),
      toneVoice({
        offsetMs: 270,
        durationMs: 220,
        fromHz: 784,
        gain: 0.5,
        wave: "triangle",
      }),
    ],
  },
  fanfare: {
    voices: [
      toneVoice({ durationMs: 260, fromHz: 523, gain: 0.5, wave: "square" }),
      toneVoice({ durationMs: 260, fromHz: 659, gain: 0.4, wave: "square" }),
      toneVoice({
        offsetMs: 0,
        durationMs: 260,
        fromHz: 784,
        gain: 0.34,
        wave: "square",
      }),
      toneVoice({
        offsetMs: 260,
        durationMs: 420,
        fromHz: 1047,
        gain: 0.55,
        wave: "triangle",
      }),
    ],
  },
} satisfies Record<CueId, CueRecipe>;

/** The voices for one cue. Only sustained cues read `durationMs`. */
export function recipeFor(cue: CueId, durationMs?: number): CueRecipe {
  if (cue === "drumroll") {
    return { voices: drumrollVoices(durationMs ?? DRUMROLL_DEFAULT_MS) };
  }
  return ONE_SHOT[cue];
}

/** Longest scheduled voice offset, so callers can size a sustained cue. */
export function recipeDurationMs(recipe: CueRecipe): number {
  return recipe.voices.reduce(
    (longest, voice) => Math.max(longest, voice.offsetMs + voice.durationMs),
    0,
  );
}
