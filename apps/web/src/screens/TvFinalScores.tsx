// design/TVFinalScores.dc.html — lobby results screen after a game, ending in the crown ceremony.
import type { CSSProperties } from "react";
import type {
  Award,
  GameResultSummary,
  HostRoomView,
  PlayerId,
  PlayerSummary,
} from "@opg/protocol";
import {
  Avatar,
  Card,
  Confetti,
  CountUp,
  Crown,
  FxIn,
  Highlight,
  Marker,
  reached,
  Tape,
  Tally,
  TvHeader,
  useBeatEntries,
  useCue,
  useMoment,
  useMusic,
} from "@opg/ui";
import type {
  Beat,
  CueHandle,
  CueId,
  CueOptions,
  Moment,
  MusicId,
  ServerClock,
} from "@opg/ui";
import { awardCopyFor } from "../games";
import { PointArrow, TvPage } from "./shared";
import {
  crownCopy,
  crownCueId,
  finaleBeats,
  FINALE_TIMING,
  joinNames,
  rankPlayers,
} from "./finale-timeline";
import type { RankedPlayer } from "./finale-timeline";

const FALLBACK_CLOCK: ServerClock = { now: () => Date.now() };

const HIDDEN: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  margin: -1,
  padding: 0,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
  border: 0,
};

function formatScore(score: number): string {
  return score.toLocaleString("en-US");
}

function findPlayer(
  players: readonly PlayerSummary[],
  id: PlayerId | null,
): PlayerSummary | null {
  if (!id) return null;
  return players.find((player) => player.id === id) ?? null;
}

function nameOf(players: readonly PlayerSummary[], id: PlayerId | null): string {
  return findPlayer(players, id)?.name ?? "Someone";
}

function avatarOf(players: readonly PlayerSummary[], id: PlayerId | null) {
  return findPlayer(players, id)?.avatar ?? null;
}

function cueOptions(cue: CueId): CueOptions | undefined {
  if (cue === "drumroll") return { durationMs: FINALE_TIMING.drumrollMs };
  return undefined;
}

function EmptyFinalScores({ code }: { code: string }) {
  return (
    <TvPage>
      <TvHeader variant="brand" roomCode={code} />
      <div
        style={{
          flexGrow: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Marker size={64}>Waiting for final scores</Marker>
      </div>
    </TvPage>
  );
}

interface Stage {
  wrapLive: boolean;
  awardsShown: number;
  awardLiveIndex: number | null;
  crownIntroReached: boolean;
  crownIntroLive: boolean;
  thirdReached: boolean;
  thirdLive: boolean;
  secondReached: boolean;
  secondLive: boolean;
  crownReached: boolean;
  crownLive: boolean;
  settleReached: boolean;
  settleLive: boolean;
}

function isLive(moment: Moment, id: string): boolean {
  return moment.live && moment.beatId === id;
}

function countAwardsShown(beats: readonly Beat[], moment: Moment): number {
  let shown = 0;
  for (let index = 0; index <= moment.index; index += 1) {
    if (beats[index]?.id.startsWith("award-")) shown += 1;
  }
  return shown;
}

function liveAwardIndex(moment: Moment): number | null {
  if (!moment.live || moment.beatId === null) return null;
  if (!moment.beatId.startsWith("award-")) return null;
  const index = Number(moment.beatId.slice("award-".length));
  return Number.isNaN(index) ? null : index;
}

function stageFromMoment(moment: Moment, beats: readonly Beat[]): Stage {
  return {
    wrapLive: isLive(moment, "wrap"),
    awardsShown: countAwardsShown(beats, moment),
    awardLiveIndex: liveAwardIndex(moment),
    crownIntroReached: reached(moment, beats, "crown-intro"),
    crownIntroLive: isLive(moment, "crown-intro"),
    thirdReached: reached(moment, beats, "third"),
    thirdLive: isLive(moment, "third"),
    secondReached: reached(moment, beats, "second"),
    secondLive: isLive(moment, "second"),
    crownReached: reached(moment, beats, "crown"),
    crownLive: isLive(moment, "crown"),
    settleReached: reached(moment, beats, "settle"),
    settleLive: isLive(moment, "settle"),
  };
}

/** Compact scoreboard row: keeps the whole list, up to 8 players, inside a ~64px row. */
function ScoreRow({
  row,
  players,
  winner,
}: {
  row: RankedPlayer;
  players: PlayerSummary[];
  winner: boolean;
}) {
  const player = findPlayer(players, row.id);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 18,
        padding: "6px 24px",
        minHeight: 64,
        background:
          row.rank === 1 ? "var(--opg-highlight-soft)" : "var(--opg-card)",
        border: "4px solid var(--opg-ink)",
        borderRadius:
          row.rank % 2 === 1
            ? "var(--opg-radius-m)"
            : "var(--opg-radius-m-alt)",
      }}
    >
      <div
        className="opg-marker"
        style={{
          width: 44,
          fontSize: 36,
          lineHeight: 1,
          color: row.rank === 1 ? "var(--opg-marker)" : "var(--opg-ink)",
        }}
      >
        {row.rank}
      </div>
      <Avatar id={avatarOf(players, row.id)} size={48} />
      <div style={{ flexGrow: 1, fontSize: 32, fontWeight: 700 }}>
        {nameOf(players, row.id)}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {player && player.crowns > 0 ? (
          <Tally count={player.crowns} size={30} />
        ) : null}
        {winner ? (
          <div
            className="opg-marker"
            style={{
              fontSize: 28,
              lineHeight: 1,
              color: "var(--opg-marker)",
              transform: "rotate(-6deg)",
            }}
          >
            new!
          </div>
        ) : null}
      </div>
      <div
        style={{
          width: 140,
          textAlign: "right",
          fontSize: 32,
          fontWeight: 700,
        }}
      >
        {formatScore(row.score)}
      </div>
    </div>
  );
}

function ScoresList({
  ranked,
  players,
  winners,
}: {
  ranked: RankedPlayer[];
  players: PlayerSummary[];
  winners: readonly PlayerId[];
}) {
  const winnerSet = new Set(winners);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Marker size={40}>Final scores</Marker>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {ranked.map((row) => (
          <ScoreRow
            key={row.id}
            row={row}
            players={players}
            winner={winnerSet.has(row.id)}
          />
        ))}
      </div>
    </div>
  );
}

function vipName(players: readonly PlayerSummary[], vipId: PlayerId | null) {
  return vipId ? nameOf(players, vipId) : null;
}

function FinalScoresFooter({ vip }: { vip: string | null }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 18,
        fontSize: 38,
        fontWeight: 700,
      }}
    >
      <PointArrow />
      {vip ? (
        <>
          <Highlight style={{ padding: "0 6px" }}>
            <span>{vip}</span>
          </Highlight>
          <div>picks the next game from their phone</div>
        </>
      ) : (
        <div>picks the next game from their phone</div>
      )}
    </div>
  );
}

function WrapBanner({ show, live }: { show: boolean; live: boolean }) {
  if (!show) return null;
  return (
    <FxIn live={live} preset="slideIn">
      <Marker size={72}>That&apos;s a wrap!</Marker>
    </FxIn>
  );
}

function AwardCard({
  award,
  copy,
  players,
  live,
}: {
  award: Award;
  copy: { title: string; detail: string };
  players: PlayerSummary[];
  live: boolean;
}) {
  const names = joinNames(award.playerIds.map((id) => nameOf(players, id)));
  return (
    <FxIn live={live} preset="tapeOn">
      <Card
        variant="M"
        tilt={-1}
        style={{
          padding: "18px 22px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 8,
          minWidth: 220,
        }}
      >
        <Tape left={70} top={-20} width={100} height={32} rotate={-4} />
        <div style={{ display: "flex", gap: 6 }}>
          {award.playerIds.map((id) => (
            <Avatar
              key={id}
              id={avatarOf(players, id)}
              size={48}
              alt={nameOf(players, id)}
            />
          ))}
        </div>
        <Marker size={30}>{copy.title}</Marker>
        <div style={{ fontSize: 28, fontWeight: 700 }}>{names}</div>
        <div style={{ fontSize: 22, color: "var(--opg-ink-secondary)" }}>
          {copy.detail}
        </div>
      </Card>
    </FxIn>
  );
}

function AwardStrip({
  awards,
  awardsShown,
  liveIndex,
  gameId,
  players,
}: {
  awards: readonly Award[];
  awardsShown: number;
  liveIndex: number | null;
  gameId: string;
  players: PlayerSummary[];
}) {
  const cards = awards
    .slice(0, awardsShown)
    .map((award, index) => {
      const copy = awardCopyFor(gameId, award);
      if (copy === null) return null;
      return (
        <AwardCard
          key={award.id}
          award={award}
          copy={copy}
          players={players}
          live={index === liveIndex}
        />
      );
    })
    .filter((card) => card !== null);
  if (cards.length === 0) return null;
  return (
    <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>{cards}</div>
  );
}

/** Small chip per award, title plus names, used in the settled layout's slim strip. */
function AwardChip({
  award,
  copy,
  players,
}: {
  award: Award;
  copy: { title: string; detail: string };
  players: PlayerSummary[];
}) {
  const names = joinNames(award.playerIds.map((id) => nameOf(players, id)));
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 16px",
        background: "var(--opg-card)",
        border: "3px solid var(--opg-ink)",
        borderRadius: "var(--opg-radius-button)",
      }}
    >
      <Marker size={22}>{copy.title}</Marker>
      <span style={{ fontSize: 22, fontWeight: 700 }}>{names}</span>
    </div>
  );
}

/** Settled layout's slim strip: small chips instead of the ceremony's full cards. */
function SlimAwardStrip({
  awards,
  gameId,
  players,
}: {
  awards: readonly Award[];
  gameId: string;
  players: PlayerSummary[];
}) {
  const chips = awards
    .map((award) => {
      const copy = awardCopyFor(gameId, award);
      if (copy === null) return null;
      return (
        <AwardChip key={award.id} award={award} copy={copy} players={players} />
      );
    })
    .filter((chip) => chip !== null);
  if (chips.length === 0) return null;
  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>{chips}</div>
  );
}

/** Compact winner/crown banner for the settled layout: small avatars, a small crown, the line. */
function SettledBanner({
  ranked,
  players,
  crownLine,
}: {
  ranked: RankedPlayer[];
  players: PlayerSummary[];
  crownLine: string | null;
}) {
  const winners = ranked.filter((row) => row.rank === 1);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <div style={{ display: "flex", gap: 6 }}>
        {winners.map((row) => (
          <Avatar
            key={row.id}
            id={avatarOf(players, row.id)}
            size={56}
            alt={nameOf(players, row.id)}
          />
        ))}
      </div>
      <Crown size={48} style={{ transform: "rotate(-8deg)" }} />
      {crownLine ? <Marker size={40}>{crownLine}</Marker> : null}
    </div>
  );
}

function CrownIntro({ stage }: { stage: Stage }) {
  if (!stage.crownIntroReached || stage.crownReached) return null;
  return (
    <div style={{ position: "relative" }}>
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: -20,
          background: "rgba(43,43,43,0.55)",
          borderRadius: 24,
        }}
      />
      <FxIn live={stage.crownIntroLive} preset="fadeIn" style={{ position: "relative" }}>
        <Marker size={64}>And the crown goes to…</Marker>
      </FxIn>
    </div>
  );
}

function RankReveal({
  ranked,
  players,
  rank,
  visible,
  live,
  label,
}: {
  ranked: RankedPlayer[];
  players: PlayerSummary[];
  rank: number;
  visible: boolean;
  live: boolean;
  label: string;
}) {
  const rows = ranked.filter((row) => row.rank === rank);
  if (!visible || rows.length === 0) return null;
  return (
    <FxIn live={live} preset="pop">
      <div style={{ display: "flex", gap: 24 }}>
        {rows.map((row) => (
          <div
            key={row.id}
            style={{ display: "flex", alignItems: "center", gap: 14 }}
          >
            <Avatar id={avatarOf(players, row.id)} size={64} />
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span
                className="opg-marker"
                style={{ fontSize: 24, color: "var(--opg-ink-secondary)" }}
              >
                {label}
              </span>
              <div style={{ fontSize: 32, fontWeight: 700 }}>
                {nameOf(players, row.id)}
              </div>
              <CountUp
                from={0}
                to={row.score}
                live={live}
                style={{ fontSize: 28, fontWeight: 700 }}
              />
            </div>
          </div>
        ))}
      </div>
    </FxIn>
  );
}

function CrownReveal({
  stage,
  ranked,
  players,
  crownLine,
}: {
  stage: Stage;
  ranked: RankedPlayer[];
  players: PlayerSummary[];
  crownLine: string | null;
}) {
  if (!stage.crownReached) return null;
  const winners = ranked.filter((row) => row.rank === 1);
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 12,
        position: "relative",
      }}
    >
      <div style={{ display: "flex", gap: 24 }}>
        {winners.map((row) => (
          <div key={row.id} style={{ position: "relative" }}>
            <FxIn
              live={stage.crownLive}
              preset="slam"
              style={{
                position: "absolute",
                top: -50,
                left: "50%",
                transform: "translateX(-50%)",
              }}
            >
              <Crown size={90} style={{ transform: "rotate(-8deg)" }} />
            </FxIn>
            <Avatar
              id={avatarOf(players, row.id)}
              size={140}
              alt={nameOf(players, row.id)}
            />
          </div>
        ))}
      </div>
      {crownLine ? <Marker size={56}>{crownLine}</Marker> : null}
      <Confetti live={stage.crownLive} surface="tv" />
    </div>
  );
}

function CrownAnnouncer({
  crownReached,
  crownLine,
}: {
  crownReached: boolean;
  crownLine: string | null;
}) {
  // A fuller sentence than the on-screen marker, so the two never collide under an exact text match.
  const text = crownReached && crownLine ? `The crown is decided. ${crownLine}` : "";
  return (
    <output aria-live="polite" style={HIDDEN}>
      {text}
    </output>
  );
}

function NotCompletedView({
  view,
  ranked,
}: {
  view: HostRoomView;
  ranked: RankedPlayer[];
}) {
  const gameName =
    view.games.find((g) => g.id === view.lastResult?.gameId)?.name ??
    "Final scores";
  return (
    <TvPage>
      <TvHeader variant="game" gameName={gameName} roomCode={view.code} />
      <div style={{ flexGrow: 1, display: "flex", flexDirection: "column", gap: 24 }}>
        <Marker size={64}>Game over</Marker>
        <ScoresList ranked={ranked} players={view.players} winners={[]} />
      </div>
      <FinalScoresFooter vip={vipName(view.players, view.vipId)} />
    </TvPage>
  );
}

interface FinaleBodyProps {
  view: HostRoomView;
  ranked: RankedPlayer[];
  winners: readonly PlayerId[];
  crownLine: string | null;
  stage: Stage;
  awards: readonly Award[];
  gameId: string;
}

/** Ceremony layout: awards row, then the crown stage. Never shown once settled. */
function CeremonyLayout({
  view,
  ranked,
  crownLine,
  stage,
  awards,
  gameId,
}: Omit<FinaleBodyProps, "winners">) {
  return (
    <div
      style={{
        flexGrow: 1,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: 32,
      }}
    >
      <WrapBanner show={!stage.crownIntroReached} live={stage.wrapLive} />
      <AwardStrip
        awards={awards}
        awardsShown={stage.awardsShown}
        liveIndex={stage.awardLiveIndex}
        gameId={gameId}
        players={view.players}
      />
      <CrownIntro stage={stage} />
      <RankReveal
        ranked={ranked}
        players={view.players}
        rank={3}
        visible={stage.thirdReached}
        live={stage.thirdLive}
        label="3rd place"
      />
      <RankReveal
        ranked={ranked}
        players={view.players}
        rank={2}
        visible={stage.secondReached}
        live={stage.secondLive}
        label="2nd place"
      />
      <CrownReveal
        stage={stage}
        ranked={ranked}
        players={view.players}
        crownLine={crownLine}
      />
    </div>
  );
}

/** Settled layout: a compact winner/crown banner, a slim award strip, then the ranked list. */
function SettledLayout({
  view,
  ranked,
  winners,
  crownLine,
  stage,
  awards,
  gameId,
}: FinaleBodyProps) {
  return (
    <FxIn
      live={stage.settleLive}
      preset="fadeIn"
      style={{
        flexGrow: 1,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: 20,
      }}
    >
      <SettledBanner ranked={ranked} players={view.players} crownLine={crownLine} />
      <SlimAwardStrip awards={awards} gameId={gameId} players={view.players} />
      <ScoresList ranked={ranked} players={view.players} winners={winners} />
    </FxIn>
  );
}

function FinaleBody(props: FinaleBodyProps) {
  const { stage, crownLine } = props;
  return (
    <>
      {stage.settleReached ? (
        <SettledLayout {...props} />
      ) : (
        <CeremonyLayout {...props} />
      )}
      <CrownAnnouncer crownReached={stage.crownReached} crownLine={crownLine} />
    </>
  );
}

export interface TvFinalScoresProps {
  view: HostRoomView;
  clock?: ServerClock;
}

function awardsOf(result: GameResultSummary | null): readonly Award[] {
  if (result === null) return [];
  return result.awards;
}

function scoresOf(
  result: GameResultSummary | null,
): Readonly<Record<PlayerId, number>> {
  if (result === null) return {};
  return result.scores;
}

function finishedAtOf(result: GameResultSummary | null): number | null {
  // A game that ended early shows "Game over" only, so it has no ceremony to anchor.
  if (result === null || !result.completed) return null;
  return result.finishedAt;
}

function gameNameFor(view: HostRoomView, gameId: string): string {
  const found = view.games.find((g) => g.id === gameId);
  if (found === undefined) return "Final scores";
  return found.name;
}

function playCueOnEnter(
  beat: Beat,
  play: (cue: CueId, options?: CueOptions) => CueHandle,
): void {
  if (beat.cue === undefined) return;
  play(beat.cue, cueOptions(beat.cue));
}

/** Lobby music once the ceremony is over (or never ran); silence while it plays. */
export function finaleMusic(
  result: GameResultSummary | null,
  settleReached: boolean,
): MusicId | null {
  if (result === null || !result.completed || settleReached) return "lobby";
  return null;
}

export function TvFinalScores({ view, clock = FALLBACK_CLOCK }: TvFinalScoresProps) {
  const result = view.lastResult;
  const ranked = rankPlayers(
    scoresOf(result),
    view.players.map((player) => player.id),
  );
  const awards = awardsOf(result);
  const beats = finaleBeats({
    awardCount: awards.length,
    rankedCount: ranked.length,
    crownCue: crownCueId(),
  });
  const moment = useMoment(beats, finishedAtOf(result), clock);
  const play = useCue();
  const stage = stageFromMoment(moment, beats);
  // Quiet while the ceremony plays; the lobby loop comes back once it settles.
  useMusic(finaleMusic(result, stage.settleReached));

  useBeatEntries(beats, moment, (beat) => playCueOnEnter(beat, play));

  if (result === null) return <EmptyFinalScores code={view.code} />;
  if (!result.completed) return <NotCompletedView view={view} ranked={ranked} />;

  const gameName = gameNameFor(view, result.gameId);
  const crownLine = crownCopy(
    result.winnerIds.map((id) => nameOf(view.players, id)),
  );

  return (
    <TvPage>
      <TvHeader
        variant="game"
        gameName={gameName}
        progress="Final scores"
        roomCode={view.code}
      />
      <FinaleBody
        view={view}
        ranked={ranked}
        winners={result.winnerIds}
        crownLine={crownLine}
        stage={stage}
        awards={awards}
        gameId={result.gameId}
      />
      <FinalScoresFooter vip={vipName(view.players, view.vipId)} />
    </TvPage>
  );
}
