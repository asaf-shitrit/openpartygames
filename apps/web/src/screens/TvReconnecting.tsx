// Overlay shown on the TV stage while the host socket reconnects mid-game.
import { useLocale } from "@opg/i18n";
import { Marker, StickyNote } from "@opg/ui";

export function TvReconnecting() {
  const { t } = useLocale();
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
        <Marker size={64}>{t.status.tvReconnectingHeading}</Marker>
        <div style={{ fontSize: 34 }}>{t.status.tvReconnectingBody}</div>
      </StickyNote>
    </output>
  );
}
