// No-TV stage for the word result: the guess reveal, verdict, points and standings, in one
// column. Reuses ../result-timeline.ts unchanged -- hostResultBeats, lettersRevealed,
// standingsOrder and previousTotals are all pure and phone-ready; only the painting is new.
// `me` personalizes the rendering (the "(you)" tag) but never the data: it is public info the
// phone already knows locally, not something the wire payload carries.
import { useMemo } from "react";
import type { CSSProperties } from "react";
import type { PlayerId, PlayerSummary } from "@opg/protocol";
import type { Beat, Moment, ServerClock } from "@opg/ui";
import {
  anchorAt,
  Avatar,
  Card,
  CountUp,
  Highlight,
  LetterTiles,
  Marker,
  reached,
  useMoment,
} from "@opg/ui";
import { resultDurationMs, type ImposterHostView } from "../../state";
import {
  hostResultBeats,
  lettersRevealed,
  previousTotals,
  resultPath,
  standingsOrder,
} from "../result-timeline";
import type { ResultPath } from "../result-timeline";
import { avatarOf, nameOf } from "./common";

const CARD_STYLE: CSSProperties = {
  padding: "14px 16px",
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

function CancelledCard() {
  return (
    <Card variant="M" tilt={0.6} style={CARD_STYLE}>
      <Marker size={26}>Word cancelled</Marker>
      <div style={{ fontSize: 17, fontWeight: 700 }}>No points this word.</div>
    </Card>
  );
}

interface Stage {
  wordReached: boolean;
  countReached: boolean;
}

function stageFromMoment(moment: Moment, beats: readonly Beat[]): Stage {
  return {
    wordReached: reached(moment, beats, "word"),
    countReached: reached(moment, beats, "count"),
  };
}

function verdictChipText(path: ResultPath, guessCorrect: boolean | null): string | null {
  if (path === "escaped") return "Escaped";
  return guessCorrect === true ? "Stolen!" : "Nope";
}

const CHIP: CSSProperties = {
  alignSelf: "flex-start",
  padding: "2px 14px",
  border: "3px solid var(--opg-marker)",
  borderRadius: "var(--opg-radius-button)",
};

function VerdictChip({ text }: { text: string | null }) {
  if (text === null) return null;
  return (
    <div style={CHIP}>
      <Marker size={20} color="var(--opg-marker)">
        {text}
      </Marker>
    </div>
  );
}

function WordLine({ crewWord, shown }: { crewWord: string | null; shown: boolean }) {
  if (!shown || crewWord === null) return <div style={{ minHeight: 44 }} />;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: "var(--opg-ink-secondary)" }}>
        The word was
      </div>
      <Highlight style={{ alignSelf: "flex-start", padding: "0 8px" }}>
        <Marker size={34}>{crewWord}</Marker>
      </Highlight>
    </div>
  );
}

function GuessLine({
  imposter,
  guess,
  revealed,
}: {
  imposter: string;
  guess: string;
  revealed: number;
}) {
  const length = Array.from(guess).length;
  if (length === 0) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ fontSize: 16, fontWeight: 400 }}>{imposter} guessed</div>
      <LetterTiles length={length} letters={guess} revealed={revealed} live size={28} />
    </div>
  );
}

function summaryText(view: ImposterHostView, players: PlayerSummary[]): string {
  const imposter = nameOf(players, view.imposterId);
  if (view.caught === false) return `${imposter} was the imposter and got away.`;
  if (view.guessCorrect === true) return `${imposter} was the imposter, caught, and stole the word back.`;
  return `${imposter} was the imposter, caught, and missed the guess.`;
}

const NOTE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "10px 12px",
  background: "var(--opg-highlight-soft)",
  border: "3px solid var(--opg-ink)",
  borderRadius: "22px 8px 18px 10px / 10px 18px 8px 22px",
};

function SummaryNote({
  view,
  players,
  shown,
}: {
  view: ImposterHostView;
  players: PlayerSummary[];
  shown: boolean;
}) {
  if (!shown) return null;
  return (
    <div style={NOTE}>
      <Avatar
        id={avatarOf(players, view.imposterId)}
        size={36}
        alt={`${nameOf(players, view.imposterId)}'s avatar`}
      />
      <div style={{ fontSize: 16, fontWeight: 700 }}>{summaryText(view, players)}</div>
    </div>
  );
}

function rankOf(order: readonly PlayerId[], totals: Record<PlayerId, number>, id: PlayerId): number {
  const score = totals[id] ?? 0;
  return 1 + order.filter((other) => (totals[other] ?? 0) > score).length;
}

const STANDINGS_ROW: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  height: 42,
};

interface StandingsRowProps {
  id: PlayerId;
  rank: number;
  players: PlayerSummary[];
  me: PlayerId | null;
  from: number;
  to: number;
  live: boolean;
}

function StandingsRow({ id, rank, players, me, from, to, live }: StandingsRowProps) {
  const name = nameOf(players, id);
  const label = id === me ? `${name} (you)` : name;
  return (
    <div style={STANDINGS_ROW}>
      <div style={{ width: 20, fontSize: 16, fontWeight: 700, color: "var(--opg-ink-secondary)" }}>
        {rank}
      </div>
      <Avatar id={avatarOf(players, id)} size={32} alt={`${name}'s avatar`} />
      <div style={{ flexGrow: 1, fontSize: 17, fontWeight: 700 }}>{label}</div>
      <CountUp from={from} to={to} live={live} style={{ fontSize: 18, fontWeight: 700 }} />
    </div>
  );
}

interface StandingsCardProps {
  order: readonly PlayerId[];
  players: PlayerSummary[];
  me: PlayerId | null;
  from: Record<PlayerId, number>;
  to: Record<PlayerId, number>;
  live: boolean;
}

function StandingsCard({ order, players, me, from, to, live }: StandingsCardProps) {
  return (
    <Card variant="M" tilt={-0.4} style={{ ...CARD_STYLE, gap: 2 }}>
      <Marker size={22} style={{ marginBottom: 4 }}>
        Standings
      </Marker>
      {order.map((id) => (
        <StandingsRow
          key={id}
          id={id}
          rank={rankOf(order, to, id)}
          players={players}
          me={me}
          from={from[id] ?? 0}
          to={to[id] ?? 0}
          live={live}
        />
      ))}
    </Card>
  );
}

export interface StageResultProps {
  view: ImposterHostView;
  players: PlayerSummary[];
  me: PlayerId | null;
  deadline: number | null;
  timerStartedAt: number | null;
  clock: ServerClock;
}

/** The stage region for a word's result: the guess, the word, the verdict and standings. */
export function StageResult(props: StageResultProps) {
  const { view, players, me, clock } = props;
  const path = resultPath(view.caught);
  const guessLetters = Array.from(view.guess ?? "").length;
  const beats = useMemo(
    () => hostResultBeats(path, view.guessCorrect, guessLetters),
    [path, view.guessCorrect, guessLetters],
  );
  const startedAt = anchorAt(props.timerStartedAt, props.deadline, resultDurationMs(view.caught));
  const moment = useMoment(beats, startedAt, clock);
  const stage = stageFromMoment(moment, beats);
  const revealed = path === "caught" ? lettersRevealed(beats, moment) : 0;

  if (path === "cancelled") return <CancelledCard />;

  const totals = view.totals;
  const prevTotals =
    view.pointsThisWord === null ? totals : previousTotals(totals, view.pointsThisWord);
  const order = standingsOrder(view.playerIds, totals);

  return (
    <>
      <Card variant="M" tilt={0.6} style={CARD_STYLE}>
        <VerdictChip text={verdictChipText(path, view.guessCorrect)} />
        <WordLine crewWord={view.crewWord} shown={stage.wordReached} />
        {path === "caught" ? (
          <GuessLine
            imposter={nameOf(players, view.imposterId)}
            guess={view.guess ?? ""}
            revealed={revealed}
          />
        ) : null}
        <SummaryNote view={view} players={players} shown={stage.wordReached} />
      </Card>
      <StandingsCard
        order={order}
        players={players}
        me={me}
        from={prevTotals}
        to={totals}
        live={stage.countReached}
      />
    </>
  );
}
