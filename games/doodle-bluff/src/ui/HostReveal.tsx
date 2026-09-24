// The drawing reveal, TV or no-TV stage: the drawing replays, then each fake title with who it
// fooled, then the truth, then points. Beat-driven off reveal-timeline.ts, so a reconnect mid-
// reveal lands on the settled state with no replayed cues (plan/0002-game-feel.md).
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

const STAGE: CSSProperties = {
  // See BODY in Host.tsx: an `auto` basis sizes from content and never shrinks.
  flex: "1 1 0",
  display: "flex",
  flexDirection: "column",
  gap: 24,
  overflow: "hidden",
  // A flex column's children refuse to shrink past their content without this, which is how
  // the truth card ended up pushed off the bottom of a 1080 stage.
  minHeight: 0,
};

function authorName(t: Dictionary, players: PlayerSummary[], authorId: PlayerId | null): string {
  return authorId === null ? t.doodleBluff.houseTitle : nameOf(players, authorId, t.common.someone);
}

function FooledAvatars({ ids, players, t }: { ids: PlayerId[]; players: PlayerSummary[]; t: Dictionary }) {
  if (ids.length === 0) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--opg-ink-secondary)", fontWeight: 700 }}>
        <Icon name="eye-off" size={22} color="var(--opg-ink-secondary)" />
        {t.doodleBluff.fooledNobody}
      </div>
    );
  }
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      {ids.map((id) => (
        <Avatar key={id} id={avatarOf(players, id)} size={40} alt={format(t.doodleBluff.avatarAlt, { name: nameOf(players, id, t.common.someone) })} />
      ))}
    </div>
  );
}

function TitleCard({ title, players, t }: { title: DoodleFooledTitle; players: PlayerSummary[]; t: Dictionary }) {
  return (
    <Card variant="M" tilt={-1} style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 10, width: 300 }}>
      <div style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.25 }}>{title.text}</div>
      <FooledAvatars ids={title.fooledIds} players={players} t={t} />
      <div style={{ fontSize: 16, fontWeight: 700, color: "var(--opg-ink-secondary)" }}>
        {format(t.doodleBluff.writtenBy, { name: authorName(t, players, title.authorId) })}
      </div>
      {title.points > 0 ? (
        <Marker size={22} color="var(--opg-marker)">
          +{title.points.toLocaleString("en-US")}
        </Marker>
      ) : null}
    </Card>
  );
}

function TitlesRow({ titles, shown, players, t }: { titles: DoodleFooledTitle[]; shown: number; players: PlayerSummary[]; t: Dictionary }) {
  const visible = titles.slice(0, shown);
  if (visible.length === 0) return null;
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
        alignContent: "flex-start",
        gap: 20,
        // At eight players this row carries seven cards. It takes the space left over and
        // clips, rather than growing and shoving the truth card past the bottom edge.
        flex: "1 1 auto",
        minHeight: 0,
        overflow: "hidden",
      }}
    >
      {visible.map((title) => (
        <TitleCard key={title.optionId} title={title} players={players} t={t} />
      ))}
    </div>
  );
}

function FindersLine({ foundByIds, players, t }: { foundByIds: PlayerId[]; players: PlayerSummary[]; t: Dictionary }) {
  if (foundByIds.length === 0) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--opg-ink-secondary)", fontWeight: 700 }}>
        <Icon name="eye-off" size={26} color="var(--opg-ink-secondary)" />
        {t.doodleBluff.nobodyFoundItTricky}
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 20 }}>
      {foundByIds.map((id) => {
        const name = nameOf(players, id, t.common.someone);
        return (
          <div key={id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Avatar id={avatarOf(players, id)} size={40} alt={format(t.doodleBluff.avatarAlt, { name })} />
            <div style={{ fontWeight: 700 }}>{name}</div>
          </div>
        );
      })}
    </div>
  );
}

function DrawnByLine({ reveal, players, t }: { reveal: NonNullable<DoodleHostView["reveal"]>; players: PlayerSummary[]; t: Dictionary }) {
  const name = nameOf(players, reveal.artistId, t.common.someone);
  const text =
    reveal.artistPoints > 0
      ? format(t.doodleBluff.drawnByWithPoints, { name, points: reveal.artistPoints.toLocaleString("en-US") })
      : format(t.doodleBluff.drawnBy, { name });
  return <div style={{ fontSize: 20, fontWeight: 700, color: "var(--opg-ink-secondary)" }}>{text}</div>;
}

function TruthSection({ view, players, shown, t }: { view: DoodleHostView; players: PlayerSummary[]; shown: boolean; t: Dictionary }) {
  const reveal = view.reveal;
  if (!shown || reveal === null) return null;
  return (
    <Card variant="L" tilt={-1} style={{ padding: "28px 32px", display: "flex", flexDirection: "column", gap: 16, alignSelf: "center", flexShrink: 0 }}>
      <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--opg-ink-secondary)" }}>
        {t.doodleBluff.theRealTitle}
      </div>
      <Highlight style={{ padding: "0 12px" }}>
        <span style={{ fontSize: 44, fontWeight: 700 }}>{reveal.prompt}</span>
      </Highlight>
      <FindersLine foundByIds={reveal.foundByIds} players={players} t={t} />
      <DrawnByLine reveal={reveal} players={players} t={t} />
    </Card>
  );
}

export interface HostRevealProps {
  view: DoodleHostView;
  players: PlayerSummary[];
  deadline: number | null;
  timerStartedAt: number | null;
  clock: ServerClock;
}

export function HostReveal({ view, players, deadline, timerStartedAt, clock }: HostRevealProps) {
  const { t } = useLocale();
  const reveal = view.reveal;
  const rootRef = useRef<HTMLDivElement>(null);
  const titleCount = reveal?.titles.length ?? 0;
  const beats = useMemo(() => hostRevealBeats(titleCount), [titleCount]);
  const startedAt = anchorAt(timerStartedAt, deadline, REVEAL_MS);
  const moment = useMoment(beats, startedAt, clock);
  const play = useCue();
  const shownTitles = titlesShown(beats, moment);
  const truthShown = moment.index >= beats.findIndex((b) => b.id === "truth");

  useBeatEntries(beats, moment, (beat) => {
    if (beat.cue !== undefined) play(beat.cue);
  });

  if (reveal === null) return null;

  return (
    <div ref={rootRef} style={STAGE}>
      <Marker size={44}>{t.doodleBluff.letsSeeWhoFooledWho}</Marker>
      <Card style={{ padding: 8, alignSelf: "center", flexShrink: 0 }}>
        <DoodleView doodle={reveal.doodle} label={drawingLabel(t, nameOf(players, reveal.artistId, t.common.someone))} clock={clock} replay={{ startedAt: startedAt ?? clock.now() }} size={300} />
      </Card>
      <TitlesRow titles={reveal.titles} shown={shownTitles} players={players} t={t} />
      <TruthSection view={view} players={players} shown={truthShown} t={t} />
    </div>
  );
}
