// TV reveal: the 12-second, beat-by-beat Most Likely To unmasking. Everything is derived from
// the moment, so a device that reloads mid-reveal lands on the settled state with no replay.
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, RefObject } from "react";
import type { PlayerId, PlayerSummary } from "@opg/protocol";
import type {
  Beat,
  CueHandle,
  CueId,
  CueOptions,
  Moment,
  ServerClock,
  SpotlightTarget,
} from "@opg/ui";
import {
  anchorAt,
  Avatar,
  Card,
  FxIn,
  reached,
  SlamStamp,
  Spotlight,
  StickyNote,
  TallyScratch,
  useBeatEntries,
  useCue,
  useMoment,
} from "@opg/ui";
import type { MltHostView, MltOutcome, MltReveal } from "../state";
import { REVEAL_MS } from "../state";
import { avatarOf, nameOf, PromptLine } from "./common";
import {
  hostRevealBeats,
  marksDrawn,
  marksForTarget,
  scratchOrder,
  spotlightIds,
} from "./reveal-timeline";
import type { ScratchMark } from "./reveal-timeline";

const TILTS = [-1.5, 1, -1, 1.5, -1, 2];
const ROOT: CSSProperties = {
  position: "relative",
  flexGrow: 1,
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  gap: 24,
};
const CAPTION: CSSProperties = {
  fontSize: 40,
  fontWeight: 700,
  textAlign: "center",
};
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
const TILE_SLOT: CSSProperties = {
  flex: "1 1 0",
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
};
const TILE: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 10,
  padding: "22px 12px 20px",
};

const FALLBACK_REVEAL: MltReveal = {
  playerIds: [],
  tally: {},
  outcome: { kind: "no-votes" },
  matchedIds: [],
};

function avatarLabel(players: PlayerSummary[], id: PlayerId): string {
  return `${nameOf(players, id)}'s avatar`;
}

interface RevealPlan {
  order: ScratchMark[];
  beats: Beat[];
  spotlightTargetIds: PlayerId[];
}

function revealPlan(reveal: MltReveal): RevealPlan {
  const order = scratchOrder(reveal.tally, reveal.playerIds);
  return {
    order,
    beats: hostRevealBeats(reveal.outcome, order.length),
    spotlightTargetIds: spotlightIds(reveal.outcome),
  };
}

/** Circle centers and radii of the spotlighted tiles, in the positioned root's px space. */
export function measureTargets(
  root: HTMLElement | null,
  ids: readonly PlayerId[],
): SpotlightTarget[] {
  if (root === null) return [];
  const targets: SpotlightTarget[] = [];
  for (const id of ids) {
    const el = root.querySelector(`[data-tile-id="${id}"]`);
    if (!(el instanceof HTMLElement)) continue;
    targets.push({
      id,
      x: el.offsetLeft + el.offsetWidth / 2,
      y: el.offsetTop + el.offsetHeight / 2,
      radius: Math.max(el.offsetWidth, el.offsetHeight) / 2 + 24,
    });
  }
  return targets;
}

function useSpotlightTargets(
  rootRef: RefObject<HTMLElement | null>,
  ids: readonly PlayerId[],
  on: boolean,
): SpotlightTarget[] {
  const [targets, setTargets] = useState<SpotlightTarget[]>([]);
  useLayoutEffect(() => {
    if (!on) return undefined;
    setTargets(measureTargets(rootRef.current, ids));
    return undefined;
  }, [on, ids, rootRef]);
  return targets;
}

function cueOptions(cue: CueId): CueOptions | undefined {
  if (cue === "drumroll") return { durationMs: 2500 };
  return undefined;
}

/** Plays a beat's cue, if it has one. Exported so its branches are tested directly. */
export function fireCue(
  play: (cue: CueId, options?: CueOptions) => CueHandle,
  beat: Beat,
): void {
  if (beat.cue === undefined) return;
  play(beat.cue, cueOptions(beat.cue));
}

interface Stage {
  introLive: boolean;
  suspenseReached: boolean;
  verdictReached: boolean;
  verdictLive: boolean;
  pointsReached: boolean;
  nextReached: boolean;
  nextLive: boolean;
}

function isLive(moment: Moment, id: string): boolean {
  return moment.live && moment.beatId === id;
}

function stageFromMoment(moment: Moment, beats: readonly Beat[]): Stage {
  return {
    introLive: isLive(moment, "intro"),
    suspenseReached: reached(moment, beats, "suspense"),
    verdictReached: reached(moment, beats, "verdict"),
    verdictLive: isLive(moment, "verdict"),
    pointsReached: reached(moment, beats, "points"),
    nextReached: reached(moment, beats, "next"),
    nextLive: isLive(moment, "next"),
  };
}

/** Joins names in prose: "A", "A and B", "A, B and C". */
export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  const last = names[names.length - 1];
  return `${names.slice(0, -1).join(", ")} and ${last}`;
}

/** The stamp word for each outcome. */
export function verdictStampText(outcome: MltOutcome): string {
  if (outcome.kind === "picked") return "Most likely!";
  if (outcome.kind === "tie") return "It's a tie!";
  if (outcome.kind === "split") return "No clear pick";
  return "No votes?!";
}

/** Who must explain themselves, or the stamp text itself when nobody is on the hook. */
export function explainLine(
  outcome: MltOutcome,
  players: PlayerSummary[],
): string {
  if (outcome.kind === "picked") {
    return `Explain yourself, ${nameOf(players, outcome.pickedId)}!`;
  }
  if (outcome.kind === "tie") {
    const names = outcome.tiedIds.map((id) => nameOf(players, id));
    return `Explain yourselves, ${joinNames(names)}!`;
  }
  return verdictStampText(outcome);
}

/** The polite aria-live sentence read out at the verdict beat. */
export function verdictSentence(
  outcome: MltOutcome,
  players: PlayerSummary[],
): string {
  const stamp = verdictStampText(outcome);
  const caption = explainLine(outcome, players);
  return stamp === caption ? stamp : `${stamp} ${caption}`;
}

/** The 9.0s points line: who read the room, or a miss line when nobody matched. */
export function pointsLine(
  matchedIds: readonly PlayerId[],
  players: PlayerSummary[],
): string {
  if (matchedIds.length === 0) return "Nobody read the room this time";
  const names = matchedIds.map((id) => nameOf(players, id));
  if (names.length === 1) return `${names[0]} read the room: +500`;
  return `${joinNames(names)} read the room: +500 each`;
}

/** The 10.5s sticky note: the final round points ahead to scores instead of the next prompt. */
export function nextNoteText(roundNumber: number, roundCount: number): string {
  return roundNumber === roundCount
    ? "Final scores next"
    : "Next prompt coming up";
}

interface TileStamp {
  id: PlayerId;
  text: string;
  live: boolean;
}

interface VerdictView {
  tileStamp: TileStamp | null;
  centeredStamp: string | null;
  caption: string | null;
}

interface VerdictArgs {
  outcome: MltOutcome;
  verdictReached: boolean;
  verdictLive: boolean;
  players: PlayerSummary[];
}

function pickedVerdictView(args: VerdictArgs, pickedId: PlayerId): VerdictView {
  return {
    tileStamp: {
      id: pickedId,
      text: verdictStampText(args.outcome),
      live: args.verdictLive,
    },
    centeredStamp: null,
    caption: explainLine(args.outcome, args.players),
  };
}

function otherVerdictView(args: VerdictArgs): VerdictView {
  const stamp = verdictStampText(args.outcome);
  const caption = explainLine(args.outcome, args.players);
  return {
    tileStamp: null,
    centeredStamp: stamp,
    caption: caption === stamp ? null : caption,
  };
}

function verdictView(args: VerdictArgs): VerdictView {
  if (!args.verdictReached) {
    return { tileStamp: null, centeredStamp: null, caption: null };
  }
  if (args.outcome.kind === "picked") {
    return pickedVerdictView(args, args.outcome.pickedId);
  }
  return otherVerdictView(args);
}

function VoterAvatar({
  players,
  id,
  live,
}: {
  players: PlayerSummary[];
  id: PlayerId;
  live: boolean;
}) {
  return (
    <FxIn live={live} preset="pop" style={{ display: "inline-flex" }}>
      <Avatar id={avatarOf(players, id)} size={40} alt={avatarLabel(players, id)} />
    </FxIn>
  );
}

function voteLabel(shown: number): string {
  return `${shown} ${shown === 1 ? "vote" : "votes"}`;
}

function TallyRow({ count, shown }: { count: number; shown: number }) {
  return (
    <div style={{ height: 60, display: "flex", alignItems: "center", gap: 12 }}>
      <TallyScratch count={count} drawn={shown} size={50} />
      <div style={{ fontSize: 36, fontWeight: 700, lineHeight: 1 }}>
        {voteLabel(shown)}
      </div>
    </div>
  );
}

function VoterRow({
  voters,
  shown,
  live,
  players,
}: {
  voters: PlayerId[];
  shown: number;
  live: boolean;
  players: PlayerSummary[];
}) {
  return (
    <div style={{ height: 44, display: "flex", alignItems: "center", gap: 6 }}>
      {voters.slice(0, Math.min(shown, 4)).map((voterId) => (
        <VoterAvatar key={voterId} players={players} id={voterId} live={live} />
      ))}
      {shown > 4 ? (
        <div style={{ fontSize: 28, fontWeight: 700 }}>+{shown - 4}</div>
      ) : null}
    </div>
  );
}

const LONG_STAMP_TEXT_LENGTH = 10;
const SHORT_STAMP_SIZE = 52;
const LONG_STAMP_SIZE = 40;

function stampSizeFor(text: string): number {
  return text.length > LONG_STAMP_TEXT_LENGTH ? LONG_STAMP_SIZE : SHORT_STAMP_SIZE;
}

function TileStampBadge({
  stamp,
  shakeRef,
}: {
  stamp: TileStamp;
  shakeRef: RefObject<HTMLElement | null>;
}) {
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: -38,
        display: "flex",
        justifyContent: "center",
        whiteSpace: "nowrap",
      }}
    >
      <SlamStamp
        live={stamp.live}
        shake="big"
        shakeRef={shakeRef}
        size={stampSizeFor(stamp.text)}
      >
        {stamp.text}
      </SlamStamp>
    </div>
  );
}

function tileStyle(highlighted: boolean): CSSProperties {
  if (!highlighted) return TILE;
  return { ...TILE, border: "5px solid var(--opg-ink)" };
}

interface RevealTileProps {
  id: PlayerId;
  index: number;
  voters: PlayerId[];
  order: readonly ScratchMark[];
  drawn: number;
  compact: boolean;
  highlighted: boolean;
  stamp: TileStamp | null;
  live: boolean;
  players: PlayerSummary[];
  shakeRef: RefObject<HTMLElement | null>;
}

function RevealTile(props: RevealTileProps) {
  const { id, index, voters, order, drawn, compact, live, players } = props;
  const shown = marksForTarget(order, id, drawn);
  return (
    <div data-tile-id={id} style={TILE_SLOT}>
      <Card
        variant={index % 2 === 0 ? "M" : "Malt"}
        tilt={TILTS[index % TILTS.length]}
        background={props.highlighted ? "var(--opg-highlight-soft)" : undefined}
        style={tileStyle(props.highlighted)}
      >
        <Avatar
          id={avatarOf(players, id)}
          size={compact ? 88 : 110}
          alt={avatarLabel(players, id)}
        />
        <div style={{ fontSize: 36, fontWeight: 700, lineHeight: 1.1 }}>
          {nameOf(players, id)}
        </div>
        <TallyRow count={voters.length} shown={shown} />
        <VoterRow voters={voters} shown={shown} live={live} players={players} />
        {props.stamp === null ? null : (
          <TileStampBadge stamp={props.stamp} shakeRef={props.shakeRef} />
        )}
      </Card>
    </div>
  );
}

interface RevealTileRowProps {
  reveal: MltReveal;
  plan: RevealPlan;
  drawn: number;
  live: boolean;
  players: PlayerSummary[];
  highlightedIds: readonly PlayerId[];
  verdict: VerdictView;
  shakeRef: RefObject<HTMLElement | null>;
}

function RevealTileRow(props: RevealTileRowProps) {
  const { reveal, plan, players, verdict, shakeRef } = props;
  const compact = reveal.playerIds.length > 6;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "space-between",
        gap: 24,
      }}
    >
      {reveal.playerIds.map((id, index) => (
        <RevealTile
          key={id}
          id={id}
          index={index}
          voters={reveal.tally[id] ?? []}
          order={plan.order}
          drawn={props.drawn}
          compact={compact}
          highlighted={props.highlightedIds.includes(id)}
          stamp={verdict.tileStamp?.id === id ? verdict.tileStamp : null}
          live={props.live}
          players={players}
          shakeRef={shakeRef}
        />
      ))}
    </div>
  );
}

const VERDICT_RESERVED_HEIGHT = 96;
const CAPTION_RESERVED_HEIGHT = 60;
const POINTS_RESERVED_HEIGHT = 64;
const NOTE_RESERVED_HEIGHT = 92;

function CenteredVerdict({
  text,
  live,
  shakeRef,
}: {
  text: string | null;
  live: boolean;
  shakeRef: RefObject<HTMLElement | null>;
}) {
  return (
    <div
      data-testid="reveal-centered-verdict"
      style={{
        height: VERDICT_RESERVED_HEIGHT,
        display: "flex",
        justifyContent: "center",
        visibility: text === null ? "hidden" : "visible",
      }}
    >
      {text === null ? null : (
        <SlamStamp live={live} shake="small" shakeRef={shakeRef} size={64}>
          {text}
        </SlamStamp>
      )}
    </div>
  );
}

function VerdictCaption({ text }: { text: string | null }) {
  return (
    <div
      data-testid="reveal-caption"
      style={{
        height: CAPTION_RESERVED_HEIGHT,
        visibility: text === null ? "hidden" : "visible",
      }}
    >
      {text === null ? null : <div style={CAPTION}>{text}</div>}
    </div>
  );
}

function PointsLine({
  text,
  live,
}: {
  text: string | null;
  live: boolean;
}) {
  return (
    <div
      data-testid="reveal-points"
      style={{
        height: POINTS_RESERVED_HEIGHT,
        visibility: text === null ? "hidden" : "visible",
      }}
    >
      {text === null ? null : (
        <FxIn live={live} preset="fadeIn">
          <div style={{ fontSize: 40, fontWeight: 700, textAlign: "center" }}>
            {text}
          </div>
        </FxIn>
      )}
    </div>
  );
}

function NextNote({
  text,
  stage,
}: {
  text: string;
  stage: Stage;
}) {
  return (
    <div
      data-testid="reveal-next-note"
      style={{
        height: NOTE_RESERVED_HEIGHT,
        alignSelf: "center",
        visibility: stage.nextReached ? "visible" : "hidden",
      }}
    >
      {stage.nextReached ? (
        <FxIn live={stage.nextLive} preset="tapeOn">
          <StickyNote
            tilt={-2}
            style={{
              padding: "22px 32px",
              fontSize: 36,
              fontWeight: 700,
              lineHeight: 1.2,
            }}
          >
            {text}
          </StickyNote>
        </FxIn>
      ) : null}
    </div>
  );
}

/** Visually hidden sentence that states the verdict in words. */
function VerdictAnnouncer({
  outcome,
  players,
  verdictReached,
}: {
  outcome: MltOutcome;
  players: PlayerSummary[];
  verdictReached: boolean;
}) {
  const text = verdictReached ? verdictSentence(outcome, players) : "";
  return (
    <output aria-live="polite" style={HIDDEN}>
      {text}
    </output>
  );
}

export interface HostRevealProps {
  view: MltHostView;
  players: PlayerSummary[];
  deadline: number | null;
  timerStartedAt: number | null;
  clock: ServerClock;
}

export function HostReveal(props: HostRevealProps) {
  const reveal = props.view.reveal ?? FALLBACK_REVEAL;
  const plan = useMemo(() => revealPlan(reveal), [reveal]);
  const rootRef = useRef<HTMLDivElement>(null);
  const startedAt = anchorAt(props.timerStartedAt, props.deadline, REVEAL_MS);
  const moment = useMoment(plan.beats, startedAt, props.clock);
  const play = useCue();
  const stage = stageFromMoment(moment, plan.beats);
  const spotlightOn =
    stage.suspenseReached &&
    !stage.verdictReached &&
    plan.spotlightTargetIds.length > 0;
  const targets = useSpotlightTargets(
    rootRef,
    plan.spotlightTargetIds,
    spotlightOn,
  );
  const verdict = verdictView({
    outcome: reveal.outcome,
    verdictReached: stage.verdictReached,
    verdictLive: stage.verdictLive,
    players: props.players,
  });
  const highlightedIds = stage.verdictReached ? plan.spotlightTargetIds : [];

  useBeatEntries(plan.beats, moment, (beat) => fireCue(play, beat));

  return (
    <div ref={rootRef} style={ROOT}>
      <FxIn live={stage.introLive} preset="slideIn">
        <PromptLine prompt={props.view.prompt} size={44} />
      </FxIn>
      <CenteredVerdict
        text={verdict.centeredStamp}
        live={stage.verdictLive}
        shakeRef={rootRef}
      />
      <RevealTileRow
        reveal={reveal}
        plan={plan}
        drawn={marksDrawn(plan.beats, moment)}
        live={moment.live}
        players={props.players}
        highlightedIds={highlightedIds}
        verdict={verdict}
        shakeRef={rootRef}
      />
      <Spotlight on={spotlightOn} targets={targets} />
      <VerdictCaption text={stage.verdictReached ? verdict.caption : null} />
      <PointsLine
        text={
          stage.pointsReached
            ? pointsLine(reveal.matchedIds, props.players)
            : null
        }
        live={isLive(moment, "points")}
      />
      <NextNote
        text={nextNoteText(props.view.roundNumber, props.view.roundCount)}
        stage={stage}
      />
      <VerdictAnnouncer
        outcome={reveal.outcome}
        players={props.players}
        verdictReached={stage.verdictReached}
      />
    </div>
  );
}
