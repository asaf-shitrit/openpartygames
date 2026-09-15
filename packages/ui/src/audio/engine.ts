// The SoundEngine implementation. It owns the master gain, the status lifecycle and the
// sample cache; the backend owns Web Audio.
import type {
  AudioBackend,
  WebAudioBuffer,
  WebBufferSourceNode,
  WebGainNode,
} from "./backend";
import { webAudioBackend } from "./backend";
import { musicSampleFor } from "./manifest";
import {
  createMusicSampleStore,
  createSampleStore,
  type SampleStore,
} from "./loader";
import { recipeDurationMs, recipeFor } from "./synth";
import type {
  CueHandle,
  CueId,
  CueOptions,
  MusicId,
  SoundEngine,
  SoundStatus,
} from "./types";
import { SILENT_ENGINE, SILENT_HANDLE } from "./types";

const MUSIC_DEFAULT_GAIN = 0.35;
const MUSIC_DUCK_GAIN = 0.12;
const MUSIC_CROSSFADE_SEC = 0.8;
const DUCK_DOWN_SEC = 0.06;
const DUCK_RECOVER_SEC = 0.5;
const DUCK_RECOVER_DELAY_MS = 150;

/** Cues loud enough that the music should duck out of their way. */
export const DUCKING_CUES: readonly CueId[] = [
  "slam",
  "drumroll",
  "fanfare",
  "jingle-start",
  "buzzer",
];

interface MusicVoice {
  id: MusicId;
  gain: WebGainNode;
  source: WebBufferSourceNode;
}

/** How long a cue's own sound lasts, so ducking can time its recovery. */
function cueDurationMs(
  cue: CueId,
  options: CueOptions | undefined,
  buffer: WebAudioBuffer | null,
): number {
  if (buffer !== null) return buffer.duration * 1000;
  return recipeDurationMs(recipeFor(cue, options?.durationMs));
}

/** Dips the music bus for a loud cue, then recovers once the cue has finished. */
function duckMusicBus(
  musicBus: WebGainNode,
  backend: AudioBackend,
  cue: CueId,
  durationMs: number,
): void {
  if (!DUCKING_CUES.includes(cue)) return;
  const now = backend.currentTime();
  musicBus.gain.cancelScheduledValues(now);
  musicBus.gain.setValueAtTime(musicBus.gain.value, now);
  musicBus.gain.linearRampToValueAtTime(MUSIC_DUCK_GAIN, now + DUCK_DOWN_SEC);
  const recoverAt = now + (durationMs + DUCK_RECOVER_DELAY_MS) / 1000;
  musicBus.gain.setValueAtTime(MUSIC_DUCK_GAIN, recoverAt);
  musicBus.gain.linearRampToValueAtTime(
    MUSIC_DEFAULT_GAIN,
    recoverAt + DUCK_RECOVER_SEC,
  );
}

/** Fades one music voice to silence and stops its source once the fade finishes. */
function fadeOutVoice(backend: AudioBackend, voice: MusicVoice): void {
  const now = backend.currentTime();
  voice.gain.gain.cancelScheduledValues(now);
  voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
  voice.gain.gain.linearRampToValueAtTime(0, now + MUSIC_CROSSFADE_SEC);
  voice.source.stop(now + MUSIC_CROSSFADE_SEC);
}

interface MusicStartSpec {
  id: MusicId;
  buffer: WebAudioBuffer;
  loopStartSec: number;
  loopEndSec: number;
}

/** Starts a new looping music voice, faded in under `musicBus`. */
function startMusicVoice(
  backend: AudioBackend,
  musicBus: WebGainNode,
  spec: MusicStartSpec,
): MusicVoice {
  const now = backend.currentTime();
  const gain = backend.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(1, now + MUSIC_CROSSFADE_SEC);
  gain.connect(musicBus);
  const source = backend.createLoopingSource(
    spec.buffer,
    { loopStart: spec.loopStartSec, loopEnd: spec.loopEndSec },
    gain,
  );
  source.start(now);
  return { id: spec.id, gain, source };
}

interface MusicController {
  playMusic(id: MusicId | null): void;
  /** Re-checks the requested id against the backend's live state, e.g. after it unlocks. */
  resync(): void;
  preload(): void;
}

/** Owns the music bus's crossfade state, independent of the cue-playing status lifecycle. */
function createMusicController(
  backend: AudioBackend,
  musicBus: WebGainNode,
): MusicController {
  let requestedMusic: MusicId | null = null;
  let activeMusic: MusicVoice | null = null;

  function stopActiveMusic(): void {
    if (activeMusic === null) return;
    fadeOutVoice(backend, activeMusic);
    activeMusic = null;
  }

  function startRequestedMusic(id: MusicId): void {
    const credit = musicSampleFor(id);
    const buffer = credit === null ? null : musicSamples.get(id);
    if (credit === null || buffer === null) return;
    const outgoing = activeMusic;
    activeMusic = startMusicVoice(backend, musicBus, {
      id,
      buffer,
      loopStartSec: credit.loopStartSec,
      loopEndSec: credit.loopEndSec,
    });
    if (outgoing !== null) fadeOutVoice(backend, outgoing);
  }

  function resync(): void {
    if (backend.state() !== "running") return;
    if (activeMusic !== null && activeMusic.id === requestedMusic) return;
    if (requestedMusic === null) {
      stopActiveMusic();
      return;
    }
    startRequestedMusic(requestedMusic);
  }

  const musicSamples = createMusicSampleStore(backend, () => resync());

  function playMusic(id: MusicId | null): void {
    if (id === requestedMusic) return;
    requestedMusic = id;
    if (id !== null) musicSamples.load(id);
    resync();
  }

  return { playMusic, resync, preload: () => musicSamples.preload() };
}

interface CuePlayer {
  play(
    cue: CueId,
    options: CueOptions | undefined,
    canPlay: boolean,
  ): CueHandle;
  stopAll(): void;
}

/** Owns in-flight cue voices and the ducking they trigger on the music bus. */
function createCuePlayer(
  backend: AudioBackend,
  samples: SampleStore,
  musicBus: WebGainNode,
): CuePlayer {
  const playing = new Set<CueHandle>();

  /**
   * Tracks one in-flight voice so `stopAll` can reach it, and removes it once its own sound has
   * finished playing (`lifetimeMs`, including any start delay) so a long session's `playing` set
   * does not grow forever with voices nobody ever calls `stop()` on.
   */
  function track(voice: CueHandle, lifetimeMs: number): CueHandle {
    let expireTimer: ReturnType<typeof setTimeout> | null = null;
    const handle: CueHandle = {
      stop() {
        if (expireTimer !== null) clearTimeout(expireTimer);
        playing.delete(handle);
        voice.stop();
      },
    };
    playing.add(handle);
    expireTimer = setTimeout(() => {
      expireTimer = null;
      playing.delete(handle);
    }, lifetimeMs);
    return handle;
  }

  function startCue(
    cue: CueId,
    options: CueOptions | undefined,
    buffer: WebAudioBuffer | null,
  ): CueHandle {
    const at = backend.currentTime() + (options?.delayMs ?? 0) / 1000;
    const gain = clampGain(options?.gain ?? 1);
    if (buffer !== null) return backend.playSample(buffer, at, gain);
    return backend.render(recipeFor(cue, options?.durationMs).voices, at, gain);
  }

  function play(
    cue: CueId,
    options: CueOptions | undefined,
    canPlay: boolean,
  ): CueHandle {
    if (!canPlay) return SILENT_HANDLE;
    const buffer = samples.get(cue);
    const durationMs = cueDurationMs(cue, options, buffer);
    duckMusicBus(musicBus, backend, cue, durationMs);
    const lifetimeMs = (options?.delayMs ?? 0) + durationMs;
    return track(startCue(cue, options, buffer), lifetimeMs);
  }

  function stopAll(): void {
    for (const voice of playing) voice.stop();
    playing.clear();
  }

  return { play, stopAll };
}

/**
 * A live engine, or the silent one when the browser has no Web Audio. The silent engine keeps
 * every caller working: phones and tests use it too.
 */
export function createSoundEngine(backend: AudioBackend | null): SoundEngine {
  return backend === null ? SILENT_ENGINE : createLiveEngine(backend);
}

/** The engine for whatever browser is running: Web Audio when present, silence otherwise. */
export function createBrowserSoundEngine(): SoundEngine {
  return createSoundEngine(webAudioBackend());
}

function createLiveEngine(backend: AudioBackend): SoundEngine {
  const master = backend.createGain();
  master.gain.value = 1;
  master.connect(backend.destination());
  // Cues play through the master gain, so mute silences them along with the music.
  backend.setOutput(master);
  const musicBus = backend.createGain();
  musicBus.gain.value = MUSIC_DEFAULT_GAIN;
  musicBus.connect(master);
  const samples = createSampleStore(backend);
  const music = createMusicController(backend, musicBus);
  const cuePlayer = createCuePlayer(backend, samples, musicBus);
  const listeners = new Set<() => void>();
  let status: SoundStatus = "locked";
  let muted = false;

  function emit(): void {
    for (const listener of listeners) listener();
  }

  function refresh(): void {
    const next: SoundStatus =
      backend.state() === "running" ? "running" : "locked";
    music.resync();
    if (next === status) return;
    status = next;
    emit();
  }

  function unlock(): void {
    if (backend.state() === "running") return;
    void backend.resume().then(refresh, refresh);
  }

  function setMuted(value: boolean): void {
    muted = value;
    master.gain.setValueAtTime(value ? 0 : 1, backend.currentTime());
  }

  function play(cue: CueId, options?: CueOptions): CueHandle {
    refresh();
    return cuePlayer.play(cue, options, !muted && status === "running");
  }

  backend.onStateChange(refresh);
  // A context can already be running (Chrome after prior engagement); adopt that right away.
  refresh();

  return {
    status: () => status,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    unlock,
    setMuted,
    preload: () => {
      samples.preload();
      music.preload();
    },
    play,
    playMusic: (id) => music.playMusic(id),
    stopAll: () => cuePlayer.stopAll(),
  };
}

function clampGain(value: number): number {
  return Math.min(1, Math.max(0, value));
}
