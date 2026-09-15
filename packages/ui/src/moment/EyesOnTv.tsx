// Phone teaser while the TV builds up to a reveal. Buzzes a slow heartbeat plus a visual pulse.
import { useRef } from "react";
import { useHeartbeat, type HeartbeatTempo } from "../haptics";
import { Card } from "../primitives";

export interface EyesOnTvProps {
  title?: string;
  detail?: string;
  tempo?: HeartbeatTempo;
}

/** Two doodle eyes looking up at a tiny TV, in the avatar stroke style. */
function EyesDoodle() {
  return (
    <svg
      width={176}
      height={106}
      viewBox="0 0 200 120"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M18 64c0-14 13-25 30-25s30 11 30 25-13 26-30 26-30-12-30-26z"
        fill="#FFFFFF"
        stroke="#2B2B2B"
        strokeWidth={4}
        strokeLinecap="round"
      />
      <path
        d="M82 64c0-14 13-25 30-25s30 11 30 25-13 26-30 26-30-12-30-26z"
        fill="#FFFFFF"
        stroke="#2B2B2B"
        strokeWidth={4}
        strokeLinecap="round"
      />
      <circle cx="56" cy="57" r="9" fill="#2B2B2B" />
      <circle cx="120" cy="57" r="9" fill="#2B2B2B" />
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

export function EyesOnTv({
  title = "Eyes on the TV",
  detail,
  tempo = "slow",
}: EyesOnTvProps) {
  const ref = useRef<HTMLOutputElement | null>(null);
  useHeartbeat(tempo, ref);
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
        <EyesDoodle />
        {/* Only the title is announced. Re-rendering `detail` on its own (e.g. "The votes are
            in…" → "Here it comes…") must not re-trigger the screen reader. */}
        <output ref={ref} aria-live="polite">
          <span
            className="opg-marker"
            style={{ fontSize: 34, color: "var(--opg-ink)" }}
          >
            {title}
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
