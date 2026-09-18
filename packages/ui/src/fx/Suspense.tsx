// A silent-phone stand-in for the TV's drumroll: a tightening ring plus three heartbeat dots.
// Geometry and timing are pure functions in ./suspense-geometry; this is the thin shell that
// wires them to the shared beat-timeline hooks (useMoment/useBeatEntries) every other timed
// moment in the kit already uses, so a late mount lands on the finished frame and fires no cues.
import { useMemo, useRef } from "react";
import type { ServerClock } from "../game-ui";
import { buzz } from "../haptics";
import type { Beat } from "../moment/timeline";
import { useMoment } from "../moment/useMoment";
import { useBeatEntries } from "../moment/useBeatEntries";
import { useReducedMotion } from "../reduced-motion";
import {
  SUSPENSE_DOT_TEMPO,
  filledDotCount,
  ringClosureFraction,
  suspenseDotBeats,
  type SuspenseVariant,
} from "./suspense-geometry";

export type { SuspenseVariant } from "./suspense-geometry";

const CLOSED_BEAT_ID = "closed";
const REDUCED_RING_FRACTION = 0.5;
const REDUCED_DOT_COUNT = 2;
const DOT_COUNT = 3;
const INK = "#2B2B2B";
const BASE_RING = "#8A8A8A";
const MARKER = "var(--opg-marker)";
const FLASH_MS = 160;
const FADE_MS = 200;

export interface SuspenseProps {
  /** Server-clock ms the beat started, or null before it has started. */
  startedAt: number | null;
  /** Length of the beat: 2500 for the reveal/caught-result drumroll, 15000 for last chance. */
  durationMs: number;
  clock: ServerClock;
  /** Ring diameter in px. ~98 around a player row, ~168 concentric with the last-chance timer. */
  size?: number;
  /** "reveal": short beat that flashes and fades on landing. "drain": long beat, ramped dots. */
  variant?: SuspenseVariant;
  /** Text equivalent for a player with sound off; always present, never color alone. */
  label: string;
}

function suspenseBeats(durationMs: number, variant: SuspenseVariant): Beat[] {
  const dots = suspenseDotBeats(durationMs, SUSPENSE_DOT_TEMPO[variant]);
  return [...dots, { id: CLOSED_BEAT_ID, atMs: durationMs }];
}

/** Flash the ring red, then fade the whole element out, on the "closed" beat of a reveal. */
function playLanding(el: HTMLElement | null): void {
  if (el === null || !("animate" in el)) return;
  el.animate(
    [{ opacity: 1 }, { opacity: 0.35 }, { opacity: 1 }],
    { duration: FLASH_MS },
  );
  el.animate([{ opacity: 1 }, { opacity: 0 }], {
    duration: FADE_MS,
    delay: FLASH_MS,
    fill: "forwards",
  });
}

interface RingArcProps {
  size: number;
  closure: number;
  solid: boolean;
}

/** The dashed base ring plus the solid closing arc, drawn from 12 o'clock. */
function RingArc({ size, closure, solid }: RingArcProps) {
  const strokeWidth = solid ? 4 : 3.5;
  const radius = size / 2 - strokeWidth - 1;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden="true"
      style={{ position: "absolute", left: 0, top: 0 }}
    >
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke={BASE_RING}
        strokeWidth={2.5}
        strokeDasharray="4 6"
        opacity={0.48}
      />
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke={MARKER}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={`${closure * circumference} ${circumference}`}
        transform={`rotate(-90 ${center} ${center})`}
      />
    </svg>
  );
}

function DotRow({ size, filled }: { size: number; filled: number }) {
  const dotSize = size >= 140 ? 11 : 10;
  return (
    <div
      aria-hidden="true"
      style={{ display: "flex", alignItems: "center", gap: 8 }}
    >
      {Array.from({ length: DOT_COUNT }, (_, index) => (
        <div
          key={index}
          data-filled={index < filled}
          style={{
            width: dotSize,
            height: dotSize,
            borderRadius: "50%",
            background: index < filled ? INK : "transparent",
            border: index < filled ? undefined : `2px solid ${INK}`,
            boxSizing: "border-box",
          }}
        />
      ))}
    </div>
  );
}

export function Suspense({
  startedAt,
  durationMs,
  clock,
  size = 98,
  variant = "reveal",
  label,
}: SuspenseProps) {
  const reduced = useReducedMotion();
  const wrapperRef = useRef<HTMLOutputElement | null>(null);
  const beats = useMemo(
    () => suspenseBeats(durationMs, variant),
    [durationMs, variant],
  );
  const dotBeatCount = beats.length - 1;
  const moment = useMoment(beats, startedAt, clock);

  useBeatEntries(beats, moment, (beat) => {
    if (beat.haptic !== undefined) buzz(beat.haptic);
    if (beat.id === CLOSED_BEAT_ID && variant === "reveal" && !reduced) {
      playLanding(wrapperRef.current);
    }
  });

  const closure = reduced
    ? REDUCED_RING_FRACTION
    : ringClosureFraction(moment.elapsedMs, durationMs);
  const filled = reduced
    ? REDUCED_DOT_COUNT
    : filledDotCount(Math.min(moment.index + 1, dotBeatCount));
  const solid = closure >= 1;

  return (
    <output
      ref={wrapperRef}
      data-closure={closure.toFixed(3)}
      style={{
        position: "relative",
        width: size,
        height: size,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-end",
        gap: 8,
        paddingBottom: 6,
      }}
    >
      <RingArc size={size} closure={closure} solid={solid} />
      <DotRow size={size} filled={filled} />
      <span
        style={{
          position: "absolute",
          bottom: -22,
          fontSize: 13,
          fontWeight: 700,
          color: "var(--opg-ink-secondary)",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </span>
    </output>
  );
}
