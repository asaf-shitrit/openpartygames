// Hand-drawn countdown circle from design/AVATARS.md. Re-renders ~4x/second.
import { useEffect, useState } from "react";
import type { ServerClock } from "./game-ui";

export interface TimerProps {
  deadline: number | null;
  clock: ServerClock;
  /** Circle size in px: 78 on phones, 150-180 on the TV. */
  size?: number;
  style?: React.CSSProperties;
}

/** Remaining time at or below this is "almost out": dashed red ring plus a pulse. */
export const TIMER_URGENT_MS = 5000;

function format(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function isUrgent(deadline: number | null, now: number): boolean {
  if (deadline === null) return false;
  const left = deadline - now;
  return left > 0 && left <= TIMER_URGENT_MS;
}

function leftMs(deadline: number | null, now: number): number | null {
  return deadline === null ? null : deadline - now;
}

/** Remaining time as text, or dashes when there is no deadline. */
function formatLeft(left: number | null): string {
  return left === null ? "--:--" : format(left);
}

/** Spoken timer text; urgency is stated so it is never only a color or shape. */
function timerAriaLabel(left: number | null, urgent: boolean): string {
  if (left === null) return "No timer";
  return `Time left ${formatLeft(left)}${urgent ? ", almost out" : ""}`;
}

/** Ring look: thicker, red and dashed while urgent so shape changes too, not just color. */
function ringProps(big: boolean, urgent: boolean) {
  return {
    stroke: urgent ? "var(--opg-marker)" : "#2B2B2B",
    strokeWidth: (big ? 3 : 4) + (urgent ? 2 : 0),
    strokeDasharray: urgent ? "7 5" : undefined,
  };
}

export function Timer({ deadline, clock, size = 78, style }: TimerProps) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (deadline === null) return undefined;
    const id = window.setInterval(() => setTick((t) => t + 1), 250);
    return () => window.clearInterval(id);
  }, [deadline]);

  const now = clock.now();
  const left = leftMs(deadline, now);
  const urgent = isUrgent(deadline, now);
  const big = size >= 120;
  const label = formatLeft(left);
  return (
    <div
      className={urgent ? "opg-timer-urgent" : undefined}
      data-urgent={urgent ? "true" : undefined}
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
      aria-label={timerAriaLabel(left, urgent)}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 78 78"
        style={{ position: "absolute", left: 0, top: 0 }}
        aria-hidden="true"
      >
        <path
          d="M40 5c19 1 33 15 33 34 0 19-15 34-35 33C19 71 5 57 6 38 7 20 22 5 42 6"
          fill="#FFFFFF"
          strokeLinecap="round"
          {...ringProps(big, urgent)}
        />
      </svg>
      <div
        style={{
          position: "relative",
          fontFamily: "var(--opg-font-body)",
          fontSize: big ? 48 : 22,
          fontWeight: 700,
          color: urgent ? "var(--opg-marker)" : undefined,
        }}
      >
        {label}
      </div>
    </div>
  );
}
