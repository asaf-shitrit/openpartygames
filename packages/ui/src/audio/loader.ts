// Decoded sample cache. Loading is fire-and-forget and idempotent: a cue plays its synth until
// its file lands, and a missing file simply leaves the cache cold.
import type { AudioBackend, WebAudioBuffer } from "./backend";
import { AUDIO_CREDITS } from "./credits";
import { musicSampleFor, musicSampleUrl, sampleFor, sampleUrl } from "./manifest";
import { MUSIC_IDS, type CueId, type MusicId } from "./types";

export interface SampleStore {
  get(cue: CueId): WebAudioBuffer | null;
  /** Starts loading one cue's sample. Safe to call more than once. */
  load(cue: CueId): void;
  /** Starts loading every cue with a sample. */
  preload(): void;
  /** Stops accepting in-flight results and empties the cache. */
  dispose(): void;
}

export function createSampleStore(backend: AudioBackend): SampleStore {
  const loaded = new Map<CueId, WebAudioBuffer>();
  const pending = new Set<CueId>();
  let disposed = false;

  function finish(cue: CueId, buffer: WebAudioBuffer): void {
    pending.delete(cue);
    if (!disposed) loaded.set(cue, buffer);
  }

  function fail(cue: CueId): void {
    pending.delete(cue);
  }

  function load(cue: CueId): void {
    const sample = sampleFor(cue);
    if (sample === null || loaded.has(cue) || pending.has(cue)) return;
    pending.add(cue);
    void backend.loadSample(sampleUrl(sample)).then(
      (buffer) => finish(cue, buffer),
      () => fail(cue),
    );
  }

  return {
    get: (cue) => loaded.get(cue) ?? null,
    load,
    preload() {
      for (const credit of AUDIO_CREDITS) load(credit.cue);
    },
    dispose() {
      disposed = true;
      loaded.clear();
      pending.clear();
    },
  };
}

export interface MusicSampleStore {
  get(music: MusicId): WebAudioBuffer | null;
  /** Starts loading one music bed's sample. Safe to call more than once. */
  load(music: MusicId): void;
  /** Starts loading every music bed. */
  preload(): void;
  /** Stops accepting in-flight results and empties the cache. */
  dispose(): void;
}

/** `onLoaded` fires once a music bed finishes decoding, so the engine can retry a pending play. */
export function createMusicSampleStore(
  backend: AudioBackend,
  onLoaded: (music: MusicId) => void,
): MusicSampleStore {
  const loaded = new Map<MusicId, WebAudioBuffer>();
  const pending = new Set<MusicId>();
  let disposed = false;

  function finish(music: MusicId, buffer: WebAudioBuffer): void {
    pending.delete(music);
    if (disposed) return;
    loaded.set(music, buffer);
    onLoaded(music);
  }

  function fail(music: MusicId): void {
    pending.delete(music);
  }

  function load(music: MusicId): void {
    const sample = musicSampleFor(music);
    if (sample === null || loaded.has(music) || pending.has(music)) return;
    pending.add(music);
    void backend.loadSample(musicSampleUrl(sample)).then(
      (buffer) => finish(music, buffer),
      () => fail(music),
    );
  }

  return {
    get: (music) => loaded.get(music) ?? null,
    load,
    preload() {
      for (const id of MUSIC_IDS) load(id);
    },
    dispose() {
      disposed = true;
      loaded.clear();
      pending.clear();
    },
  };
}
