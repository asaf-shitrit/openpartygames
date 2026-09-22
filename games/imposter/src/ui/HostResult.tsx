// TV word result: the guess reveal, verdict stamp, points and standings, staged beat by
// beat off the shared clock. Everything is derived from the moment, so a reconnect lands
// on the settled state with zero cues and no confetti.
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, RefObject } from "react";
import type { PlayerId, PlayerSummary } from "@opg/protocol";
import type { Beat, Moment, ServerClock } from "@opg/ui";
import {
  anchorAt,
  Avatar,
  Card,
  Confetti,
  CountUp,
  FxIn,
  Highlight,
  LetterTiles,
  Marker,
  SlamStamp,
  StickyNote,
  formatPoints,
  msUntilNextSecond,
  rankChanges,
  reached,
  tileSizeFor,
  useBeatEntries,
  useCue,
  useFlipList,
  useMoment,
} from "@opg/ui";
import { format, useLocale } from "@opg/i18n";
import type { Dictionary } from "@opg/i18n";
import { resultDurationMs, type ImposterHostView } from "../state";
import {
  hostResultBeats,
  lettersRevealed,
  previousTotals,
  resultPath,
  standingsOrder,
} from "./result-timeline";
import type { ResultPath } from "./result-timeline";

function findPlayer(
  players: PlayerSummary[],
  id: PlayerId | null,
): PlayerSummary | null {
  if (!id) return null;
  return players.find((player) => player.id === id) ?? null;
}

function nameOf(t: Dictionary, players: PlayerSummary[], id: PlayerId | null): string {
  return findPlayer(players, id)?.name ?? t.common.someone;
}

function avatarOf(players: PlayerSummary[], id: PlayerId | null) {
  return findPlayer(players, id)?.avatar ?? null;
}

function avatarLabel(t: Dictionary, players: PlayerSummary[], id: PlayerId | null): string {
  return format(t.imposter.avatarAlt, { name: nameOf(t, players, id) });
}

const SECONDARY: CSSProperties = {
  fontWeight: 700,
  color: "var(--opg-ink-secondary)",
};

interface Stage {
  live: boolean;
  verdict: boolean;
  verdictLive: boolean;
  word: boolean;
  wordLive: boolean;
  points: boolean;
  pointsLive: boolean;
  count: boolean;
  reorder: boolean;
  reorderLive: boolean;
}

function isLive(moment: Moment, id: string): boolean {
  return moment.live && moment.beatId === id;
}

function stageFromMoment(moment: Moment, beats: readonly Beat[]): Stage {
  return {
    live: moment.live,
    verdict: reached(moment, beats, "verdict"),
    verdictLive: isLive(moment, "verdict"),
    word: reached(moment, beats, "word"),
    wordLive: isLive(moment, "word"),
    points: reached(moment, beats, "points"),
    pointsLive: isLive(moment, "points"),
    count: reached(moment, beats, "count"),
    reorder: reached(moment, beats, "reorder"),
    reorderLive: isLive(moment, "reorder"),
  };
}

// ---------- guess + verdict ----------

function CheckGlyph() {
  return (
    <svg width={30} height={30} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M5 12.5l4.5 4.5L19 7"
        fill="none"
        stroke="currentColor"
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CrossGlyph() {
  return (
    <svg width={30} height={30} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M6 6l12 12M18 6L6 18"
        fill="none"
        stroke="currentColor"
        strokeWidth={3}
        strokeLinecap="round"
      />
    </svg>
  );
}

function StampContent({ correct }: { correct: boolean }) {
  const { t } = useLocale();
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        whiteSpace: "nowrap",
      }}
    >
      {correct ? <CheckGlyph /> : <CrossGlyph />}
      {correct ? t.imposter.result.stampGotIt : t.imposter.result.stampNope}
    </span>
  );
}

const HERO_TILE_MAX_WIDTH = 1000;
const HERO_TILE_SIZE = 110;
const COMPACT_TILE_SIZE = 64;
const HERO_STAMP_SIZE = 88;
const COMPACT_STAMP_SIZE = 56;
const HERO_NAME_SIZE = 64;
const COMPACT_NAME_SIZE = 40;

function GuessLine({
  view,
  players,
  beats,
  moment,
  hero,
}: {
  view: ImposterHostView;
  players: PlayerSummary[];
  beats: readonly Beat[];
  moment: Moment;
  hero: boolean;
}) {
  const { t } = useLocale();
  const imposter = nameOf(t, players, view.imposterId);
  const guess = view.guess ?? "";
  const guessLetters = Array.from(guess).length;
  const tileSize = hero
    ? tileSizeFor(guessLetters, HERO_TILE_MAX_WIDTH, HERO_TILE_SIZE)
    : COMPACT_TILE_SIZE;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: hero ? "column" : "row",
        alignItems: "center",
        gap: hero ? 20 : 22,
      }}
    >
      <Marker size={hero ? HERO_NAME_SIZE : COMPACT_NAME_SIZE}>
        {format(t.imposter.result.guessedEllipsis, { name: imposter })}
      </Marker>
      <LetterTiles
        length={guessLetters}
        letters={guess}
        revealed={lettersRevealed(beats, moment)}
        live={moment.live}
        size={tileSize}
      />
    </div>
  );
}

function VerdictStamp({
  stage,
  guessCorrect,
  shakeRef,
  hero,
}: {
  stage: Stage;
  guessCorrect: boolean | null;
  shakeRef: RefObject<HTMLElement | null>;
  hero: boolean;
}) {
  if (!stage.verdict) return null;
  const correct = guessCorrect === true;
  return (
    <div style={{ position: "relative", display: "flex" }}>
      {correct ? (
        <div style={{ position: "absolute", inset: -80, zIndex: -1 }}>
          <Confetti live={stage.verdictLive} surface="tv" />
        </div>
      ) : null}
      <SlamStamp
        live={stage.verdictLive}
        shake="big"
        shakeRef={shakeRef}
        size={hero ? HERO_STAMP_SIZE : COMPACT_STAMP_SIZE}
      >
        <StampContent correct={correct} />
      </SlamStamp>
    </div>
  );
}

/** Fixed-height slot for the guess + verdict so the switch from hero to compact never jumps
 * the word line and points card beneath it. */
const GUESS_VERDICT_HEIGHT = 360;

function GuessAndVerdict({
  view,
  players,
  beats,
  moment,
  stage,
  shakeRef,
}: {
  view: ImposterHostView;
  players: PlayerSummary[];
  beats: readonly Beat[];
  moment: Moment;
  stage: Stage;
  shakeRef: RefObject<HTMLElement | null>;
}) {
  const hero = !stage.word;
  return (
    <div
      style={{
        height: GUESS_VERDICT_HEIGHT,
        display: "flex",
        flexDirection: "column",
        justifyContent: hero ? "center" : "flex-start",
        alignItems: hero ? "center" : "flex-start",
        gap: hero ? 24 : 18,
      }}
    >
      <GuessLine
        view={view}
        players={players}
        beats={beats}
        moment={moment}
        hero={hero}
      />
      <VerdictStamp
        stage={stage}
        guessCorrect={view.guessCorrect}
        shakeRef={shakeRef}
        hero={hero}
      />
    </div>
  );
}

function WordLine({
  stage,
  crewWord,
}: {
  stage: Stage;
  crewWord: string | null;
}) {
  const { t } = useLocale();
  if (!stage.word) return null;
  return (
    <FxIn live={stage.wordLive} preset="fadeIn">
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <div style={{ fontSize: 44, fontWeight: 700 }}>{t.imposter.result.theWordWas}</div>
        <Highlight style={{ padding: "0 18px" }}>
          <Marker size={68} style={{ letterSpacing: "0.02em" }}>
            {crewWord ?? "—"}
          </Marker>
        </Highlight>
      </div>
    </FxIn>
  );
}

function SneakDoodle() {
  return (
    <svg width={100} height={60} viewBox="0 0 100 60" aria-hidden="true">
      <g
        fill="none"
        stroke="var(--opg-ink)"
        strokeWidth={5}
        strokeLinecap="round"
        strokeDasharray="9 7"
      >
        <path d="M4 46c8-14 20-22 34-22" />
        <path d="M42 34c10-10 22-14 34-10" />
      </g>
      <g fill="var(--opg-ink)">
        <ellipse cx="14" cy="50" rx="10" ry="7" />
        <ellipse cx="86" cy="26" rx="10" ry="7" />
      </g>
    </svg>
  );
}

function CaughtLeft({
  view,
  players,
  beats,
  moment,
  stage,
  shakeRef,
}: {
  view: ImposterHostView;
  players: PlayerSummary[];
  beats: readonly Beat[];
  moment: Moment;
  stage: Stage;
  shakeRef: RefObject<HTMLElement | null>;
}) {
  return (
    <>
      <GuessAndVerdict
        view={view}
        players={players}
        beats={beats}
        moment={moment}
        stage={stage}
        shakeRef={shakeRef}
      />
      <WordLine stage={stage} crewWord={view.crewWord} />
    </>
  );
}

function EscapedLeft({
  view,
  players,
  stage,
}: {
  view: ImposterHostView;
  players: PlayerSummary[];
  stage: Stage;
}) {
  const { t } = useLocale();
  const imposter = nameOf(t, players, view.imposterId);
  return (
    <FxIn live={stage.wordLive} preset="fadeIn">
      <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
        <SneakDoodle />
        <Marker size={72}>{format(t.imposter.reveal.slippedAway, { name: imposter })}</Marker>
      </div>
    </FxIn>
  );
}

function CancelledLeft() {
  const { t } = useLocale();
  return <Marker size={72}>{t.imposter.result.wordCancelled}</Marker>;
}

function ResultHeadline({
  path,
  view,
  players,
  beats,
  moment,
  stage,
  shakeRef,
}: {
  path: ResultPath;
  view: ImposterHostView;
  players: PlayerSummary[];
  beats: readonly Beat[];
  moment: Moment;
  stage: Stage;
  shakeRef: RefObject<HTMLElement | null>;
}) {
  if (path === "cancelled") return <CancelledLeft />;
  if (path === "escaped") {
    return <EscapedLeft view={view} players={players} stage={stage} />;
  }
  return (
    <CaughtLeft
      view={view}
      players={players}
      beats={beats}
      moment={moment}
      stage={stage}
      shakeRef={shakeRef}
    />
  );
}

// ---------- points ----------

interface PointRow {
  key: string;
  points: number;
  ids: PlayerId[];
  reason: string;
}

function imposterReason(t: Dictionary, view: ImposterHostView): string {
  const r = t.imposter.result;
  if (!view.caught) return r.reasonNotCaught;
  return view.guessCorrect ? r.reasonGuessedRight : r.reasonCaughtWrongGuess;
}

function votedFor(
  id: PlayerId,
  tally: Record<PlayerId, PlayerId[]> | null,
): PlayerId | null {
  let target: PlayerId | null = null;
  for (const [candidate, voters] of Object.entries(tally ?? {})) {
    if (voters.includes(id)) target = candidate;
  }
  return target;
}

function reasonFor(
  t: Dictionary,
  id: PlayerId,
  view: ImposterHostView,
  players: PlayerSummary[],
): string {
  if (id === view.imposterId) return imposterReason(t, view);
  const target = votedFor(id, view.tally);
  const r = t.imposter.result;
  if (target === null) return r.reasonNoVote;
  const name = nameOf(t, players, target);
  if (target === view.imposterId) return format(r.reasonSpotted, { name });
  return format(r.reasonVoted, { name });
}

function pointRows(
  t: Dictionary,
  view: ImposterHostView,
  players: PlayerSummary[],
): PointRow[] {
  const points = view.pointsThisWord ?? {};
  const rows: PointRow[] = [];
  for (const id of view.playerIds) {
    const value = points[id] ?? 0;
    const reason = reasonFor(t, id, view, players);
    const key = `${value}|${reason}`;
    const existing = rows.find((row) => row.key === key);
    if (existing) {
      existing.ids.push(id);
      continue;
    }
    const row: PointRow = { key, points: value, ids: [id], reason };
    const at = rows.findIndex((other) => other.points < value);
    if (at === -1) rows.push(row);
    else rows.splice(at, 0, row);
  }
  return rows;
}

function PointRowView({
  row,
  players,
}: {
  row: PointRow;
  players: PlayerSummary[];
}) {
  const { t } = useLocale();
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 20,
        minHeight: 76,
      }}
    >
      <div
        style={{ display: "flex", alignItems: "center", gap: 4, width: 264 }}
      >
        {row.ids.slice(0, 4).map((id) => (
          <Avatar
            key={id}
            id={avatarOf(players, id)}
            size={62}
            alt={avatarLabel(t, players, id)}
          />
        ))}
        {row.ids.length > 4 ? (
          <div style={{ fontSize: 28, fontWeight: 700 }}>
            +{row.ids.length - 4}
          </div>
        ) : null}
      </div>
      <div style={{ flexGrow: 1, display: "flex", flexDirection: "column" }}>
        <div style={{ fontSize: 34, fontWeight: 700, lineHeight: 1.2 }}>
          {row.ids.map((id) => nameOf(t, players, id)).join(", ")}
        </div>
        <div
          style={{
            fontSize: 30,
            lineHeight: 1.2,
            color: "var(--opg-ink-secondary)",
          }}
        >
          {row.reason}
        </div>
      </div>
      <Marker size={46} style={{ lineHeight: 1 }}>
        {format(
          row.ids.length > 1 ? t.imposter.result.pointsEach : t.imposter.result.pointsSingle,
          { points: formatPoints(row.points) },
        )}
      </Marker>
    </div>
  );
}

const POINTS_STEP_MS = 150;

function PointsCard({
  view,
  players,
  stage,
}: {
  view: ImposterHostView;
  players: PlayerSummary[];
  stage: Stage;
}) {
  const { t } = useLocale();
  if (!stage.points) return null;
  const rows = pointRows(t, view, players);
  return (
    <Card
      variant="M"
      style={{
        marginTop: 10,
        padding: "30px 40px 32px",
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <Marker size={48}>{t.imposter.result.pointsThisWord}</Marker>
      {rows.map((row, index) => (
        <FxIn
          key={row.key}
          live={stage.pointsLive}
          preset="pop"
          delayMs={index * POINTS_STEP_MS}
        >
          <PointRowView row={row} players={players} />
        </FxIn>
      ))}
    </Card>
  );
}

// ---------- standings ----------

function RankBadge({ delta }: { delta: number }) {
  return (
    <div style={{ fontSize: 26, fontWeight: 700, color: "var(--opg-marker)" }}>
      ▲{delta}
    </div>
  );
}

function StandingsRow({
  id,
  index,
  players,
  view,
  stage,
  prevTotal,
  rankDelta,
  registerRef,
}: {
  id: PlayerId;
  index: number;
  players: PlayerSummary[];
  view: ImposterHostView;
  stage: Stage;
  prevTotal: number;
  rankDelta: number;
  registerRef: (el: HTMLElement | null) => void;
}) {
  const { t } = useLocale();
  return (
    <div
      ref={registerRef}
      style={{ display: "flex", alignItems: "center", gap: 18, height: 80 }}
    >
      <div style={{ width: 36, fontSize: 32, ...SECONDARY }}>{index + 1}</div>
      <Avatar
        id={avatarOf(players, id)}
        size={64}
        alt={avatarLabel(t, players, id)}
      />
      <div style={{ flexGrow: 1, fontSize: 36, fontWeight: 700 }}>
        {nameOf(t, players, id)}
      </div>
      {stage.reorder && rankDelta > 0 ? <RankBadge delta={rankDelta} /> : null}
      <div
        style={{
          fontSize: 38,
          fontWeight: 700,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {stage.count ? (
          <CountUp
            from={prevTotal}
            to={view.totals[id] ?? 0}
            live={stage.live}
          />
        ) : (
          formatPoints(prevTotal)
        )}
      </div>
    </div>
  );
}

function StandingsCard({
  view,
  players,
  stage,
}: {
  view: ImposterHostView;
  players: PlayerSummary[];
  stage: Stage;
}) {
  const previous = useMemo(
    () => previousTotals(view.totals, view.pointsThisWord),
    [view.totals, view.pointsThisWord],
  );
  const previousOrder = useMemo(
    () => standingsOrder(view.playerIds, previous),
    [view.playerIds, previous],
  );
  const newOrder = useMemo(
    () => standingsOrder(view.playerIds, view.totals),
    [view.playerIds, view.totals],
  );
  const order = stage.reorder ? newOrder : previousOrder;
  const ranks = useMemo(
    () => rankChanges(previousOrder, newOrder),
    [previousOrder, newOrder],
  );
  const flip = useFlipList(order);
  const { t } = useLocale();
  return (
    <Card
      variant="Malt"
      tilt={1}
      style={{
        marginTop: 18,
        padding: "36px 40px 34px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <Marker size={56} style={{ marginBottom: 8 }}>
        {t.imposter.result.standings}
      </Marker>
      {order.map((id, index) => (
        <StandingsRow
          key={id}
          id={id}
          index={index}
          players={players}
          view={view}
          stage={stage}
          prevTotal={previous[id] ?? 0}
          rankDelta={ranks[id] ?? 0}
          registerRef={flip.register(id)}
        />
      ))}
    </Card>
  );
}

// ---------- settle ----------

/** Schedules one setTimeout aligned to the next whole second, chaining by re-rendering. */
function useSecondTicker(deadline: number | null, now: number): void {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (deadline === null || now >= deadline) return undefined;
    const delay = msUntilNextSecond(deadline, now);
    const id = window.setTimeout(() => setTick((value) => value + 1), delay);
    return () => window.clearTimeout(id);
  }, [deadline, now]);
}

function Countdown({
  deadline,
  clock,
}: {
  deadline: number | null;
  clock: ServerClock;
}) {
  const now = clock.now();
  useSecondTicker(deadline, now);
  if (deadline === null) return null;
  const total = Math.max(0, Math.ceil((deadline - now) / 1000));
  return (
    <>
      {Math.floor(total / 60)}:{String(total % 60).padStart(2, "0")}
    </>
  );
}

function ResultRight({
  view,
  players,
  deadline,
  clock,
  stage,
}: {
  view: ImposterHostView;
  players: PlayerSummary[];
  deadline: number | null;
  clock: ServerClock;
  stage: Stage;
}) {
  const { t } = useLocale();
  const lastWord = view.wordNumber >= view.wordCount;
  const nextLabel = lastWord
    ? t.imposter.progress.finalScoresNext
    : format(t.imposter.result.wordStartsIn, { number: view.wordNumber + 1 });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      <StandingsCard view={view} players={players} stage={stage} />
      <StickyNote
        tilt={-1.5}
        style={{
          alignSelf: "flex-end",
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: "18px 28px",
        }}
      >
        <div style={{ fontSize: 36, fontWeight: 700 }}>{nextLabel}</div>
        {lastWord ? null : (
          <Marker size={48} style={{ lineHeight: 1 }}>
            <Countdown deadline={deadline} clock={clock} />
          </Marker>
        )}
      </StickyNote>
    </div>
  );
}

export interface HostResultProps {
  view: ImposterHostView;
  players: PlayerSummary[];
  deadline: number | null;
  timerStartedAt: number | null;
  clock: ServerClock;
}

export function HostResult({
  view,
  players,
  deadline,
  timerStartedAt,
  clock,
}: HostResultProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const path = resultPath(view.caught);
  const guessLetters = Array.from(view.guess ?? "").length;
  const beats = useMemo(
    () => hostResultBeats(path, view.guessCorrect, guessLetters),
    [path, view.guessCorrect, guessLetters],
  );
  const startedAt = anchorAt(
    timerStartedAt,
    deadline,
    resultDurationMs(view.caught),
  );
  const moment = useMoment(beats, startedAt, clock);
  const play = useCue();
  const stage = stageFromMoment(moment, beats);

  useBeatEntries(beats, moment, (beat) => {
    if (beat.cue !== undefined) play(beat.cue);
  });

  return (
    <div
      ref={rootRef}
      style={{
        flexGrow: 1,
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) 640px",
        gap: 64,
        alignItems: "start",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        <ResultHeadline
          path={path}
          view={view}
          players={players}
          beats={beats}
          moment={moment}
          stage={stage}
          shakeRef={rootRef}
        />
        <PointsCard view={view} players={players} stage={stage} />
      </div>
      <ResultRight
        view={view}
        players={players}
        deadline={deadline}
        clock={clock}
        stage={stage}
      />
    </div>
  );
}
