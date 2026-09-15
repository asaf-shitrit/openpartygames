// A Stamp that slams onto the stage at a peak (IMPOSTER!, REAL, NAH, GOT IT).
// Driven by the beat timeline: `live` is true only when the beat was entered
// while mounted, so a reconnect mid-reveal renders the settled stamp.
import type { RefObject } from "react";
import { useEffect, useRef } from "react";
import type { StampProps } from "../primitives";
import { Stamp } from "../primitives";
import { useReducedMotion } from "../reduced-motion";
import type { FxPreset } from "./animate";
import { playFx } from "./animate";

/** Time from the slam landing to the shake of the host root. */
export const SLAM_LAND_MS = 230;

export type ShakeMode = "big" | "small" | "none";

export interface SlamStampProps extends StampProps {
  /** Slam in on mount. False renders the settled stamp (reconnecting mid-reveal). */
  live: boolean;
  /** Element to shake when the stamp lands (the game's host root, never Stage). */
  shakeRef?: RefObject<HTMLElement | null>;
  /** Default "big". */
  shake?: ShakeMode;
}

function shakePreset(shake: ShakeMode): FxPreset | null {
  if (shake === "none") return null;
  return shake === "big" ? "shake" : "shakeSmall";
}

export function SlamStamp({
  live,
  shakeRef,
  shake = "big",
  children,
  ...stampProps
}: SlamStampProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  // Read the props through a ref so a later change never replays the slam.
  const stateRef = useRef({ live, shake, shakeRef, reduced });
  useEffect(() => {
    stateRef.current = { live, shake, shakeRef, reduced };
  });
  useEffect(() => {
    const state = stateRef.current;
    if (!state.live) return undefined;
    playFx(wrapperRef.current, "slam", state.reduced);
    const preset = shakePreset(state.shake);
    if (preset === null) return undefined;
    const timer = window.setTimeout(() => {
      playFx(state.shakeRef?.current ?? null, preset, state.reduced);
    }, SLAM_LAND_MS);
    return () => window.clearTimeout(timer);
  }, []);
  return (
    <div ref={wrapperRef} style={{ display: "inline-flex" }}>
      <Stamp {...stampProps}>{children}</Stamp>
    </div>
  );
}
