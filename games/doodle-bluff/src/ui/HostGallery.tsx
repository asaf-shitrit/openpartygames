// The end-of-game gallery: every drawing that was made, artist and winning title beside it,
// inking in as a staggered cascade (plan/0003-doodle-bluff.md, "The gallery").
import type { CSSProperties } from "react";
import type { PlayerSummary } from "@opg/protocol";
import type { ServerClock } from "@opg/ui";
import { Avatar, Card, DoodleView, FxIn, Icon, Marker } from "@opg/ui";
import type { DoodleGalleryEntry } from "../state";
import { avatarOf, drawingLabel, nameOf } from "./common";

const CASCADE_STEP_MS = 70;
const CASCADE_MAX_MS = 900;

/** Deterministic entry delay for the ink-in cascade, capped so a big gallery doesn't crawl. */
export function cascadeDelayMs(index: number): number {
  return Math.min(index * CASCADE_STEP_MS, CASCADE_MAX_MS);
}

const GRID: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
  gap: 24,
  overflowY: "auto",
};

function GalleryTile({
  entry,
  index,
  players,
  clock,
}: {
  entry: DoodleGalleryEntry;
  index: number;
  players: PlayerSummary[];
  clock: ServerClock;
}) {
  return (
    <FxIn live preset="tapeOn" delayMs={cascadeDelayMs(index)}>
      <Card
        variant={index % 2 === 0 ? "M" : "Malt"}
        style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}
      >
        <DoodleView doodle={entry.doodle} label={drawingLabel(nameOf(players, entry.artistId))} clock={clock} size={220} style={{ alignSelf: "center" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Avatar id={avatarOf(players, entry.artistId)} size={36} alt={`${nameOf(players, entry.artistId)}'s avatar`} />
          <div style={{ fontWeight: 700, fontSize: 16 }}>{nameOf(players, entry.artistId)}</div>
        </div>
        <div style={{ fontWeight: 700, fontSize: 17, lineHeight: 1.25 }}>{entry.title}</div>
        <ShownTag entry={entry} />
      </Card>
    </FxIn>
  );
}

function ShownTag({ entry }: { entry: DoodleGalleryEntry }) {
  if (!entry.shown) {
    return <div style={{ fontSize: 14, fontWeight: 700, color: "var(--opg-ink-secondary)" }}>never shown</div>;
  }
  const count = entry.foundByCount ?? 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 700, color: "var(--opg-ink-secondary)" }}>
      <Icon name="check" size={16} color="var(--opg-marker)" />
      {count === 1 ? "Found by 1 player" : `Found by ${count} players`}
    </div>
  );
}

export interface HostGalleryProps {
  entries: readonly DoodleGalleryEntry[];
  players: PlayerSummary[];
  clock: ServerClock;
}

export function HostGallery({ entries, players, clock }: HostGalleryProps) {
  return (
    <div style={{ flexGrow: 1, display: "flex", flexDirection: "column", gap: 20, overflow: "hidden" }}>
      <Marker size={40}>The gallery — gone after tonight</Marker>
      <div style={GRID}>
        {entries.map((entry, index) => (
          <GalleryTile key={entry.drawingId} entry={entry} index={index} players={players} clock={clock} />
        ))}
      </div>
    </div>
  );
}
