// Hand-drawn countdown circle from design/AVATARS.md. Renders on whole seconds.
import { useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import { useCue } from "./audio/SoundProvider";
import type { CueId } from "./audio/types";
import type { ServerClock } from "./game-ui";
import { buzz, pulse } from "./haptics";
import { playFx } from "./fx/animate";
import { useReducedMotion } from "./reduced-motion";
import {
  msUntilNextSecond,
  ringFraction,
  secondsLeft,
  timerStage,
  type TimerStage,
} from "./timer-stage";

export interface TimerProps {
  deadline: number | null;
  clock: ServerClock;
  /** Circle size in px: 78 on phones, 150-180 on the TV. */
  size?: number;
  style?: React.CSSProperties;
  /** When set together with `deadline`, the ring drains from full to empty. */
  startedAt?: number | null;
  /** TV only: plays tick / tick-final cues in the hurry, urgent and final stages. */
  ticks?: boolean;
  /** Phone only, for the player whose own action is timed: buzzes in the final stage. */
  haptics?: boolean;
}

/** Remaining time at or below this is "almost out": dashed red ring plus a pulse. */
export const TIMER_URGENT_MS = 5000;

const RING_PATH =
  "M40 5c19 1 33 15 33 34 0 19-15 34-35 33C19 71 5 57 6 38 7 20 22 5 42 6";

function format(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** Remaining time as text, or dashes when there is no deadline. */
function formatLeft(seconds: number | null): string {
  return seconds === null ? "--:--" : format(seconds);
}

function isUrgentVisual(stage: TimerStage): boolean {
  return stage === "urgent" || stage === "final";
}

/** Spoken timer text; urgency is stated so it is never only a color or shape. */
function timerAriaLabel(seconds: number | null, stage: TimerStage): string {
  if (seconds === null) return "No timer";
  return `Time left ${formatLeft(seconds)}${isUrgentVisual(stage) ? ", almost out" : ""}`;
}

interface RingLook {
  stroke: string;
  strokeWidth: number;
  strokeDasharray: string | undefined;
}

/** Ring look: thicker while hurrying, red/dashed/thicker while urgent or final. */
function ringLook(big: boolean, stage: TimerStage): RingLook {
  const urgent = isUrgentVisual(stage);
  const hurry = stage === "hurry";
  return {
    stroke: urgent ? "var(--opg-marker)" : "#2B2B2B",
    strokeWidth: (big ? 3 : 4) + (urgent ? 2 : 0) + (hurry ? 1 : 0),
    strokeDasharray: urgent ? "7 5" : undefined,
  };
}

/** In range [1, max] inclusive; used to gate ticks/haptics/pop to a stage window. */
function inWindow(seconds: number | null, max: number): boolean {
  return seconds !== null && seconds >= 1 && seconds <= max;
}

/**
 * Schedules one setTimeout aligned to the next whole-second boundary, chaining itself by
 * re-rendering (`now` is recomputed by the caller from `clock` on every render).
 */
function useSecondTicker(deadline: number | null, now: number): void {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (deadline === null || now >= deadline) return undefined;
    const delay = msUntilNextSecond(deadline, now);
    const id = window.setTimeout(() => setTick((value) => value + 1), delay);
    return () => window.clearTimeout(id);
  }, [deadline, now]);
}

/**
 * Calls onChange when `seconds` changes live while mounted and `active` at the new value.
 * The mounted value itself never fires, so a reconnect never replays a cue; a live change
 * into the active window (e.g. hurry starting at 10s) fires immediately.
 */
function useOnSecondChange(
  active: boolean,
  seconds: number | null,
  onChange: () => void,
): void {
  const mountedRef = useRef(false);
  const prevRef = useRef<number | null>(null);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });
  useEffect(() => {
    if (seconds === null) {
      mountedRef.current = false;
      prevRef.current = null;
      return undefined;
    }
    if (!mountedRef.current) {
      mountedRef.current = true;
      prevRef.current = seconds;
      return undefined;
    }
    const changed = prevRef.current !== seconds;
    prevRef.current = seconds;
    if (changed && active) onChangeRef.current();
    return undefined;
  }, [active, seconds]);
}

interface TimerCueOptions {
  seconds: number | null;
  ticks: boolean;
  haptics: boolean;
  reduced: boolean;
  cue: (id: CueId) => void;
  rootRef: RefObject<HTMLDivElement | null>;
  digitsRef: RefObject<HTMLDivElement | null>;
}

/** Wires the tick cue, the countdown buzz and the final-stage digit pop to live second changes. */
function useTimerCues(options: TimerCueOptions): void {
  const { seconds, ticks, haptics, reduced, cue, rootRef, digitsRef } = options;

  useOnSecondChange(ticks && inWindow(seconds, 10), seconds, () => {
    cue(inWindow(seconds, 3) ? "tick-final" : "tick");
  });

  useOnSecondChange(haptics && inWindow(seconds, 3), seconds, () => {
    buzz("countdown");
    pulse(rootRef.current, reduced);
  });

  useOnSecondChange(inWindow(seconds, 3), seconds, () => {
    playFx(digitsRef.current, "pop", reduced);
  });
}

interface RingDrainStyle {
  animationDuration: string;
  animationDelay: string;
}

/** CSS-drained ring style, recomputed only when startedAt/deadline (or reduced) change. */
function useRingDrainStyle(
  startedAt: number | null,
  deadline: number | null,
  reduced: boolean,
  clock: ServerClock,
): RingDrainStyle | null {
  return useMemo(() => {
    if (startedAt === null || deadline === null || reduced) return null;
    const duration = deadline - startedAt;
    if (duration <= 0) return null;
    const now = clock.now();
    return {
      animationDuration: `${duration}ms`,
      animationDelay: `${-(now - startedAt)}ms`,
    };
    // Deliberately recomputed only when these identities change, not every second.
  }, [startedAt, deadline, reduced, clock]);
}

function msLeftFor(deadline: number | null, now: number): number | null {
  return deadline === null ? null : deadline - now;
}

function hasProgress(startedAt: number | null, deadline: number | null): boolean {
  return startedAt !== null && deadline !== null;
}

/** The ring fraction, computed per render only under reduced motion (else CSS drains it). */
function computeStaticFraction(
  startedAt: number | null,
  deadline: number | null,
  reduced: boolean,
  now: number,
): number | null {
  if (!reduced) return null;
  return ringFraction(startedAt, deadline, now);
}

interface RootAttrs {
  className: string | undefined;
  dataUrgent: string | undefined;
}

function rootAttrs(stage: TimerStage): RootAttrs {
  const urgent = isUrgentVisual(stage);
  return {
    className: urgent ? "opg-timer-urgent" : undefined,
    dataUrgent: urgent ? "true" : undefined,
  };
}

function digitStyle(big: boolean, stage: TimerStage): React.CSSProperties {
  return {
    position: "relative",
    fontFamily: "var(--opg-font-body)",
    fontSize: big ? 48 : 22,
    fontWeight: 700,
    color: isUrgentVisual(stage) ? "var(--opg-marker)" : undefined,
    scale: stage === "final" ? "1.25" : undefined,
  };
}

interface TimerRingProps {
  size: number;
  ring: RingLook;
  showProgress: boolean;
  drainStyle: RingDrainStyle | null;
  staticFraction: number | null;
}

/** The track circle, plus an optional draining progress circle on top of it. */
function TimerRing({
  size,
  ring,
  showProgress,
  drainStyle,
  staticFraction,
}: TimerRingProps) {
  const progressStyle =
    drainStyle ??
    (staticFraction === null
      ? undefined
      : { strokeDashoffset: (1 - staticFraction) * 100 });
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 78 78"
      style={{ position: "absolute", left: 0, top: 0 }}
      aria-hidden="true"
    >
      <path d={RING_PATH} fill="#FFFFFF" strokeLinecap="round" {...ring} />
      {showProgress && (
        <path
          d={RING_PATH}
          fill="none"
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray="100"
          stroke={ring.stroke}
          strokeWidth={ring.strokeWidth}
          className={drainStyle ? "opg-ring-drain" : undefined}
          style={progressStyle}
        />
      )}
    </svg>
  );
}

export function Timer({
  deadline,
  clock,
  size = 78,
  style,
  startedAt = null,
  ticks = false,
  haptics = false,
}: TimerProps) {
  const reduced = useReducedMotion();
  const cue = useCue();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const digitsRef = useRef<HTMLDivElement | null>(null);

  const now = clock.now();
  const seconds = secondsLeft(deadline, now);
  const stage = timerStage(msLeftFor(deadline, now));
  const big = size >= 120;

  useSecondTicker(deadline, now);
  useTimerCues({ seconds, ticks, haptics, reduced, cue, rootRef, digitsRef });

  const drainStyle = useRingDrainStyle(startedAt, deadline, reduced, clock);
  const staticFraction = computeStaticFraction(startedAt, deadline, reduced, now);
  const attrs = rootAttrs(stage);

  return (
    <div
      ref={rootRef}
      className={attrs.className}
      data-urgent={attrs.dataUrgent}
      data-stage={stage}
      style={{
        width: size,
        height: size,
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        ...style,
      }}
      role="timer"
      aria-label={timerAriaLabel(seconds, stage)}
    >
      <TimerRing
        size={size}
        ring={ringLook(big, stage)}
        showProgress={hasProgress(startedAt, deadline)}
        drainStyle={drainStyle}
        staticFraction={staticFraction}
      />
      <div ref={digitsRef} style={digitStyle(big, stage)}>
        {formatLeft(seconds)}
      </div>
    </div>
  );
}
