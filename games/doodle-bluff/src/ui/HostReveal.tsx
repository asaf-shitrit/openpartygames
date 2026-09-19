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
import { REVEAL_MS, type DoodleFooledTitle, type DoodleHostView } from "../state";
import { avatarOf, drawingLabel, nameOf } from "./common";
import { hostRevealBeats, titlesShown } from "./reveal-timeline";

const STAGE: CSSProperties = {
  flexGrow: 1,
  display: "flex",
  flexDirection: "column",
  gap: 24,
  overflow: "hidden",
};

function authorName(players: PlayerSummary[], authorId: PlayerId | null): string {
  return authorId === null ? "House title" : nameOf(players, authorId);
}

function FooledAvatars({ ids, players }: { ids: PlayerId[]; players: PlayerSummary[] }) {
  if (ids.length === 0) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--opg-ink-secondary)", fontWeight: 700 }}>
        <Icon name="eye-off" size={22} color="var(--opg-ink-secondary)" />
        Fooled nobody
      </div>
    );
  }
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      {ids.map((id) => (
        <Avatar key={id} id={avatarOf(players, id)} size={40} alt={`${nameOf(players, id)}'s avatar`} />
      ))}
    </div>
  );
}

function TitleCard({ title, players }: { title: DoodleFooledTitle; players: PlayerSummary[] }) {
  return (
    <Card variant="M" tilt={-1} style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 10, width: 300 }}>
      <div style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.25 }}>{title.text}</div>
      <FooledAvatars ids={title.fooledIds} players={players} />
      <div style={{ fontSize: 16, fontWeight: 700, color: "var(--opg-ink-secondary)" }}>
        Written by {authorName(players, title.authorId)}
      </div>
      {title.points > 0 ? (
        <Marker size={22} color="var(--opg-marker)">
          +{title.points.toLocaleString("en-US")}
        </Marker>
      ) : null}
    </Card>
  );
}

function TitlesRow({ titles, shown, players }: { titles: DoodleFooledTitle[]; shown: number; players: PlayerSummary[] }) {
  const visible = titles.slice(0, shown);
  if (visible.length === 0) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 20 }}>
      {visible.map((title) => (
        <TitleCard key={title.optionId} title={title} players={players} />
      ))}
    </div>
  );
}

function FindersLine({ foundByIds, players }: { foundByIds: PlayerId[]; players: PlayerSummary[] }) {
  if (foundByIds.length === 0) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--opg-ink-secondary)", fontWeight: 700 }}>
        <Icon name="eye-off" size={26} color="var(--opg-ink-secondary)" />
        Nobody found it! Tricky one.
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 20 }}>
      {foundByIds.map((id) => (
        <div key={id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Avatar id={avatarOf(players, id)} size={40} alt={`${nameOf(players, id)}'s avatar`} />
          <div style={{ fontWeight: 700 }}>{nameOf(players, id)}</div>
        </div>
      ))}
    </div>
  );
}

function TruthSection({ view, players, shown }: { view: DoodleHostView; players: PlayerSummary[]; shown: boolean }) {
  const reveal = view.reveal;
  if (!shown || reveal === null) return null;
  return (
    <Card variant="L" tilt={-1} style={{ padding: "28px 32px", display: "flex", flexDirection: "column", gap: 16, alignSelf: "center" }}>
      <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--opg-ink-secondary)" }}>
        The real title
      </div>
      <Highlight style={{ padding: "0 12px" }}>
        <span style={{ fontSize: 44, fontWeight: 700 }}>{reveal.prompt}</span>
      </Highlight>
      <FindersLine foundByIds={reveal.foundByIds} players={players} />
      {reveal.artistPoints > 0 ? (
        <div style={{ fontSize: 20, fontWeight: 700, color: "var(--opg-ink-secondary)" }}>
          Drawn by {nameOf(players, reveal.artistId)} — +{reveal.artistPoints.toLocaleString("en-US")}
        </div>
      ) : (
        <div style={{ fontSize: 20, fontWeight: 700, color: "var(--opg-ink-secondary)" }}>
          Drawn by {nameOf(players, reveal.artistId)}
        </div>
      )}
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
      <Marker size={44}>Let&apos;s see who fooled who</Marker>
      <Card style={{ padding: 12, alignSelf: "center" }}>
        <DoodleView doodle={reveal.doodle} label={drawingLabel(nameOf(players, reveal.artistId))} clock={clock} replay={{ startedAt: startedAt ?? clock.now() }} size={340} />
      </Card>
      <TitlesRow titles={reveal.titles} shown={shownTitles} players={players} />
      <TruthSection view={view} players={players} shown={truthShown} />
    </div>
  );
}
