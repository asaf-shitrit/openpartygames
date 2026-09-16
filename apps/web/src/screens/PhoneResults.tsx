// Phone results/crown screen: awards teaser, a personal 3rd/2nd callout, the crown,
// then a settled rank card. Same beats as the TV, anchored on `lastResult.finishedAt`.
import type {
  Award,
  GameResultSummary,
  PlayerId,
  PlayerRoomView,
} from "@opg/protocol";
import {
  Confetti,
  Crown,
  Card,
  EyesOnTv,
  Marker,
  reached,
  StickerBurst,
  useBeatEntries,
  useBuzz,
  useMoment,
} from "@opg/ui";
import type { Beat, HapticName, Moment, ServerClock } from "@opg/ui";
import type { ReactNode } from "react";
import { useRef } from "react";
import { awardCopyFor, describableAwards } from "../games";
import {
  crownCopy,
  crownCueId,
  finaleBeats,
  ordinal,
  rankPlayers,
  topRank,
} from "./finale-timeline";
import type { RankedPlayer } from "./finale-timeline";

function findPlayerName(view: PlayerRoomView, id: PlayerId | null): string {
  if (!id) return "Someone";
  return view.players.find((player) => player.id === id)?.name ?? "Someone";
}

function myRankIn(ranked: RankedPlayer[], me: PlayerId): number | null {
  return ranked.find((row) => row.id === me)?.rank ?? null;
}

function myScoreIn(ranked: RankedPlayer[], me: PlayerId): number {
  return ranked.find((row) => row.id === me)?.score ?? 0;
}

function myAwards(awards: readonly Award[], me: PlayerId): Award[] {
  return awards.filter((award) => award.playerIds.includes(me));
}

interface Stage {
  crownIntroReached: boolean;
  thirdReached: boolean;
  secondReached: boolean;
  crownReached: boolean;
  crownLive: boolean;
  settleReached: boolean;
  latestMyAwardIndex: number | null;
  latestMyAwardLive: boolean;
}

/** Index of the award this beat id names, or null when the beat isn't an award beat. */
function awardBeatIndex(id: string): number | null {
  if (!id.startsWith("award-")) return null;
  const index = Number(id.slice("award-".length));
  return Number.isNaN(index) ? null : index;
}

interface AwardHit {
  index: number | null;
  live: boolean;
}

function latestAwardFor(
  beats: readonly Beat[],
  moment: Moment,
  awards: readonly Award[],
  me: PlayerId,
): AwardHit {
  let index: number | null = null;
  for (let i = 0; i <= moment.index; i += 1) {
    const beat = beats[i];
    if (beat === undefined) continue;
    const awardIndex = awardBeatIndex(beat.id);
    if (awardIndex === null) continue;
    if (awards[awardIndex]?.playerIds.includes(me)) index = awardIndex;
  }
  const live = moment.live && moment.beatId === `award-${index}`;
  return { index, live };
}

function stageFromMoment(
  moment: Moment,
  beats: readonly Beat[],
  awards: readonly Award[],
  me: PlayerId,
): Stage {
  const latest = latestAwardFor(beats, moment, awards, me);
  return {
    crownIntroReached: reached(moment, beats, "crown-intro"),
    thirdReached: reached(moment, beats, "third"),
    secondReached: reached(moment, beats, "second"),
    crownReached: reached(moment, beats, "crown"),
    crownLive: moment.live && moment.beatId === "crown",
    settleReached: reached(moment, beats, "settle"),
    latestMyAwardIndex: latest.index,
    latestMyAwardLive: latest.live,
  };
}

function AwardCallout({
  award,
  live,
  gameId,
}: {
  award: Award;
  live: boolean;
  gameId: string;
}) {
  const copy = awardCopyFor(gameId, award);
  return (
    <Card
      variant="L"
      tilt={-1}
      style={{
        flexGrow: 1,
        padding: "28px 22px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        textAlign: "center",
      }}
    >
      {live ? <StickerBurst live count={8} size={220} /> : null}
      <Marker size={26}>{copy?.title ?? "You got an award!"}</Marker>
      {copy ? (
        <div style={{ fontSize: 18, fontWeight: 700 }}>{copy.detail}</div>
      ) : null}
    </Card>
  );
}

function RankCallout({ label }: { label: string }) {
  return (
    <Card
      variant="L"
      tilt={-1}
      style={{
        flexGrow: 1,
        padding: "28px 22px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Marker size={32}>{label}</Marker>
    </Card>
  );
}

function crownHeadline(amWinner: boolean, crownLine: string | null): string {
  if (amWinner) return "You win the crown!";
  return crownLine ?? "The crown is decided";
}

function finishedRankText(
  amWinner: boolean,
  rank: number | null,
): string | null {
  if (amWinner || rank === null) return null;
  return `You finished ${ordinal(rank)}`;
}

function CrownCallout({
  amWinner,
  live,
  crownLine,
  rank,
}: {
  amWinner: boolean;
  live: boolean;
  crownLine: string | null;
  rank: number | null;
}) {
  const finishedText = finishedRankText(amWinner, rank);
  return (
    <Card
      variant="L"
      tilt={-1}
      style={{
        flexGrow: 1,
        padding: "28px 22px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 14,
        textAlign: "center",
        position: "relative",
      }}
    >
      {amWinner ? <Confetti live={live} surface="phone" /> : null}
      <Crown size={amWinner ? 130 : 60} />
      <Marker size={amWinner ? 34 : 26}>
        {crownHeadline(amWinner, crownLine)}
      </Marker>
      {finishedText === null ? null : (
        <div style={{ fontSize: 18, fontWeight: 700 }}>{finishedText}</div>
      )}
    </Card>
  );
}

function StickerRow({
  awards,
  gameId,
}: {
  awards: readonly Award[];
  gameId: string;
}) {
  if (awards.length === 0) return null;
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {awards.map((award) => {
        const copy = awardCopyFor(gameId, award);
        if (copy === null) return null;
        return (
          <div
            key={award.id}
            className="opg-marker"
            style={{
              fontSize: 16,
              padding: "6px 12px",
              border: "3px solid var(--opg-ink)",
              borderRadius: "var(--opg-radius-button)",
              color: "var(--opg-marker)",
            }}
          >
            {copy.title}
          </div>
        );
      })}
    </div>
  );
}

function SettledCard({
  rank,
  score,
  awards,
  gameId,
}: {
  rank: number | null;
  score: number;
  awards: Award[];
  gameId: string;
}) {
  return (
    <Card
      variant="L"
      tilt={-1}
      style={{
        flexGrow: 1,
        padding: "28px 22px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 14,
        textAlign: "center",
      }}
    >
      <Marker size={28}>
        {rank === null
          ? "Final scores"
          : `You finished ${ordinal(rank)} with ${score.toLocaleString("en-US")}`}
      </Marker>
      <StickerRow awards={awards} gameId={gameId} />
    </Card>
  );
}

/** "3rd place!" or "2nd place!" when this beat has reached my own rank. */
function rankPlaceCallout(stage: Stage, myRank: number | null): ReactNode {
  if (stage.secondReached && myRank === 2)
    return <RankCallout label="2nd place!" />;
  if (stage.thirdReached && myRank === 3)
    return <RankCallout label="3rd place!" />;
  return null;
}

function myAwardCallout(
  stage: Stage,
  awards: readonly Award[],
  gameId: string,
): ReactNode {
  if (stage.latestMyAwardIndex === null) return null;
  const award = awards[stage.latestMyAwardIndex];
  if (award === undefined) return null;
  return (
    <AwardCallout
      award={award}
      live={stage.latestMyAwardLive}
      gameId={gameId}
    />
  );
}

function teaserCallout(stage: Stage): ReactNode {
  return (
    <EyesOnTv
      title="Eyes on the TV"
      detail="Awards are coming…"
      tempo={stage.crownIntroReached ? "fast" : "slow"}
    />
  );
}

function bodyFor(args: {
  view: PlayerRoomView;
  me: PlayerId;
  stage: Stage;
  ranked: RankedPlayer[];
  awards: readonly Award[];
  crownLine: string | null;
  gameId: string;
}): ReactNode {
  const { view, me, stage, ranked, awards, crownLine, gameId } = args;
  const myRank = myRankIn(ranked, me);

  if (stage.settleReached) {
    return (
      <SettledCard
        rank={myRank}
        score={myScoreIn(ranked, me)}
        awards={myAwards(awards, me)}
        gameId={gameId}
      />
    );
  }
  if (stage.crownReached) {
    return (
      <CrownCallout
        amWinner={isWinner(view.lastResult, me)}
        live={stage.crownLive}
        crownLine={crownLine}
        rank={myRank}
      />
    );
  }
  return (
    rankPlaceCallout(stage, myRank) ??
    myAwardCallout(stage, awards, gameId) ??
    teaserCallout(stage)
  );
}

function GameOverCard({ score }: { score: number }) {
  return (
    <Card
      variant="L"
      tilt={-1}
      style={{
        flexGrow: 1,
        padding: "28px 22px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        textAlign: "center",
      }}
    >
      <Marker size={30}>Game over</Marker>
      <div style={{ fontSize: 20, fontWeight: 700 }}>
        {score.toLocaleString("en-US")} points
      </div>
    </Card>
  );
}

interface BeatContext {
  awards: readonly Award[];
  me: PlayerId;
  myRank: number | null;
  amWinner: boolean;
}

function myAwardHaptic(
  ctx: BeatContext,
  awardIndex: number,
): HapticName | null {
  return ctx.awards[awardIndex]?.playerIds.includes(ctx.me) ? "award" : null;
}

function myRankHaptic(beat: Beat, ctx: BeatContext): HapticName | null {
  if (beat.id === "third") return ctx.myRank === 3 ? "good" : null;
  if (beat.id === "second") return ctx.myRank === 2 ? "good" : null;
  if (beat.id === "crown") return ctx.amWinner ? "crown" : null;
  return null;
}

/** Which haptic (if any) this beat means for me, or null when it's not mine to buzz. */
function hapticForBeat(beat: Beat, ctx: BeatContext): HapticName | null {
  const awardIndex = awardBeatIndex(beat.id);
  if (awardIndex !== null) return myAwardHaptic(ctx, awardIndex);
  return myRankHaptic(beat, ctx);
}

function handleBeatEntry(
  beat: Beat,
  ctx: BeatContext,
  buzz: (name: HapticName, el?: HTMLElement | null) => void,
  el: HTMLElement | null,
): void {
  const haptic = hapticForBeat(beat, ctx);
  if (haptic !== null) buzz(haptic, el);
}

function resultAwards(result: GameResultSummary | null): readonly Award[] {
  if (result === null) return [];
  return result.awards ?? [];
}

/** Old or skewed payloads can lack `completed`; the crown list is the signal they carried. */
function completedOf(result: GameResultSummary): boolean {
  return result.completed ?? result.winnerIds.length > 0;
}

function resultScores(
  result: GameResultSummary | null,
): Readonly<Record<PlayerId, number>> {
  if (result === null) return {};
  return result.scores ?? {};
}

function resultFinishedAt(result: GameResultSummary | null): number | null {
  // A game that ended early shows a plain game-over card, so nothing is staged for it.
  if (result === null || !completedOf(result)) return null;
  return result.finishedAt ?? 0;
}

function isWinner(result: GameResultSummary | null, me: PlayerId): boolean {
  if (result === null) return false;
  return (result.winnerIds ?? []).includes(me);
}

export interface PhoneResultsProps {
  view: PlayerRoomView;
  clock: ServerClock;
}

export function PhoneResults({ view, clock }: PhoneResultsProps) {
  const result = view.lastResult;
  const me = view.you;
  const ranked = rankPlayers(
    resultScores(result),
    view.players.map((player) => player.id),
  );
  const awards = resultAwards(result);
  const beats = finaleBeats({
    // Matches the TV's count, so both devices stage the same ceremony.
    awardCount: describableAwards(result?.gameId ?? "", awards).length,
    rankedCount: topRank(ranked),
    crownCue: crownCueId(),
  });
  const moment = useMoment(beats, resultFinishedAt(result), clock);
  const buzz = useBuzz();
  const cardRef = useRef<HTMLDivElement>(null);
  const stage = stageFromMoment(moment, beats, awards, me);
  const myRank = myRankIn(ranked, me);
  const amWinner = isWinner(result, me);

  useBeatEntries(beats, moment, (beat) => {
    handleBeatEntry(
      beat,
      { awards, me, myRank, amWinner },
      buzz,
      cardRef.current,
    );
  });

  if (result === null) return <GameOverCard score={0} />;
  if (!completedOf(result)) return <GameOverCard score={myScoreIn(ranked, me)} />;

  const crownLine = crownCopy(
    (result.winnerIds ?? []).map((id) => findPlayerName(view, id)),
  );

  return (
    <div ref={cardRef} style={{ display: "flex", flexGrow: 1 }}>
      {bodyFor({
        view,
        me,
        stage,
        ranked,
        awards,
        crownLine,
        gameId: result.gameId,
      })}
    </div>
  );
}
