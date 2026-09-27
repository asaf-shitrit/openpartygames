// The drawing reveal, TV or no-TV stage: the drawing replays, then each fake title with who it
// fooled, then the truth, then points. Beat-driven off reveal-timeline.ts, so a reconnect mid-
// reveal lands on the settled state with no replayed cues (plan/0002-game-feel.md).
//
// Two columns, as design/TVDoodleBluffReveal.dc.html draws it: the drawing and the truth on one
// side, the lies listed down the other. Stacking all of it instead — which is what this did —
// cannot hold a full room: eight players make seven lies, and seven cards under a 300px drawing
// and above the truth card ran a whole wrapped row off the bottom of the 1080 stage, where the
// room simply never saw it. The stage rule could not catch that because every reveal preview
// was frozen on its opening beat and rendered no lies at all (see src/ui/preview.ts).
import { useMemo, useRef } from "react";
import type { CSSProperties } from "react";
import type { PlayerId, PlayerSummary } from "@opg/protocol";
import type { ServerClock } from "@opg/ui";
import {
  anchorAt,
  Avatar,
  Card,
  DoodleView,
  Highlight,
  Icon,
  Marker,
  useBeatEntries,
  useCue,
  useMoment,
} from "@opg/ui";
import { format, useLocale } from "@opg/i18n";
import type { Dictionary } from "@opg/i18n";
import { REVEAL_MS, type DoodleFooledTitle, type DoodleHostView } from "../state";
import { avatarOf, drawingLabel, nameOf } from "./common";
import { hostRevealBeats, titlesShown } from "./reveal-timeline";

export interface RevealLook {
  /** Body size for every line in the reveal. */
  text: number;
  /** The real title, the one line that gets to be big. */
  truth: number;
  doodle: number;
  avatar: number;
  /** True where a lie has to stay on one line. */
  oneLine: boolean;
}

/**
 * The TV floor is 28px and the phone floor is 16px, and the difference matters for more than
 * size: at the TV's column width the longest title any pack ships still fits on one line, so a
 * lie can be held to one line and seven of them are guaranteed to fit inside the 1080 stage.
 * A phone column is a quarter of that width, where the same rule would cut every lie short —
 * and a phone scrolls, so it doesn't need the guarantee. It wraps instead.
 */
export function revealLook(compact: boolean): RevealLook {
  if (compact) return { text: 18, truth: 26, doodle: 220, avatar: 30, oneLine: false };
  return { text: 28, truth: 40, doodle: 260, avatar: 36, oneLine: true };
}

const STAGE: CSSProperties = {
  // See BODY in Host.tsx: an `auto` basis sizes from content and never shrinks.
  flex: "1 1 0",
  display: "flex",
  flexDirection: "column",
  gap: 20,
  overflow: "hidden",
  // A flex column's children refuse to shrink past their content without this, which is how
  // the truth card ended up pushed off the bottom of a 1080 stage.
  minHeight: 0,
};

/** Two columns on the TV, one on a phone staging its own reveal in a no-TV room — the same
 * `min(...)` trick the gallery grid uses, so no media query is needed for either. */
const COLUMNS: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(560px, 100%), 1fr))",
  gap: 32,
  alignItems: "start",
  flex: "1 1 0",
  minHeight: 0,
  // No `overflow: hidden` here. STAGE above already clips, and a second clipping box makes the
  // layout suite read DoodleView's screen-reader label — absolutely positioned, `nowrap`, and
  // clipped to 1px on purpose — as text running out of this one.
};

const COLUMN: CSSProperties = { display: "flex", flexDirection: "column", gap: 16, minWidth: 0 };

function lieTextStyle(look: RevealLook): CSSProperties {
  return {
    flex: "1 1 100%",
    minWidth: 0,
    fontSize: look.text,
    fontWeight: 700,
    lineHeight: 1.2,
    overflow: "hidden",
    textOverflow: look.oneLine ? "ellipsis" : undefined,
    whiteSpace: look.oneLine ? "nowrap" : undefined,
    overflowWrap: "anywhere",
  };
}

function authorName(t: Dictionary, players: PlayerSummary[], authorId: PlayerId | null): string {
  return authorId === null ? t.doodleBluff.houseTitle : nameOf(players, authorId, t.common.someone);
}

function FooledAvatars({ ids, players, look, t }: { ids: PlayerId[]; players: PlayerSummary[]; look: RevealLook; t: Dictionary }) {
  if (ids.length === 0) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: look.text, color: "var(--opg-ink-secondary)", fontWeight: 700 }}>
        <Icon name="eye-off" size={look.text} color="var(--opg-ink-secondary)" />
        {t.doodleBluff.fooledNobody}
      </div>
    );
  }
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      {ids.map((id) => (
        <Avatar key={id} id={avatarOf(players, id)} size={look.avatar} alt={format(t.doodleBluff.avatarAlt, { name: nameOf(players, id, t.common.someone) })} />
      ))}
    </div>
  );
}

/** One lie: its text on top, then who wrote it, who it caught and what it scored. */
function LieRow({ title, players, look, t }: { title: DoodleFooledTitle; players: PlayerSummary[]; look: RevealLook; t: Dictionary }) {
  return (
    <Card variant="M" style={{ boxSizing: "border-box", padding: "6px 16px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
      <div style={lieTextStyle(look)}>{title.text}</div>
      <div style={{ flexGrow: 1, minWidth: 0, fontSize: look.text, fontWeight: 700, color: "var(--opg-ink-secondary)", overflowWrap: "anywhere" }}>
        {format(t.doodleBluff.writtenBy, { name: authorName(t, players, title.authorId) })}
      </div>
      <FooledAvatars ids={title.fooledIds} players={players} look={look} t={t} />
      {title.points > 0 ? (
        <Marker size={look.text} color="var(--opg-marker)">
          +{title.points.toLocaleString("en-US")}
        </Marker>
      ) : null}
    </Card>
  );
}

function LiesColumn({ titles, shown, players, look, t }: { titles: DoodleFooledTitle[]; shown: number; players: PlayerSummary[]; look: RevealLook; t: Dictionary }) {
  const visible = titles.slice(0, shown);
  if (visible.length === 0) return null;
  return (
    <div style={{ ...COLUMN, gap: 8 }}>
      {visible.map((title) => (
        <LieRow key={title.optionId} title={title} players={players} look={look} t={t} />
      ))}
    </div>
  );
}

function FindersLine({ foundByIds, players, look, t }: { foundByIds: PlayerId[]; players: PlayerSummary[]; look: RevealLook; t: Dictionary }) {
  if (foundByIds.length === 0) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: look.text, color: "var(--opg-ink-secondary)", fontWeight: 700 }}>
        <Icon name="eye-off" size={look.text} color="var(--opg-ink-secondary)" />
        {t.doodleBluff.nobodyFoundItTricky}
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
      {foundByIds.map((id) => {
        const name = nameOf(players, id, t.common.someone);
        return (
          <div key={id} style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <Avatar id={avatarOf(players, id)} size={look.avatar} alt={format(t.doodleBluff.avatarAlt, { name })} />
            <div style={{ fontSize: look.text, fontWeight: 700, minWidth: 0, overflowWrap: "anywhere" }}>{name}</div>
          </div>
        );
      })}
    </div>
  );
}

function DrawnByLine({ reveal, players, look, t }: { reveal: NonNullable<DoodleHostView["reveal"]>; players: PlayerSummary[]; look: RevealLook; t: Dictionary }) {
  const name = nameOf(players, reveal.artistId, t.common.someone);
  const text =
    reveal.artistPoints > 0
      ? format(t.doodleBluff.drawnByWithPoints, { name, points: reveal.artistPoints.toLocaleString("en-US") })
      : format(t.doodleBluff.drawnBy, { name });
  return <div style={{ fontSize: look.text, fontWeight: 700, color: "var(--opg-ink-secondary)", overflowWrap: "anywhere" }}>{text}</div>;
}

/** Untilted, unlike every other card here: this one fills its column, and a rotation widens a
 * full-width box past the column's edge — by two pixels, which is enough to make its clipping
 * ancestor report the drawing's screen-reader label as text running out of the screen. */
function TruthSection({ view, players, shown, look, t }: { view: DoodleHostView; players: PlayerSummary[]; shown: boolean; look: RevealLook; t: Dictionary }) {
  const reveal = view.reveal;
  if (!shown || reveal === null) return null;
  return (
    <Card variant="L" style={{ boxSizing: "border-box", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
      <div style={{ fontSize: look.text, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--opg-ink-secondary)" }}>
        {t.doodleBluff.theRealTitle}
      </div>
      <Highlight style={{ padding: "0 12px", minWidth: 0 }}>
        <span style={{ fontSize: look.truth, fontWeight: 700, lineHeight: 1.2, overflowWrap: "anywhere" }}>{reveal.prompt}</span>
      </Highlight>
      <FindersLine foundByIds={reveal.foundByIds} players={players} look={look} t={t} />
      <DrawnByLine reveal={reveal} players={players} look={look} t={t} />
    </Card>
  );
}

export interface HostRevealProps {
  view: DoodleHostView;
  players: PlayerSummary[];
  deadline: number | null;
  timerStartedAt: number | null;
  clock: ServerClock;
  /** Set by a phone staging this itself in a no-TV room: phone type sizes, and lies that wrap. */
  compact?: boolean;
}

export function HostReveal({ view, players, deadline, timerStartedAt, clock, compact = false }: HostRevealProps) {
  const { t } = useLocale();
  const reveal = view.reveal;
  const rootRef = useRef<HTMLDivElement>(null);
  const titleCount = reveal?.titles.length ?? 0;
  const beats = useMemo(() => hostRevealBeats(titleCount), [titleCount]);
  const startedAt = anchorAt(timerStartedAt, deadline, REVEAL_MS);
  const moment = useMoment(beats, startedAt, clock);
  const play = useCue();
  const look = revealLook(compact);
  const shownTitles = titlesShown(beats, moment);
  const truthShown = moment.index >= beats.findIndex((b) => b.id === "truth");

  useBeatEntries(beats, moment, (beat) => {
    if (beat.cue !== undefined) play(beat.cue);
  });

  if (reveal === null) return null;

  return (
    <div ref={rootRef} style={STAGE}>
      <Marker size={compact ? 28 : 44}>{t.doodleBluff.letsSeeWhoFooledWho}</Marker>
      <div style={COLUMNS}>
        <div style={COLUMN}>
          <Card style={{ padding: 8, alignSelf: "center", flexShrink: 0 }}>
            <DoodleView
              doodle={reveal.doodle}
              label={drawingLabel(t, nameOf(players, reveal.artistId, t.common.someone))}
              clock={clock}
              replay={{ startedAt: startedAt ?? clock.now() }}
              size={look.doodle}
            />
          </Card>
          <TruthSection view={view} players={players} shown={truthShown} look={look} t={t} />
        </div>
        <LiesColumn titles={reveal.titles} shown={shownTitles} players={players} look={look} t={t} />
      </div>
    </div>
  );
}
