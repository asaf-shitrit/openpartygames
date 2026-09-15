// Full-screen and keep-awake controls for TV host screens.
import { useEffect, useState } from "react";

export interface FullscreenControl {
  /** The browser lets this page go full screen (false on iPhone). */
  supported: boolean;
  /** The page is full screen right now. */
  active: boolean;
  enter: () => void;
  exit: () => void;
}

function ignoreError(): void {
  /* The browser can refuse; there is nothing useful to do about it. */
}

function isFullscreenActive(): boolean {
  return document.fullscreenElement !== null;
}

function enterFullscreen(): void {
  void document.documentElement.requestFullscreen().catch(ignoreError);
}

function exitFullscreen(): void {
  if (document.fullscreenElement === null) return;
  void document.exitFullscreen().catch(ignoreError);
}

/** Tracks browser full-screen state and offers entry/exit controls. */
export function useFullscreen(): FullscreenControl {
  const [active, setActive] = useState(isFullscreenActive);
  useEffect(() => {
    const onChange = () => setActive(isFullscreenActive());
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  return {
    supported: document.fullscreenEnabled,
    active,
    enter: enterFullscreen,
    exit: exitFullscreen,
  };
}

function releaseSentinel(sentinel: WakeLockSentinel | null): void {
  if (sentinel !== null) void sentinel.release().catch(ignoreError);
}

function shouldRequestWakeLock(sentinel: WakeLockSentinel | null): boolean {
  return (
    document.visibilityState === "visible" &&
    (sentinel === null || sentinel.released)
  );
}

/**
 * Requests a screen wake lock and returns a cleanup that releases it.
 * Browsers drop the lock while hidden, so it is re-requested on visibility.
 */
function keepScreenAwake(): () => void {
  let sentinel: WakeLockSentinel | null = null;
  let disposed = false;

  const storeSentinel = (next: WakeLockSentinel): void => {
    if (disposed) {
      void next.release().catch(ignoreError);
      return;
    }
    sentinel = next;
  };

  const request = (): void => {
    void navigator.wakeLock.request("screen").then(storeSentinel, ignoreError);
  };

  const onVisibilityChange = (): void => {
    if (shouldRequestWakeLock(sentinel)) request();
  };

  request();
  document.addEventListener("visibilitychange", onVisibilityChange);
  return () => {
    disposed = true;
    document.removeEventListener("visibilitychange", onVisibilityChange);
    releaseSentinel(sentinel);
  };
}

/** Keeps the display awake while `active` is true. No-op when unsupported. */
export function useScreenWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return undefined;
    return keepScreenAwake();
  }, [active]);
}
