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
  FxIn,
  Highlight,
  LetterTiles,
  Marker,
  reached,
  Suspense,
  useMoment,
} from "@opg/ui";
import { format, useLocale } from "@opg/i18n";
import type { Dictionary } from "@opg/i18n";
import { resultDurationMs, type ImposterHostView } from "../../state";
import {
  hostResultBeats,
  lettersRevealed,
  previousTotals,
  RESULT_TIMING,
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
  const { t } = useLocale();
  return (
    <Card variant="M" tilt={0.6} style={CARD_STYLE}>
      <Marker size={26}>{t.imposter.result.wordCancelled}</Marker>
      <div style={{ fontSize: 17, fontWeight: 700 }}>
        {t.imposter.result.noPointsThisWord}
      </div>
    </Card>
  );
}

interface Stage {
  verdictReached: boolean;
  verdictLive: boolean;
  wordReached: boolean;
  wordLive: boolean;
  countReached: boolean;
}

function stageFromMoment(moment: Moment, beats: readonly Beat[]): Stage {
  const isLive = (id: string) => moment.live && moment.beatId === id;
  return {
    verdictReached: reached(moment, beats, "verdict"),
    verdictLive: isLive("verdict"),
    wordReached: reached(moment, beats, "word"),
    wordLive: isLive("word"),
    countReached: reached(moment, beats, "count"),
  };
}

function verdictChipText(
  t: Dictionary,
  path: ResultPath,
  guessCorrect: boolean | null,
): string | null {
  if (path === "escaped") return t.imposter.result.chipEscaped;
  return guessCorrect === true ? t.imposter.result.chipStolen : t.imposter.result.chipNope;
}

/** The caught path holds the chip back for the 3.5s verdict beat, same as the TV's slam;
 * the escaped path has no suspense beat of its own, so its word beat (t=0) gates it instead. */
function verdictShown(path: ResultPath, stage: Stage): boolean {
  return path === "caught" ? stage.verdictReached : stage.wordReached;
}

function verdictLive(path: ResultPath, stage: Stage): boolean {
  return path === "caught" ? stage.verdictLive : stage.wordLive;
}

const CHIP: CSSProperties = {
  alignSelf: "flex-start",
  padding: "2px 14px",
  border: "3px solid var(--opg-marker)",
  borderRadius: "var(--opg-radius-button)",
};

function VerdictChip({
  text,
  shown,
  live,
}: {
  text: string | null;
  shown: boolean;
  live: boolean;
}) {
  if (text === null) return null;
  if (!shown) return <div style={{ minHeight: 28 }} />;
  return (
    <FxIn live={live} preset="pop">
      <div style={CHIP}>
        <Marker size={20} color="var(--opg-marker)">
          {text}
        </Marker>
      </div>
    </FxIn>
  );
}

function WordLine({ crewWord, shown }: { crewWord: string | null; shown: boolean }) {
  const { t } = useLocale();
  if (!shown || crewWord === null) return <div style={{ minHeight: 44 }} />;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: "var(--opg-ink-secondary)" }}>
        {t.imposter.result.theWordWas}
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
  suspenseStartedAt,
  verdictReached,
  clock,
}: {
  imposter: string;
  guess: string;
  revealed: number;
  suspenseStartedAt: number | null;
  verdictReached: boolean;
  clock: ServerClock;
}) {
  const { t } = useLocale();
  const length = Array.from(guess).length;
  if (length === 0) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          // The ring's text equivalent sits below it (Suspense positions its label at
          // bottom: -22px), so this row needs headroom or it overlaps the tiles beneath it.
          paddingBottom: verdictReached || suspenseStartedAt === null ? 0 : 22,
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 400 }}>
          {format(t.imposter.result.guessedNoEllipsis, { name: imposter })}
        </div>
        {verdictReached || suspenseStartedAt === null ? null : (
          <Suspense
            startedAt={suspenseStartedAt}
            durationMs={RESULT_TIMING.caught.verdictMs}
            clock={clock}
            size={40}
            label={t.imposter.result.checkingEllipsis}
          />
        )}
      </div>
      <LetterTiles length={length} letters={guess} revealed={revealed} live size={28} />
    </div>
  );
}

function summaryText(t: Dictionary, view: ImposterHostView, players: PlayerSummary[]): string {
  const imposter = nameOf(players, view.imposterId, t.common.someone);
  const r = t.imposter.result;
  if (view.caught === false) return format(r.summaryEscaped, { name: imposter });
  if (view.guessCorrect === true) return format(r.summaryStoleBack, { name: imposter });
  return format(r.summaryMissed, { name: imposter });
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
  const { t } = useLocale();
  if (!shown) return null;
  return (
    <div style={NOTE}>
      <Avatar
        id={avatarOf(players, view.imposterId)}
        size={36}
        alt={format(t.imposter.avatarAlt, {
          name: nameOf(players, view.imposterId, t.common.someone),
        })}
      />
      <div style={{ fontSize: 16, fontWeight: 700 }}>{summaryText(t, view, players)}</div>
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
  const { t } = useLocale();
  const name = nameOf(players, id, t.common.someone);
  const label = id === me ? format(t.imposter.result.nameYou, { name }) : name;
  return (
    <div style={STANDINGS_ROW}>
      <div style={{ width: 20, fontSize: 16, fontWeight: 700, color: "var(--opg-ink-secondary)" }}>
        {rank}
      </div>
      <Avatar
        id={avatarOf(players, id)}
        size={32}
        alt={format(t.imposter.avatarAlt, { name })}
      />
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
  const { t } = useLocale();
  return (
    <Card variant="M" tilt={-0.4} style={{ ...CARD_STYLE, gap: 2 }}>
      <Marker size={22} style={{ marginBottom: 4 }}>
        {t.imposter.result.standings}
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

interface ResultDerived {
  revealed: number;
  suspenseStartedAt: number | null;
}

/** The letters-flipped count and the drumroll ring's anchor: both only apply to the caught path. */
function resultDerived(
  path: ResultPath,
  beats: readonly Beat[],
  moment: Moment,
  startedAt: number | null,
): ResultDerived {
  return {
    revealed: path === "caught" ? lettersRevealed(beats, moment) : 0,
    suspenseStartedAt: path === "caught" ? startedAt : null,
  };
}

interface StandingsData {
  prevTotals: Record<PlayerId, number>;
  order: PlayerId[];
}

/** Standings run from the pre-word totals up to the current ones. */
function standingsData(view: ImposterHostView): StandingsData {
  const totals = view.totals;
  const prevTotals =
    view.pointsThisWord === null ? totals : previousTotals(totals, view.pointsThisWord);
  return { prevTotals, order: standingsOrder(view.playerIds, totals) };
}

interface GuessSlotProps {
  path: ResultPath;
  imposter: string;
  guess: string;
  revealed: number;
  suspenseStartedAt: number | null;
  verdictReached: boolean;
  clock: ServerClock;
}

/** The guessed-word tiles, only for the caught path -- escaped and cancelled have no guess. */
function GuessSlot({ path, ...guessLine }: GuessSlotProps) {
  if (path !== "caught") return null;
  return <GuessLine {...guessLine} />;
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
  const { t } = useLocale();
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
  const { revealed, suspenseStartedAt } = resultDerived(path, beats, moment, startedAt);

  if (path === "cancelled") return <CancelledCard />;

  const { prevTotals, order } = standingsData(view);

  return (
    <>
      <Card variant="M" tilt={0.6} style={CARD_STYLE}>
        <VerdictChip
          text={verdictChipText(t, path, view.guessCorrect)}
          shown={verdictShown(path, stage)}
          live={verdictLive(path, stage)}
        />
        <WordLine crewWord={view.crewWord} shown={stage.wordReached} />
        <GuessSlot
          path={path}
          imposter={nameOf(players, view.imposterId, t.common.someone)}
          guess={view.guess ?? ""}
          revealed={revealed}
          suspenseStartedAt={suspenseStartedAt}
          verdictReached={stage.verdictReached}
          clock={clock}
        />
        <SummaryNote view={view} players={players} shown={stage.wordReached} />
      </Card>
      <StandingsCard
        order={order}
        players={players}
        me={me}
        from={prevTotals}
        to={view.totals}
        live={stage.countReached}
      />
    </>
  );
}
