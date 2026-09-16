// Sound contract shared by the audio engine, moments and game UIs. Only the TV plays sound;
// phones get SILENT_ENGINE so game components can call the same hooks everywhere.

/** Every sound cue. Each has a synth recipe, and most also have a sample file that replaces it once loaded. */
export const CUE_IDS = [
  "whoosh",
  "scratch",
  "drumroll",
  "slam",
  "buzzer",
  "boing",
  "marker",
  "sneak",
  "tape",
  "pop",
  "tick",
  "tick-final",
  "jingle-start",
  "fanfare",
] as const;

export type CueId = (typeof CUE_IDS)[number];

/** Music beds the TV can loop. Only one plays at a time; see `SoundEngine.playMusic`. */
export const MUSIC_IDS = ["lobby", "tension"] as const;

export type MusicId = (typeof MUSIC_IDS)[number];

/** "locked": the browser needs a tap or key press first. "unsupported": no Web Audio. */
export type SoundStatus = "locked" | "running" | "unsupported";

export interface CueOptions {
  /** Start this many ms from now. */
  delayMs?: number;
  /** Multiplier on the cue's own gain, 0..1. */
  gain?: number;
  /** Length of sustained synth cues such as the drumroll. */
  durationMs?: number;
}

export interface CueHandle {
  stop(): void;
}

export interface SoundEngine {
  status(): SoundStatus;
  /** Calls listener whenever status() changes. Returns the unsubscribe function. */
  subscribe(listener: () => void): () => void;
  /** Resumes audio. Call it from inside a user gesture (click, key press). */
  unlock(): void;
  setMuted(muted: boolean): void;
  /** Starts fetching and decoding sample files. Safe to call more than once. */
  preload(): void;
  play(cue: CueId, options?: CueOptions): CueHandle;
  /** Crossfades to this music bed, or fades out to silence when `id` is null. */
  playMusic(id: MusicId | null): void;
  /** Stops every cue that is still playing. Music keeps playing until it is faded out. */
  stopAll(): void;
}

export const SILENT_HANDLE: CueHandle = {
  stop() {
    /* nothing is playing */
  },
};

/** An engine that never makes a sound: phones, tests and browsers without Web Audio. */
export const SILENT_ENGINE: SoundEngine = {
  status: () => "unsupported",
  subscribe: () => () => {
    /* status never changes */
  },
  unlock() {
    /* nothing to resume */
  },
  setMuted() {
    /* always silent */
  },
  preload() {
    /* no samples */
  },
  play: () => SILENT_HANDLE,
  playMusic() {
    /* nothing to play */
  },
  stopAll() {
    /* nothing is playing */
  },
};
