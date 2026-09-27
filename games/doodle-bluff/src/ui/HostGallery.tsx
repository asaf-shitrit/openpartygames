// The end-of-game gallery: every drawing that was made, artist and winning title beside it,
// inking in as a staggered cascade (plan/0003-doodle-bluff.md, "The gallery").
//
// Sizing is the whole job here. The TV stage is a fixed 1080 box that does not scroll, so a
// tile that looks right for a three-player room's six drawings pushes a full room's sixteen
// clean off the bottom — whole rows of drawings the room never gets to see. The tile therefore
// shrinks to the number of drawings, in the six-column grid of design/TVDoodleBluffGallery.dc.html.
import type { CSSProperties } from "react";
import type { PlayerSummary } from "@opg/protocol";
import type { ServerClock } from "@opg/ui";
import { Avatar, Card, DoodleView, FxIn, Icon, Marker } from "@opg/ui";
import { format, pickPluralByCount, useLocale } from "@opg/i18n";
import type { Dictionary } from "@opg/i18n";
import type { DoodleGalleryEntry } from "../state";
import { avatarOf, drawingLabel, nameOf } from "./common";

const CASCADE_STEP_MS = 70;
const CASCADE_MAX_MS = 900;

/** Deterministic entry delay for the ink-in cascade, capped so a big gallery doesn't crawl. */
export function cascadeDelayMs(index: number): number {
  return Math.min(index * CASCADE_STEP_MS, CASCADE_MAX_MS);
}

const COLUMN_WIDTH = 279;
const GRID_GAP = 20;
/** Columns the grid settles on at 1920 — six 279px tracks across the stage's 1776px body. */
const TV_COLUMNS = 6;
/** Stage height left for the grid under the TV header and the gallery's own heading, measured
 * on the 1080 stage. Everything below is sized to stay inside it. */
const TV_GRID_HEIGHT = 808;
/** A tile minus its drawing: card padding and border, two row gaps, the artist row and two
 * lines of title, as design/TVDoodleBluffGallery.dc.html draws it, plus a few px of slack. */
const TILE_CHROME = 177;
/** The one extra line that says how a drawing did: found by N, or never shown. */
const STATUS_HEIGHT = 40;
const TITLE_LINES = 3;
const TITLE_LINE_HEIGHT = 1.18;
const MAX_DOODLE = 220;
/** Under this a drawing stops being a drawing, so the status line goes rather than the picture. */
const MIN_USEFUL_DOODLE = 110;

export interface GalleryFit {
  doodleSize: number;
  /** False in a full room: sixteen drawings only fit once the found-by line gives up its row. */
  withStatus: boolean;
}

/** How big each drawing may be for the whole gallery to land inside the stage, and whether
 * there is still a row to spare for the found-by line. A small room gets big drawings and the
 * full card; eight players' sixteen drawings get three rows of small ones. */
export function galleryFit(count: number): GalleryFit {
  const rows = Math.max(1, Math.ceil(count / TV_COLUMNS));
  const perRow = (TV_GRID_HEIGHT - (rows - 1) * GRID_GAP) / rows;
  const withStatus = perRow - TILE_CHROME - STATUS_HEIGHT >= MIN_USEFUL_DOODLE;
  const room = Math.floor(perRow - TILE_CHROME - (withStatus ? STATUS_HEIGHT : 0));
  return { doodleSize: Math.max(1, Math.min(MAX_DOODLE, room)), withStatus };
}

const GRID: CSSProperties = {
  display: "grid",
  // min(279px, 100%) instead of a bare 279px: the column is still 279px whenever the grid has
  // room for it (unchanged at 100%), but can shrink to the grid's own width instead of forcing
  // a horizontal scroll once the viewport itself is narrower than that, which is what a phone
  // at 200% zoom becomes -- the grid wraps into more, narrower rows rather than overflowing.
  gridTemplateColumns: `repeat(auto-fill, minmax(min(${COLUMN_WIDTH}px, 100%), 1fr))`,
  gap: GRID_GAP,
  alignContent: "start",
  overflowY: "auto",
};

/** Clamped, not free-flowing: one long title must not grow its whole row and take the row below
 * it off the bottom of the stage. Three lines hold every title the packs ship today. */
const TITLE: CSSProperties = {
  display: "-webkit-box",
  WebkitBoxOrient: "vertical",
  WebkitLineClamp: TITLE_LINES,
  overflow: "hidden",
  fontWeight: 700,
  fontSize: 28,
  lineHeight: TITLE_LINE_HEIGHT,
};

function GalleryTile({
  entry,
  index,
  players,
  clock,
  fit,
  t,
}: {
  entry: DoodleGalleryEntry;
  index: number;
  players: PlayerSummary[];
  clock: ServerClock;
  fit: GalleryFit;
  t: Dictionary;
}) {
  const name = nameOf(players, entry.artistId, t.common.someone);
  return (
    <FxIn live preset="tapeOn" delayMs={cascadeDelayMs(index)}>
      <Card
        variant={index % 2 === 0 ? "M" : "Malt"}
        style={{ boxSizing: "border-box", padding: 10, display: "flex", flexDirection: "column", gap: 6 }}
      >
        <DoodleView
          doodle={entry.doodle}
          label={drawingLabel(t, name)}
          clock={clock}
          size={fit.doodleSize}
          style={{ alignSelf: "center" }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Avatar id={avatarOf(players, entry.artistId)} size={30} alt={format(t.doodleBluff.avatarAlt, { name })} />
          {/* Wraps rather than ellipsising: a name at the protocol's limit still fits one line
              at this column width, and at 200% text on a phone it has to be allowed a second. */}
          <div style={{ flexGrow: 1, minWidth: 0, fontWeight: 700, fontSize: 28, overflowWrap: "anywhere" }}>{name}</div>
        </div>
        <div style={TITLE}>{entry.title}</div>
        {fit.withStatus ? <ShownTag entry={entry} t={t} /> : null}
      </Card>
    </FxIn>
  );
}

function ShownTag({ entry, t }: { entry: DoodleGalleryEntry; t: Dictionary }) {
  if (!entry.shown) {
    return <div style={{ fontSize: 28, fontWeight: 700, color: "var(--opg-ink-secondary)" }}>{t.doodleBluff.neverShown}</div>;
  }
  const count = entry.foundByCount ?? 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 28, fontWeight: 700, color: "var(--opg-ink-secondary)" }}>
      <Icon name="check" size={28} color="var(--opg-marker)" />
      {format(pickPluralByCount(count, t.doodleBluff.foundByPlayers), { count })}
    </div>
  );
}

export interface HostGalleryProps {
  entries: readonly DoodleGalleryEntry[];
  players: PlayerSummary[];
  clock: ServerClock;
}

export function HostGallery({ entries, players, clock }: HostGalleryProps) {
  const { t } = useLocale();
  const fit = galleryFit(entries.length);
  return (
    <div style={{ flexGrow: 1, display: "flex", flexDirection: "column", gap: 20, minHeight: 0, overflow: "hidden" }}>
      <Marker size={40}>{t.doodleBluff.galleryHeading}</Marker>
      <div style={GRID}>
        {entries.map((entry, index) => (
          <GalleryTile key={entry.drawingId} entry={entry} index={index} players={players} clock={clock} fit={fit} t={t} />
        ))}
      </div>
    </div>
  );
}
