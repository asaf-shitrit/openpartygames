import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ServerClock } from "./game-ui";

/**
 * Returns a clock corrected for skew against the server clock stamp that
 * arrives with every view. Safe to call with a changing `serverNow`.
 */
export function useServerClock(serverNow: number): ServerClock {
  const offsetRef = useRef(0);
  useEffect(() => {
    offsetRef.current = serverNow - Date.now();
  }, [serverNow]);
  return useMemo<ServerClock>(
    () => ({ now: () => Date.now() + offsetRef.current }),
    [],
  );
}

const SOUND_KEY = "opg:muted";

export interface SoundSetting {
  muted: boolean;
  setMuted: (muted: boolean) => void;
  toggle: () => void;
}

/** Mute flag persisted in localStorage. No audio files yet, so this only tracks intent. */
export function useSoundSetting(): SoundSetting {
  const [muted, setMutedState] = useState(() => {
    try {
      return localStorage.getItem(SOUND_KEY) === "1";
    } catch {
      return false;
    }
  });
  const setMuted = useCallback((value: boolean) => {
    setMutedState(value);
    try {
      localStorage.setItem(SOUND_KEY, value ? "1" : "0");
    } catch {
      /* storage unavailable; keep the in-memory setting */
    }
  }, []);
  const toggle = useCallback(() => setMuted(!muted), [muted, setMuted]);
  return { muted, setMuted, toggle };
}
