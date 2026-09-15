// Overlay shown on the TV stage while the host socket reconnects mid-game.
import { Marker, StickyNote } from "@opg/ui";

export function TvReconnecting() {
  return (
    <output
      aria-live="polite"
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(43,43,43,0.35)",
        pointerEvents: "none",
        zIndex: 5,
      }}
    >
      <StickyNote
        tilt={-2}
        className="opg-phase-enter"
        style={{
          padding: "36px 48px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <Marker size={64}>Reconnecting…</Marker>
        <div style={{ fontSize: 34 }}>
          Hang tight. The game and scores are safe.
        </div>
      </StickyNote>
    </output>
  );
}
