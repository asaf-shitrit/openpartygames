// Score count-up rendered with no per-frame React re-render: a rAF loop writes
// straight to the span's textContent through a ref.
import type { CSSProperties } from "react";
import { useEffect, useRef } from "react";
import { useReducedMotion } from "../reduced-motion";
import { countAt, formatPoints } from "./count-up";

const DEFAULT_DURATION_MS = 1200;

export interface CountUpProps {
  from: number;
  to: number;
  durationMs?: number;
  /** Start counting on mount. False renders `to` immediately (settled / reconnect). */
  live: boolean;
  /** Delay before counting starts. */
  delayMs?: number;
  prefix?: string;
  style?: CSSProperties;
  className?: string;
}

function textFor(value: number, prefix: string | undefined): string {
  return `${prefix ?? ""}${formatPoints(value)}`;
}

interface CountUpRun {
  el: HTMLSpanElement;
  from: number;
  to: number;
  durationMs: number;
  delayMs: number;
  prefix: string | undefined;
}

function runCountUp(run: CountUpRun): () => void {
  const { el, from, to, durationMs, delayMs, prefix } = run;
  let frameId: number | null = null;
  let timerId: number | null = null;
  let startTime: number | null = null;

  const tick = (now: number) => {
    if (startTime === null) startTime = now;
    const elapsed = now - startTime;
    const t = durationMs <= 0 ? 1 : elapsed / durationMs;
    const value = countAt(from, to, t);
    el.textContent = textFor(value, prefix);
    if (t < 1) {
      frameId = window.requestAnimationFrame(tick);
    }
  };

  const start = () => {
    frameId = window.requestAnimationFrame(tick);
  };
  if (delayMs > 0) {
    timerId = window.setTimeout(start, delayMs);
  } else {
    start();
  }

  return () => {
    if (timerId !== null) window.clearTimeout(timerId);
    if (frameId !== null) window.cancelAnimationFrame(frameId);
  };
}

export function CountUp({
  from,
  to,
  durationMs = DEFAULT_DURATION_MS,
  live,
  delayMs = 0,
  prefix,
  style,
  className,
}: CountUpProps) {
  const spanRef = useRef<HTMLSpanElement>(null);
  const reduced = useReducedMotion();
  // Read the props through a ref so a later change never restarts the count.
  const stateRef = useRef({ from, to, durationMs, delayMs, prefix, live, reduced });
  useEffect(() => {
    stateRef.current = { from, to, durationMs, delayMs, prefix, live, reduced };
  });

  useEffect(() => {
    const el = spanRef.current;
    if (el === null) return undefined;
    const state = stateRef.current;
    if (!state.live || state.reduced) {
      el.textContent = textFor(state.to, state.prefix);
      return undefined;
    }
    el.textContent = textFor(state.from, state.prefix);
    return runCountUp({
      el,
      from: state.from,
      to: state.to,
      durationMs: state.durationMs,
      delayMs: state.delayMs,
      prefix: state.prefix,
    });
  }, []);

  return (
    <span
      ref={spanRef}
      className={className}
      style={style}
      aria-label={textFor(to, prefix)}
    >
      {textFor(live && !reduced ? from : to, prefix)}
    </span>
  );
}
