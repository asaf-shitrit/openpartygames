// Phone results/crown screen: awards teaser, a personal 3rd/2nd callout, the crown,
// then a settled rank card. Same beats as the TV, anchored on `lastResult.finishedAt`.
import type {
  Award,
  GameResultSummary,
  PlayerId,
  PlayerRoomView,
  PlayerSummary,
} from "@opg/protocol";
import {
  Avatar,
  Confetti,
  Crown,
  Card,
  EyesOnTv,
  Marker,
  PhoneScreen,
  reached,
  StickerBurst,
  useBeatEntries,
  useBuzz,
  useMoment,
} from "@opg/ui";
import type { Beat, HapticName, Moment, ServerClock } from "@opg/ui";
import type { ReactNode, RefObject } from "react";
import { useRef } from "react";
import { format, placeFor, useLocale } from "@opg/i18n";
import type { Dictionary } from "@opg/i18n";
import { awardCopyFor, describableAwards } from "../games";
import {
  crownCopy,
  crownCueId,
  finaleBeats,
  participantIds,
  rankPlayers,
  topRank,
} from "./finale-timeline";
import type { RankedPlayer } from "./finale-timeline";

function findPlayerName(
  view: PlayerRoomView,
  id: PlayerId | null,
  someone: string,
): string {
  if (!id) return someone;
  return view.players.find((player) => player.id === id)?.name ?? someone;
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
  const { t } = useLocale();
  const copy = awardCopyFor(gameId, award, t);
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
        // The burst is anchored on this card (StickerBurst positions itself relative to the
        // nearest positioned ancestor) and clipped to it, so it can't widen the page.
        position: "relative",
        overflow: "hidden",
      }}
    >
      {live ? <StickerBurst live count={8} size={220} /> : null}
      <Marker
        level={1}
        size={26}
        style={{ maxWidth: "100%", overflowWrap: "break-word" }}
      >
        {copy?.title ?? t.results.gotAward}
      </Marker>
      {copy ? (
        <div
          style={{
            fontSize: 18,
            fontWeight: 700,
            maxWidth: "100%",
            overflowWrap: "break-word",
          }}
        >
          {copy.detail}
        </div>
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
      <Marker level={1} size={32}>{label}</Marker>
    </Card>
  );
}

function crownHeadline(
  t: Dictionary,
  amWinner: boolean,
  crownLine: string | null,
): string {
  if (amWinner) return t.results.youWinCrown;
  return crownLine ?? t.results.crownDecided;
}

function finishedRankText(
  t: Dictionary,
  amWinner: boolean,
  rank: number | null,
): string | null {
  if (amWinner || rank === null) return null;
  return format(t.results.finishedPlace, { place: placeFor(t, rank) });
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
  const { t } = useLocale();
  const finishedText = finishedRankText(t, amWinner, rank);
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
        // The reduced-motion sticker burst is anchored and clipped to this card, or its
        // stickers can extend past the phone's width and force the page to scroll sideways.
        position: "relative",
        overflow: "hidden",
      }}
    >
      {amWinner ? <Confetti live={live} surface="phone" /> : null}
      <Crown size={amWinner ? 130 : 60} />
      <Marker
        level={1}
        size={amWinner ? 34 : 26}
        style={{ maxWidth: "100%", overflowWrap: "break-word" }}
      >
        {crownHeadline(t, amWinner, crownLine)}
      </Marker>
      {finishedText === null ? null : (
        <div
          style={{
            fontSize: 18,
            fontWeight: 700,
            maxWidth: "100%",
            overflowWrap: "break-word",
          }}
        >
          {finishedText}
        </div>
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
  const { t } = useLocale();
  if (awards.length === 0) return null;
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {awards.map((award) => {
        const copy = awardCopyFor(gameId, award, t);
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
              // At 200% text an award name is wider than the phone; it breaks rather than
              // hanging off the side, the same as every other long string on this screen.
              maxWidth: "100%",
              overflowWrap: "break-word",
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
  const { t } = useLocale();
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
      <Marker level={1} size={28} style={{ maxWidth: "100%", overflowWrap: "break-word" }}>
        {rank === null
          ? t.results.finalScores
          : format(t.results.finishedPlaceWithScore, {
              place: placeFor(t, rank),
              score: score.toLocaleString("en-US"),
            })}
      </Marker>
      <StickerRow awards={awards} gameId={gameId} />
    </Card>
  );
}

/** "3rd place!" or "2nd place!" when this beat has reached my own rank. */
function rankPlaceCallout(
  t: Dictionary,
  stage: Stage,
  myRank: number | null,
): ReactNode {
  if (stage.secondReached && myRank === 2)
    return <RankCallout label={t.results.secondPlaceBang} />;
  if (stage.thirdReached && myRank === 3)
    return <RankCallout label={t.results.thirdPlaceBang} />;
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

function teaserCallout(t: Dictionary, stage: Stage, sharedScreen: boolean): ReactNode {
  return (
    <EyesOnTv
      // A shared screen gets the kit's own "Eyes on the TV" doodle; without one there is no
      // screen to look at, so the teaser swaps in the room doodle and says what is coming.
      variant={sharedScreen ? "screen" : "room"}
      title={sharedScreen ? undefined : t.results.almostTime}
      detail={t.results.awardsComing}
      tempo={stage.crownIntroReached ? "fast" : "slow"}
    />
  );
}

/**
 * The seat a ranked row belongs to. Every rank has one, because `rankPlayers` ranks exactly
 * the roster ids that carry a score — but it is still a lookup, and a row with no name and no
 * doodle is not a row worth drawing, so the case the types insist on drops out of the list
 * rather than being filled in with a stand-in player nobody in the room would recognise.
 */
function seatFor(
  players: readonly PlayerSummary[],
  id: PlayerId,
): PlayerSummary | null {
  return players.find((candidate) => candidate.id === id) ?? null;
}

/**
 * The crown's red, for the one rank that won. Colour is never the only signal here: first
 * place is the row at the top of a numbered list, and the card above it has already said
 * the winner's name.
 */
function rankInkColor(rank: number): string {
  return rank === 1 ? "var(--opg-marker)" : "var(--opg-ink)";
}

function StandingsRow({
  row,
  players,
}: {
  row: RankedPlayer;
  players: readonly PlayerSummary[];
}) {
  const player = seatFor(players, row.id);
  if (player === null) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
      <div
        className="opg-marker"
        style={{
          width: 26,
          fontSize: 20,
          lineHeight: 1,
          flexShrink: 0,
          color: rankInkColor(row.rank),
        }}
      >
        {row.rank}
      </div>
      <Avatar id={player.avatar} size={32} />
      <div
        style={{
          flexGrow: 1,
          minWidth: 0,
          fontSize: 16,
          fontWeight: 700,
          // Wrapping rather than an ellipsis, the same as every other roster in the app. The
          // row is a fixed rank, a fixed doodle, a fixed score and whatever is left over; at
          // 200% text what is left over is a few pixels, and a name clipped to nothing tells
          // the reader less than a name on two lines.
          overflowWrap: "anywhere",
        }}
      >
        {player.name}
      </div>
      <div style={{ flexShrink: 0, fontSize: 16, fontWeight: 700 }}>
        {row.score.toLocaleString("en-US")}
      </div>
    </div>
  );
}

/**
 * The scoreboard the TV would otherwise carry. With no shared screen there is nowhere else
 * standings can land, so the settled card grows this underneath the reader's own place —
 * every ranked player, then who the room is waiting on to pick the next game.
 */
function Standings({
  t,
  ranked,
  players,
  vipName,
  amVip,
}: {
  t: Dictionary;
  ranked: RankedPlayer[];
  players: readonly PlayerSummary[];
  vipName: string | null;
  amVip: boolean;
}) {
  return (
    <Card
      variant="M"
      tilt={1}
      style={{
        padding: "18px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      {/* Always paired with a level-1 card above it (settled or early-end). */}
      <Marker level={2} size={20}>{t.results.finalScores}</Marker>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {ranked.map((row) => (
          <StandingsRow key={row.id} row={row} players={players} />
        ))}
      </div>
      {!amVip && vipName !== null ? (
        // 16px, not 14: this is the only thing on the screen telling a non-VIP why nothing is
        // happening, and the project's phone floor is 16px whether a line is incidental or not.
        <div style={{ fontSize: 16, color: "var(--opg-ink-secondary)" }}>
          {format(t.results.waitingOnVip, { vip: vipName })}
        </div>
      ) : null}
    </Card>
  );
}

/**
 * Settled beat: my own card, plus — with no shared screen to carry them — the standings a
 * TV would otherwise show. Its own function so `bodyFor`'s branching stays simple enough for
 * the CRAP gate; the shared/no-shared-screen split gets its own tests here instead.
 */
function SettledSection({
  t,
  view,
  me,
  myRank,
  ranked,
  awards,
  gameId,
}: {
  t: Dictionary;
  view: PlayerRoomView;
  me: PlayerId;
  myRank: number | null;
  ranked: RankedPlayer[];
  awards: readonly Award[];
  gameId: string;
}): ReactNode {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 16,
        flexGrow: 1,
        minWidth: 0,
      }}
    >
      <SettledCard
        rank={myRank}
        score={myScoreIn(ranked, me)}
        awards={myAwards(awards, me)}
        gameId={gameId}
      />
      {view.sharedScreen ? null : (
        <Standings
          t={t}
          ranked={ranked}
          players={view.players}
          vipName={
            view.vipId ? findPlayerName(view, view.vipId, t.common.someone) : null
          }
          amVip={me === view.vipId}
        />
      )}
    </div>
  );
}

/** Before the crown: my own rank moment, then my own award, then the teaser. */
function preCrownBody(args: {
  t: Dictionary;
  stage: Stage;
  myRank: number | null;
  awards: readonly Award[];
  gameId: string;
  sharedScreen: boolean;
}): ReactNode {
  const { t, stage, myRank, awards, gameId, sharedScreen } = args;
  return (
    rankPlaceCallout(t, stage, myRank) ??
    myAwardCallout(stage, awards, gameId) ??
    teaserCallout(t, stage, sharedScreen)
  );
}

function bodyFor(args: {
  t: Dictionary;
  view: PlayerRoomView;
  me: PlayerId;
  stage: Stage;
  ranked: RankedPlayer[];
  awards: readonly Award[];
  crownLine: string | null;
  gameId: string;
}): ReactNode {
  const { t, view, me, stage, ranked, awards, crownLine, gameId } = args;
  const myRank = myRankIn(ranked, me);

  if (stage.settleReached) {
    return (
      <SettledSection
        t={t}
        view={view}
        me={me}
        myRank={myRank}
        ranked={ranked}
        awards={awards}
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
  return preCrownBody({
    t,
    stage,
    myRank,
    awards,
    gameId,
    sharedScreen: view.sharedScreen,
  });
}

function GameOverCard({ t, score }: { t: Dictionary; score: number }) {
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
      <Marker level={1} size={30}>{t.results.gameOver}</Marker>
      <div style={{ fontSize: 20, fontWeight: 700 }}>
        {format(t.results.points, { score: score.toLocaleString("en-US") })}
      </div>
    </Card>
  );
}

/**
 * The headline for a game the VIP called off early: named for whoever ended it, in the second
 * person when that was the reader themselves — third person always reads oddly about your own
 * action ("Priya ended the game early" when Priya is the one reading it).
 */
function earlyEndHeadline(t: Dictionary, view: PlayerRoomView, me: PlayerId): string {
  if (me === view.vipId) return t.results.youEndedGameEarly;
  const vipName = findPlayerName(view, view.vipId, t.common.someone);
  return format(t.results.gameEndedEarly, { vip: vipName });
}

/**
 * The card for a game the VIP ended deliberately: no rank, no crown (there is no winner to
 * name), just the reader's own score under a headline that says why the game stopped short.
 */
function EarlyEndCard({
  t,
  view,
  me,
  score,
}: {
  t: Dictionary;
  view: PlayerRoomView;
  me: PlayerId;
  score: number;
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
        gap: 12,
        textAlign: "center",
      }}
    >
      <Marker level={1} size={30} style={{ maxWidth: "100%", overflowWrap: "break-word" }}>
        {earlyEndHeadline(t, view, me)}
      </Marker>
      <div style={{ fontSize: 20, fontWeight: 700 }}>
        {format(t.results.points, { score: score.toLocaleString("en-US") })}
      </div>
    </Card>
  );
}

/**
 * The whole early-end screen: the reader's own card, plus — with no shared screen to carry
 * them — the same standings table the settled beat uses. No crown, no awards: the game did not
 * finish, so nothing here should look like it did.
 */
function EarlyEndSection({
  t,
  view,
  me,
  ranked,
}: {
  t: Dictionary;
  view: PlayerRoomView;
  me: PlayerId;
  ranked: RankedPlayer[];
}): ReactNode {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 16,
        flexGrow: 1,
        minWidth: 0,
      }}
    >
      <EarlyEndCard t={t} view={view} me={me} score={myScoreIn(ranked, me)} />
      {view.sharedScreen ? null : (
        <Standings
          t={t}
          ranked={ranked}
          players={view.players}
          vipName={
            view.vipId ? findPlayerName(view, view.vipId, t.common.someone) : null
          }
          amVip={me === view.vipId}
        />
      )}
    </div>
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

interface ResultContentArgs {
  t: Dictionary;
  view: PlayerRoomView;
  me: PlayerId;
  result: GameResultSummary | null;
  stage: Stage;
  ranked: RankedPlayer[];
  awards: readonly Award[];
  cardRef: RefObject<HTMLDivElement | null>;
}

/** The card body: game-over, or the beat the ceremony has reached, ranked by `stage`. */
function ResultContent(args: ResultContentArgs): ReactNode {
  const { t, view, me, result, stage, ranked, awards, cardRef } = args;
  if (result === null) return <GameOverCard t={t} score={0} />;
  if (!completedOf(result))
    return (
      <div style={{ display: "flex", flexGrow: 1, minWidth: 0 }}>
        <EarlyEndSection t={t} view={view} me={me} ranked={ranked} />
      </div>
    );

  const crownLine = crownCopy(
    t,
    (result.winnerIds ?? []).map((id) =>
      findPlayerName(view, id, t.common.someone),
    ),
  );

  return (
    // `minWidth: 0` because this is a flex row, and a flex item's `min-width: auto` refuses to
    // shrink below the widest word inside it. At 200% text that floor is wider than the phone,
    // and the whole settled column — card, standings, waiting line — would slide off the side.
    <div ref={cardRef} style={{ display: "flex", flexGrow: 1, minWidth: 0 }}>
      {bodyFor({
        t,
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

export interface PhoneResultsProps {
  view: PlayerRoomView;
  clock: ServerClock;
  /**
   * An action that belongs to this screen but not to the ceremony — today only the VIP's way
   * on to the next round. It is a slot rather than a sibling because this column is a
   * `PhoneScreen fit`: a full `100dvh` box, so anything rendered *beside* it has nowhere to
   * go but on top of it, and a bar floating over the bottom of the column covered the last
   * standings row in a room with no TV. Rendered as the column's last child, it takes its own
   * room in the flow and the standings end above it.
   *
   * So whatever is passed has to lay out in flow: an element that positions itself `fixed`
   * reserves no space and puts the overlap straight back.
   */
  footer?: ReactNode;
}

export function PhoneResults({ view, clock, footer }: PhoneResultsProps) {
  const { t } = useLocale();
  const result = view.lastResult;
  const me = view.you;
  const scores = resultScores(result);
  const ranked = rankPlayers(
    scores,
    participantIds(
      scores,
      view.players.map((player) => player.id),
    ),
  );
  const awards = resultAwards(result);
  const beats = finaleBeats({
    // Matches the TV's count, so both devices stage the same ceremony.
    awardCount: describableAwards(result?.gameId ?? "", awards, t).length,
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

  return (
    <PhoneScreen fit>
      <ResultContent
        t={t}
        view={view}
        me={me}
        result={result}
        stage={stage}
        ranked={ranked}
        awards={awards}
        cardRef={cardRef}
      />
      {footer}
    </PhoneScreen>
  );
}
