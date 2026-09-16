// Phone haptics: named vibration patterns, each always paired with a visual pulse.
// Phones are silent, so the buzz and the pulse are the only feedback a phone can give.
import { useCallback, useEffect, useRef } from "react";
import type { RefObject } from "react";
import { useReducedMotion } from "./reduced-motion";

export const HAPTIC_PATTERNS = {
  turn: [90, 60, 90],
  countdown: [35],
  locked: [25, 40, 25],
  flip: [30],
  heartbeat: [45, 110, 45],
  good: [60, 40, 60, 40, 140],
  soft: [120],
  caught: [140, 60, 260],
  award: [80, 50, 80],
  crown: [70, 40, 70, 40, 70, 40, 320],
} as const satisfies Record<string, readonly number[]>;

export type HapticName = keyof typeof HAPTIC_PATTERNS;

/** Slow while the TV builds tension, fast just before the big beat. */
export const HEARTBEAT_MS = { slow: 1100, fast: 650 } as const;
export type HeartbeatTempo = "slow" | "fast" | "off";

const PULSE_MS = 260;

/** True when the browser exposes the Vibration API (iOS Safari does not). */
export function canVibrate(): boolean {
  return "vibrate" in navigator;
}

/** Fires a named pattern. False when unsupported or when the browser throws. */
export function buzz(name: HapticName): boolean {
  if (!canVibrate()) return false;
  try {
    navigator.vibrate([...HAPTIC_PATTERNS[name]]);
    return true;
  } catch {
    return false;
  }
}

/** Scale keyframes: the transform property is taken by card tilts, so animate scale instead. */
function pulseKeyframes(reduced: boolean): Keyframe[] {
  if (reduced) {
    return [
      { outline: "4px solid var(--opg-marker)" },
      { outline: "4px solid rgba(0, 0, 0, 0)" },
    ];
  }
  return [{ scale: "1" }, { scale: "1.04" }, { scale: "1" }];
}

/**
 * Visual pair for every buzz (iOS ignores vibrate). WAAPI on the `scale` property, 1 -> 1.04 -> 1
 * over 260ms. NEVER animates `transform`: cards use inline transform: rotate().
 * Reduced motion -> a brief outline flash instead. No-op for null or elements without animate.
 */
export function pulse(el: HTMLElement | null, reduced: boolean): void {
  if (el === null || !("animate" in el)) return;
  el.animate(pulseKeyframes(reduced), { duration: PULSE_MS });
}

/** buzz + pulse(el) using useReducedMotion(). */
export function useBuzz(): (name: HapticName, el?: HTMLElement | null) => void {
  const reduced = useReducedMotion();
  return useCallback(
    (name: HapticName, el?: HTMLElement | null) => {
      buzz(name);
      pulse(el ?? null, reduced);
    },
    [reduced],
  );
}

/** While tempo is not "off": every HEARTBEAT_MS[tempo], buzz("heartbeat") and pulse(ref.current). */
export function useHeartbeat(
  tempo: HeartbeatTempo,
  ref: RefObject<HTMLElement | null>,
): void {
  const reduced = useReducedMotion();
  const reducedRef = useRef(reduced);
  useEffect(() => {
    reducedRef.current = reduced;
  }, [reduced]);
  useEffect(() => {
    if (tempo === "off") return undefined;
    const id = window.setInterval(() => {
      buzz("heartbeat");
      pulse(ref.current, reducedRef.current);
    }, HEARTBEAT_MS[tempo]);
    return () => window.clearInterval(id);
  }, [tempo, ref]);
}
