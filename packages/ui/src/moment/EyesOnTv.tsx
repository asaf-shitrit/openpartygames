// Phone teaser while the TV builds up to a reveal. Buzzes a slow heartbeat plus a visual pulse.
import { useRef } from "react";
import { useHeartbeat, type HeartbeatTempo } from "../haptics";
import { Card } from "../primitives";

/** Where the beat is landing: on a shared screen, or across the room's own phones. */
export type EyesOnTvVariant = "screen" | "room";

export interface EyesOnTvProps {
  title?: string;
  detail?: string;
  tempo?: HeartbeatTempo;
  /** Default "screen". "room" swaps the doodle and default copy for a no-shared-screen game. */
  variant?: EyesOnTvVariant;
}

const EYES_PATHS = [
  "M18 64c0-14 13-25 30-25s30 11 30 25-13 26-30 26-30-12-30-26z",
  "M82 64c0-14 13-25 30-25s30 11 30 25-13 26-30 26-30-12-30-26z",
] as const;

/** The two doodle eyes shared by both variants, in the avatar stroke style. */
function Eyes() {
  return (
    <>
      {EYES_PATHS.map((d) => (
        <path
          key={d}
          d={d}
          fill="#FFFFFF"
          stroke="#2B2B2B"
          strokeWidth={4}
          strokeLinecap="round"
        />
      ))}
      <circle cx="56" cy="57" r="9" fill="#2B2B2B" />
      <circle cx="120" cy="57" r="9" fill="#2B2B2B" />
    </>
  );
}

/** Eyes looking up at a tiny screen in the corner. */
function ScreenDoodle() {
  return (
    <svg width={176} height={106} viewBox="0 0 200 120" aria-hidden="true" focusable="false">
      <Eyes />
      <path
        d="M150 10h42v26h-42z"
        fill="#FFFFFF"
        stroke="#2B2B2B"
        strokeWidth={4}
        strokeLinejoin="round"
      />
      <path
        d="M158 10l-6-8M184 10l6-8"
        fill="none"
        stroke="#2B2B2B"
        strokeWidth={4}
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Eyes looking out at a small huddle of faces, standing in for the room instead of a screen. */
function RoomDoodle() {
  return (
    <svg width={176} height={106} viewBox="0 0 200 120" aria-hidden="true" focusable="false">
      <Eyes />
      <circle cx="160" cy="26" r="15" fill="#FFFFFF" stroke="#2B2B2B" strokeWidth={4} />
      <circle cx="180" cy="12" r="11" fill="#FFFFFF" stroke="#2B2B2B" strokeWidth={4} />
      <circle cx="184" cy="36" r="11" fill="#FFFFFF" stroke="#2B2B2B" strokeWidth={4} />
    </svg>
  );
}

const DEFAULT_TITLE = {
  screen: "Eyes on the TV",
  room: "Eyes on the room",
} satisfies Record<EyesOnTvVariant, string>;

export function EyesOnTv({
  title,
  detail,
  tempo = "slow",
  variant = "screen",
}: EyesOnTvProps) {
  const ref = useRef<HTMLOutputElement | null>(null);
  useHeartbeat(tempo, ref);
  const resolvedTitle = title ?? DEFAULT_TITLE[variant];
  return (
    <Card variant="L" tilt={-1} style={{ padding: "26px 22px" }}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 14,
          textAlign: "center",
        }}
      >
        {variant === "room" ? <RoomDoodle /> : <ScreenDoodle />}
        {/* Only the title is announced. Re-rendering `detail` on its own (e.g. "The votes are
            in…" → "Here it comes…") must not re-trigger the screen reader. */}
        <output ref={ref} aria-live="polite">
          <span
            className="opg-marker"
            style={{ fontSize: 34, color: "var(--opg-ink)" }}
          >
            {resolvedTitle}
          </span>
        </output>
        {detail === undefined ? null : (
          <span
            aria-hidden="false"
            style={{ fontSize: 18, color: "var(--opg-ink-secondary)" }}
          >
            {detail}
          </span>
        )}
      </div>
    </Card>
  );
}
