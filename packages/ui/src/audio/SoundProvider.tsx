// React binding for the sound engine: one provider per surface, `useSound` for status and mute,
// `useCue` for moments. Works without a provider so components can render standalone.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type {
  CueHandle,
  CueId,
  CueOptions,
  MusicId,
  SoundEngine,
  SoundStatus,
} from "./types";
import { SILENT_ENGINE } from "./types";

/** The most recent (topmost) claim's music, or null when nothing has claimed the bus. */export function topClaim(claims: readonly MusicId[]): MusicId | null {
  return claims.length === 0 ? null : (claims.at(-1) ?? null);
}

const SOUND_KEY = "opg:muted";

/** How many in-flight cues `useCue` keeps a handle for, so unmounting can still silence them. */
const MAX_TRACKED_CUES = 16;

/**
 * Events that count as a user gesture for resuming audio. A touch `pointerdown` does not count
 * in browsers (only its `pointerup`/`touchend`/`click` do), so tablets and touchscreen TVs need
 * the release events too; `keydown` covers TV remotes and keyboards.
 */
export const UNLOCK_EVENTS = [
  "pointerdown",
  "pointerup",
  "touchend",
  "click",
  "keydown",
] as const;

export interface SoundContextValue {
  engine: SoundEngine;
  status: SoundStatus;
  muted: boolean;
  setMuted: (muted: boolean) => void;
  toggleMuted: () => void;
  /** Resumes audio. Call it from inside a user gesture. */
  unlock: () => void;
  /** Adds, moves or removes one music claim. `music: null` removes the claim. */
  setMusicClaim: (key: string, music: MusicId | null) => void;
}

const SoundContext = createContext<SoundContextValue | null>(null);

function readStoredMuted(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) === "1";
  } catch {
    return false;
  }
}

function useMutedSetting(): {
  muted: boolean;
  setMuted: (value: boolean) => void;
} {
  const [muted, setMutedState] = useState(readStoredMuted);
  const setMuted = useCallback((value: boolean) => {
    setMutedState(value);
    try {
      localStorage.setItem(SOUND_KEY, value ? "1" : "0");
    } catch {
      /* storage unavailable; keep the in-memory setting */
    }
  }, []);
  return useMemo(() => ({ muted, setMuted }), [muted, setMuted]);
}

function silentStatus(): SoundStatus {
  return "unsupported";
}

function useEngineStatus(engine: SoundEngine): SoundStatus {
  const subscribe = useCallback(
    (onChange: () => void) => engine.subscribe(onChange),
    [engine],
  );
  const read = useCallback(() => engine.status(), [engine]);
  return useSyncExternalStore(subscribe, read, silentStatus);
}

/**
 * One provider-wide stack of music claims, keyed by claiming component instance.
 *
 * Two corrections over a naive `Map.set`:
 * - Changing an existing key's music deletes it first, so it moves to the top of the stack
 *   (`Map` iteration order keeps a re-set key in its old position otherwise).
 * - Several claims can change in the same commit (an unmount plus a mount, say). Rather than
 *   crossfade once per claim change, the actual `engine.playMusic` call is coalesced into a
 *   single microtask, and skipped entirely when the top claim ends up unchanged.
 */
function useMusicClaims(engine: SoundEngine): (
  key: string,
  music: MusicId | null,
) => void {
  const claimsRef = useRef(new Map<string, MusicId>());
  const playedRef = useRef<MusicId | null>(null);
  const flushScheduledRef = useRef(false);

  return useCallback(
    (key: string, music: MusicId | null) => {
      claimsRef.current.delete(key);
      if (music !== null) claimsRef.current.set(key, music);
      if (flushScheduledRef.current) return;
      flushScheduledRef.current = true;
      queueMicrotask(() => {
        flushScheduledRef.current = false;
        const top = topClaim([...claimsRef.current.values()]);
        if (top === playedRef.current) return;
        playedRef.current = top;
        engine.playMusic(top);
      });
    },
    [engine],
  );
}

function useSoundValue(engine: SoundEngine): SoundContextValue {
  const status = useEngineStatus(engine);
  const { muted, setMuted } = useMutedSetting();
  useEffect(() => {
    engine.setMuted(muted);
  }, [engine, muted]);
  const unlock = useCallback(() => {
    engine.unlock();
  }, [engine]);
  const toggleMuted = useCallback(() => setMuted(!muted), [muted, setMuted]);
  const setMusicClaim = useMusicClaims(engine);
  return useMemo(
    () => ({
      engine,
      status,
      muted,
      setMuted,
      toggleMuted,
      unlock,
      setMusicClaim,
    }),
    [engine, status, muted, setMuted, toggleMuted, unlock, setMusicClaim],
  );
}

export interface SoundProviderProps {
  engine: SoundEngine;
  children: ReactNode;
}

export function SoundProvider({ engine, children }: SoundProviderProps) {
  const value = useSoundValue(engine);

  useEffect(() => {
    engine.preload();
  }, [engine]);

  useEffect(() => {
    function resumeWhenVisible(): void {
      if (document.visibilityState === "visible") engine.unlock();
    }
    document.addEventListener("visibilitychange", resumeWhenVisible);
    return () =>
      document.removeEventListener("visibilitychange", resumeWhenVisible);
  }, [engine]);

  // A TV reload lands mid-room with the context locked; the first tap or remote key press
  // anywhere brings the sound back. The listeners go away as soon as it is running or muted.
  useEffect(() => {
    if (value.muted || value.status !== "locked") return undefined;
    function onGesture(): void {
      engine.unlock();
    }
    for (const type of UNLOCK_EVENTS) {
      window.addEventListener(type, onGesture, true);
    }
    return () => {
      for (const type of UNLOCK_EVENTS) {
        window.removeEventListener(type, onGesture, true);
      }
    };
  }, [engine, value.muted, value.status]);

  return (
    <SoundContext.Provider value={value}>{children}</SoundContext.Provider>
  );
}

/** The current sound engine, status and mute flag. Falls back to silence outside a provider. */
export function useSound(): SoundContextValue {
  const provided = useContext(SoundContext);
  // Without a provider a component still gets a working mute flag (persisted), just no sound.
  const fallback = useSoundValue(SILENT_ENGINE);
  return provided ?? fallback;
}

/**
 * Claims a music bed while mounted. Several components may claim at once (a lobby screen and a
 * game's vote phase, say); the engine always plays the most recently claimed id. Changing `music`
 * moves this claim to the top; unmounting drops it back to whatever was claimed before it.
 */
export function useMusic(music: MusicId | null): void {
  const { setMusicClaim } = useSound();
  const claimKey = useId();
  useEffect(() => {
    setMusicClaim(claimKey, music);
    return () => setMusicClaim(claimKey, null);
  }, [claimKey, music, setMusicClaim]);
}

/**
 * Plays cues on the nearest provider's engine. Handles still playing when the calling component
 * unmounts are stopped, so a VIP skip or a phase change silences its moment.
 */
export function useCue(): (cue: CueId, options?: CueOptions) => CueHandle {
  const { engine } = useSound();
  const handlesRef = useRef<Set<CueHandle> | null>(null);

  const activeHandles = useCallback((): Set<CueHandle> => {
    const existing = handlesRef.current;
    if (existing !== null) return existing;
    const created = new Set<CueHandle>();
    handlesRef.current = created;
    return created;
  }, []);

  useEffect(() => {
    const handles = activeHandles();
    return () => {
      for (const handle of handles) handle.stop();
      handles.clear();
    };
  }, [activeHandles]);

  return useCallback(
    (cue: CueId, options?: CueOptions): CueHandle => {
      const inner = engine.play(cue, options);
      const handle: CueHandle = {
        stop() {
          activeHandles().delete(handle);
          inner.stop();
        },
      };
      const handles = activeHandles();
      handles.add(handle);
      // Cues are short, so the newest few are all that can still be audible when this
      // unmounts; a handle per beat would otherwise pile up for a whole game.
      if (handles.size > MAX_TRACKED_CUES) {
        const oldest = handles.values().next().value;
        if (oldest !== undefined) handles.delete(oldest);
      }
      return handle;
    },
    [activeHandles, engine],
  );
}
