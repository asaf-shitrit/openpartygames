// Shared "animate in on a live beat" wrapper for staged moments. A late mount (a reconnect,
// or scrubbing a moment) renders the settled element without replaying anything.
import type { CSSProperties, ReactNode } from "react";
import { useEffect, useRef } from "react";
import { useReducedMotion } from "../reduced-motion";
import { playFx, type FxPreset } from "./animate";

export interface FxInProps {
  /** Play the preset on mount. False renders the settled element. */
  live: boolean;
  preset: FxPreset;
  /** Start after this many ms; the element holds its first frame meanwhile. */
  delayMs?: number;
  style?: CSSProperties;
  className?: string;
  children: ReactNode;
}

interface FxInSnapshot {
  live: boolean;
  preset: FxPreset;
  delayMs: number;
  reduced: boolean;
}

/** Plays `preset` once, on mount, when `live`. Later prop changes never replay it. */
export function FxIn({
  live,
  preset,
  delayMs = 0,
  style,
  className,
  children,
}: FxInProps) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const mountRef = useRef<FxInSnapshot>({ live, preset, delayMs, reduced });
  // No cleanup: an unmounted element's animation goes with it, and cancel() would reject
  // the animation's `finished` promise for nobody to catch.
  useEffect(() => {
    const mount = mountRef.current;
    if (mount.live) {
      playFx(ref.current, mount.preset, mount.reduced, mount.delayMs);
    }
  }, []);
  return (
    <div ref={ref} className={className} style={style}>
      {children}
    </div>
  );
}
