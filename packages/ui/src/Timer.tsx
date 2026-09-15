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

function format(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function Timer({ deadline, clock, size = 78, style }: TimerProps) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (deadline === null) return undefined;
    const id = window.setInterval(() => setTick((t) => t + 1), 250);
    return () => window.clearInterval(id);
  }, [deadline]);

  const big = size >= 120;
  const label = deadline === null ? "--:--" : format(deadline - clock.now());
  return (
    <div
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
      aria-label={deadline === null ? "No timer" : `Time left ${label}`}
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
          stroke="#2B2B2B"
          strokeWidth={big ? 3 : 4}
          strokeLinecap="round"
        />
      </svg>
      <div
        style={{
          position: "relative",
          fontFamily: "var(--opg-font-body)",
          fontSize: big ? 48 : 22,
          fontWeight: 700,
        }}
      >
        {label}
      </div>
    </div>
  );
}
