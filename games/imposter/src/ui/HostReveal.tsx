// TV reveal: the 12-second, beat-by-beat Imposter unmasking. Everything is derived from the
// moment, so a device that reloads mid-reveal lands on the settled state with no slam or replay.
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, RefObject } from "react";
import type { PlayerId, PlayerSummary } from "@opg/protocol";
import type {
  Beat,
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
  Highlight,
  Marker,
  playFx,
  reached,
  SlamStamp,
  Spotlight,
  StickyNote,
  TallyScratch,
  useBeatEntries,
  useCue,
  useMoment,
  useReducedMotion,
} from "@opg/ui";
import { REVEAL_MS, type ImposterHostView } from "../state";
import { revealOutcome, topVoted } from "../rules";
import type { RevealOutcome } from "../rules";
import {
  hostRevealBeats,
  marksDrawn,
  marksForTarget,
  scratchOrder,
} from "./reveal-timeline";
import type { ScratchMark } from "./reveal-timeline";

const TILTS = [-1.5, 1, -1, 1.5, -1, 2];
const ROOT: CSSProperties = {
  position: "relative",
  flexGrow: 1,
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  gap: 44,
};
const CAPTION: CSSProperties = {
  fontSize: 44,
  fontWeight: 700,
  color: "var(--opg-ink-secondary)",
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
/** The measured slot around each tile: it owns the flex sizing so the spotlight can find it. */
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

function findPlayer(
  players: PlayerSummary[],
  id: PlayerId | null,
): PlayerSummary | null {
  if (!id) return null;
  return players.find((player) => player.id === id) ?? null;
}

function nameOf(players: PlayerSummary[], id: PlayerId | null): string {
  const player = findPlayer(players, id);
  if (player) return player.name;
  return id ?? "Someone";
}

function avatarOf(players: PlayerSummary[], id: PlayerId | null) {
  return findPlayer(players, id)?.avatar ?? null;
}

function avatarLabel(players: PlayerSummary[], id: PlayerId | null): string {
  return `${nameOf(players, id)}'s avatar`;
}

interface RevealPlan {
  tally: Record<PlayerId, PlayerId[]>;
  order: ScratchMark[];
  topIds: PlayerId[];
  outcome: RevealOutcome;
  beats: Beat[];
}

function revealPlan(view: ImposterHostView): RevealPlan {
  const tally = view.tally ?? {};
  // The frozen roster: a kick mid-reveal must not move the marks or the verdict.
  const roster = view.revealPlayerIds ?? view.playerIds;
  const outcome = revealOutcome(tally, view.imposterId, roster);
  const order = scratchOrder(tally, roster);
  return {
    tally,
    order,
    topIds: topVoted(tally, roster),
    outcome,
    beats: hostRevealBeats(outcome, order.length),
  };
}

/** Circle centers and radii of the top-voted tiles, in the positioned root's px space. */
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

/** Wobbles the top-voted tiles once, on the live suspense beat. */
export function wobbleTiles(
  root: HTMLElement | null,
  ids: readonly PlayerId[],
  reduced: boolean,
): void {
  if (root === null) return;
  for (const id of ids) {
    const el = root.querySelector(`[data-tile-id="${id}"]`);
    if (el instanceof HTMLElement) playFx(el, "wobble", reduced);
  }
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

interface Stage {
  introLive: boolean;
  suspense: boolean;
  verdictReached: boolean;
  unmask: boolean;
  next: boolean;
  verdictLive: boolean;
  unmaskLive: boolean;
  nextLive: boolean;
}

function isLive(moment: Moment, id: string): boolean {
  return moment.live && moment.beatId === id;
}

function stageFromMoment(moment: Moment, beats: readonly Beat[]): Stage {
  return {
    introLive: isLive(moment, "intro"),
    suspense: reached(moment, beats, "suspense"),
    verdictReached: reached(moment, beats, "verdict"),
    unmask: reached(moment, beats, "unmask"),
    next: reached(moment, beats, "next"),
    verdictLive: isLive(moment, "verdict"),
    unmaskLive: isLive(moment, "unmask"),
    nextLive: isLive(moment, "next"),
  };
}

interface TileStamp {
  id: PlayerId;
  text: string;
  shake: "big" | "small" | "none";
  live: boolean;
}

interface VerdictView {
  highlightedId: PlayerId | null;
  footprintsId: PlayerId | null;
  stamps: TileStamp[];
  centered: string | null;
}

interface VerdictArgs {
  outcome: RevealOutcome;
  imposterId: PlayerId | null;
  verdict: boolean;
  unmask: boolean;
  verdictLive: boolean;
  unmaskLive: boolean;
}

function centeredText(outcome: RevealOutcome, verdict: boolean): string | null {
  if (!verdict) return null;
  if (outcome.kind === "tie") return "It's a tie!";
  if (outcome.kind === "no-votes") return "No votes?!";
  return null;
}

/** The imposter tile highlights at the verdict when caught, otherwise at the unmask. */
function highlightedId(args: VerdictArgs): PlayerId | null {
  if (args.outcome.kind === "caught") {
    if (args.verdict) return args.imposterId;
    return null;
  }
  if (args.unmask) return args.imposterId;
  return null;
}

/** The footprints appear beside the real imposter's tile once the unmask lands. */
function footprintsId(args: VerdictArgs): PlayerId | null {
  if (args.outcome.kind === "caught") return null;
  if (args.unmask) return args.imposterId;
  return null;
}

function caughtStamps(args: VerdictArgs): TileStamp[] {
  if (!args.verdict || args.imposterId === null) return [];
  return [
    {
      id: args.imposterId,
      text: "Imposter!",
      shake: "big",
      live: args.verdictLive,
    },
  ];
}

function escapedStamps(args: VerdictArgs): TileStamp[] {
  const stamps: TileStamp[] = [];
  if (args.verdict && args.outcome.kind === "wrong") {
    stamps.push({
      id: args.outcome.accusedId,
      text: "Not the imposter",
      shake: "small",
      live: args.verdictLive,
    });
  }
  if (args.unmask && args.imposterId !== null) {
    stamps.push({
      id: args.imposterId,
      text: "Imposter!",
      shake: "none",
      live: args.unmaskLive,
    });
  }
  return stamps;
}

function tileStamps(args: VerdictArgs): TileStamp[] {
  if (args.outcome.kind === "caught") return caughtStamps(args);
  return escapedStamps(args);
}

function verdictView(args: VerdictArgs): VerdictView {
  return {
    highlightedId: highlightedId(args),
    footprintsId: footprintsId(args),
    stamps: tileStamps(args),
    centered: centeredText(args.outcome, args.verdict),
  };
}

/** One of the four verdict sentences read out to screen readers at the verdict beat. */
export function verdictSentence(
  outcome: RevealOutcome,
  imposterId: PlayerId | null,
  players: PlayerSummary[],
): string {
  const imposter = nameOf(players, imposterId);
  if (outcome.kind === "caught") {
    return `${imposter} was the imposter and got caught.`;
  }
  if (outcome.kind === "wrong") {
    const accused = nameOf(players, outcome.accusedId);
    return `${accused} was not the imposter. ${imposter} got away.`;
  }
  if (outcome.kind === "tie") return `It's a tie. ${imposter} got away.`;
  return `Nobody voted. ${imposter} got away.`;
}

function tileStyle(highlighted: boolean): CSSProperties {
  if (!highlighted) return TILE;
  return { ...TILE, border: "5px solid var(--opg-ink)" };
}

/** Dotted doodle footprints left behind by an imposter who slipped away. */
function Footprints() {
  return (
    <svg width={140} height={70} viewBox="0 0 140 70" aria-hidden="true">
      <g
        fill="none"
        stroke="var(--opg-ink)"
        strokeWidth={5}
        strokeLinecap="round"
        strokeDasharray="10 8"
      >
        <path d="M4 56c10-16 26-26 42-26" />
        <path d="M56 44c12-12 26-18 42-14" />
      </g>
      <g fill="var(--opg-ink)">
        <ellipse cx="16" cy="60" rx="12" ry="8" />
        <ellipse cx="112" cy="34" rx="12" ry="8" />
      </g>
    </svg>
  );
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
      <Avatar
        id={avatarOf(players, id)}
        size={40}
        alt={avatarLabel(players, id)}
      />
    </FxIn>
  );
}

const LONG_STAMP_TEXT_LENGTH = 10;
const SHORT_STAMP_SIZE = 52;
const LONG_STAMP_SIZE = 40;

/** Long tile stamps ("Not the imposter") get a smaller size so they never wrap to two lines. */
function stampSizeFor(text: string): number {
  return text.length > LONG_STAMP_TEXT_LENGTH
    ? LONG_STAMP_SIZE
    : SHORT_STAMP_SIZE;
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
        shake={stamp.shake}
        shakeRef={shakeRef}
        size={stampSizeFor(stamp.text)}
      >
        {stamp.text}
      </SlamStamp>
    </div>
  );
}

interface RevealTileProps {
  id: PlayerId;
  index: number;
  voters: PlayerId[];
  order: readonly ScratchMark[];
  drawn: number;
  compact: boolean;
  highlighted: boolean;
  footprints: boolean;
  stamp: TileStamp | null;
  live: boolean;
  players: PlayerSummary[];
  shakeRef: RefObject<HTMLElement | null>;
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

function RevealTile(props: RevealTileProps) {
  const { id, index, voters, order, drawn, compact, live } = props;
  const shown = marksForTarget(order, id, drawn);
  return (
    <div data-tile-id={id} style={TILE_SLOT}>
      <Card
        variant={index % 2 === 0 ? "M" : "Malt"}
        tilt={TILTS[index % TILTS.length]}
        background={props.highlighted ? "var(--opg-highlight-soft)" : undefined}
        style={tileStyle(props.highlighted)}
        className="opg-reveal-tile"
      >
        <Avatar
          id={avatarOf(props.players, id)}
          size={compact ? 88 : 110}
          alt={avatarLabel(props.players, id)}
        />
        <div style={{ fontSize: 36, fontWeight: 700, lineHeight: 1.1 }}>
          {nameOf(props.players, id)}
        </div>
        <TallyRow count={voters.length} shown={shown} />
        <VoterRow
          voters={voters}
          shown={shown}
          live={live}
          players={props.players}
        />
        {props.stamp === null ? null : (
          <TileStampBadge stamp={props.stamp} shakeRef={props.shakeRef} />
        )}
        {props.footprints ? (
          <div style={{ position: "absolute", right: -22, bottom: -22 }}>
            <FxIn live={props.live} preset="pop">
              <Footprints />
            </FxIn>
          </div>
        ) : null}
      </Card>
    </div>
  );
}

interface RevealTileRowProps {
  view: ImposterHostView;
  plan: RevealPlan;
  drawn: number;
  live: boolean;
  players: PlayerSummary[];
  verdict: VerdictView;
  shakeRef: RefObject<HTMLElement | null>;
}

function RevealTileRow(props: RevealTileRowProps) {
  const { view, plan, players, verdict, shakeRef } = props;
  const compact = view.playerIds.length > 6;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "space-between",
        gap: 24,
      }}
    >
      {view.playerIds.map((id, index) => (
        <RevealTile
          key={id}
          id={id}
          index={index}
          voters={plan.tally[id] ?? []}
          order={plan.order}
          drawn={props.drawn}
          compact={compact}
          highlighted={verdict.highlightedId === id}
          footprints={verdict.footprintsId === id}
          stamp={verdict.stamps.find((stamp) => stamp.id === id) ?? null}
          live={props.live}
          players={players}
          shakeRef={shakeRef}
        />
      ))}
    </div>
  );
}

/** Reserved heights so the caption and centered verdict never push the tile row when they arrive. */
const CAPTION_RESERVED_HEIGHT = 60;
const VERDICT_RESERVED_HEIGHT = 132;

function Caption({ suspense }: { suspense: boolean }) {
  return (
    <div
      data-testid="reveal-caption"
      style={{
        height: CAPTION_RESERVED_HEIGHT,
        visibility: suspense ? "visible" : "hidden",
      }}
    >
      {suspense ? <div style={CAPTION}>And the imposter is…</div> : null}
    </div>
  );
}

function CenteredVerdict({
  verdict,
  live,
  shakeRef,
}: {
  verdict: VerdictView;
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
        visibility: verdict.centered === null ? "hidden" : "visible",
      }}
    >
      {verdict.centered === null ? null : (
        <SlamStamp live={live} shake="small" shakeRef={shakeRef} size={64}>
          {verdict.centered}
        </SlamStamp>
      )}
    </div>
  );
}

function DecoyFooter({
  view,
  players,
  live,
}: {
  view: ImposterHostView;
  players: PlayerSummary[];
  live: boolean;
}) {
  const imposter = nameOf(players, view.imposterId);
  return (
    <FxIn live={live} preset="fadeIn">
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <div style={{ fontSize: 44, fontWeight: 700 }}>
          {imposter}&apos;s decoy word was
        </div>
        <Highlight style={{ padding: "0 14px" }}>
          <Marker size={88}>{view.decoyWord ?? "—"}</Marker>
        </Highlight>
      </div>
    </FxIn>
  );
}

/** Reserved heights for the footer and note, so their arrival never jumps the centered body. */
const FOOTER_RESERVED_HEIGHT = 108;
const NOTE_RESERVED_HEIGHT = 92;

function UnmaskFooter({
  view,
  players,
  stage,
}: {
  view: ImposterHostView;
  players: PlayerSummary[];
  stage: Stage;
}) {
  return (
    <div
      data-testid="reveal-footer"
      style={{
        height: FOOTER_RESERVED_HEIGHT,
        visibility: stage.unmask ? "visible" : "hidden",
      }}
    >
      {stage.unmask ? (
        <DecoyFooter view={view} players={players} live={stage.unmaskLive} />
      ) : null}
    </div>
  );
}

function NextNote({
  view,
  players,
  stage,
}: {
  view: ImposterHostView;
  players: PlayerSummary[];
  stage: Stage;
}) {
  const imposter = nameOf(players, view.imposterId);
  const caught = view.caught === true;
  const note = caught
    ? `One last chance, ${imposter}…`
    : `${imposter} slipped away: +1,000`;
  return (
    <div
      data-testid="reveal-next-note"
      style={{
        height: NOTE_RESERVED_HEIGHT,
        alignSelf: "flex-end",
        visibility: stage.next ? "visible" : "hidden",
      }}
    >
      {stage.next ? (
        <FxIn live={stage.nextLive} preset="tapeOn">
          <StickyNote
            tilt={-2}
            style={{
              padding: "22px 32px",
              fontSize: 40,
              fontWeight: 700,
              lineHeight: 1.2,
            }}
          >
            {note}
          </StickyNote>
        </FxIn>
      ) : null}
    </div>
  );
}

/** Visually hidden sentence that states the verdict in words. */
function VerdictAnnouncer({
  view,
  players,
  outcome,
  verdict,
}: {
  view: ImposterHostView;
  players: PlayerSummary[];
  outcome: RevealOutcome;
  verdict: boolean;
}) {
  const text = verdict
    ? verdictSentence(outcome, view.imposterId, players)
    : "";
  return (
    <output aria-live="polite" style={HIDDEN}>
      {text}
    </output>
  );
}

interface RevealStageProps {
  view: ImposterHostView;
  players: PlayerSummary[];
  plan: RevealPlan;
  stage: Stage;
  drawn: number;
  live: boolean;
  targets: SpotlightTarget[];
  spotlightOn: boolean;
  verdict: VerdictView;
  shakeRef: RefObject<HTMLElement | null>;
}

function RevealStage(props: RevealStageProps) {
  const { view, players, plan, stage, verdict, shakeRef } = props;
  return (
    <>
      <FxIn live={stage.introLive} preset="slideIn">
        <Marker size={96}>The votes are in</Marker>
      </FxIn>
      <Caption suspense={stage.suspense} />
      <CenteredVerdict
        verdict={verdict}
        live={stage.verdictLive}
        shakeRef={shakeRef}
      />
      <RevealTileRow
        view={view}
        plan={plan}
        drawn={props.drawn}
        live={props.live}
        players={players}
        verdict={verdict}
        shakeRef={shakeRef}
      />
      <Spotlight on={props.spotlightOn} targets={props.targets} />
      <UnmaskFooter view={view} players={players} stage={stage} />
      <NextNote view={view} players={players} stage={stage} />
      <VerdictAnnouncer
        view={view}
        players={players}
        outcome={plan.outcome}
        verdict={stage.verdictReached}
      />
    </>
  );
}

export interface HostRevealProps {
  view: ImposterHostView;
  players: PlayerSummary[];
  deadline: number | null;
  timerStartedAt: number | null;
  clock: ServerClock;
}

export function HostReveal(props: HostRevealProps) {
  const plan = useMemo(() => revealPlan(props.view), [props.view]);
  const rootRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const startedAt = anchorAt(props.timerStartedAt, props.deadline, REVEAL_MS);
  const moment = useMoment(plan.beats, startedAt, props.clock);
  const play = useCue();
  const stage = stageFromMoment(moment, plan.beats);
  const spotlightOn = stage.suspense && !stage.verdictReached;
  const targets = useSpotlightTargets(rootRef, plan.topIds, spotlightOn);
  const verdict = verdictView({
    outcome: plan.outcome,
    imposterId: props.view.imposterId,
    verdict: stage.verdictReached,
    unmask: stage.unmask,
    verdictLive: stage.verdictLive,
    unmaskLive: stage.unmaskLive,
  });

  useBeatEntries(plan.beats, moment, (beat) => {
    if (beat.cue !== undefined) play(beat.cue, cueOptions(beat.cue));
    if (beat.id === "suspense") {
      wobbleTiles(rootRef.current, plan.topIds, reduced);
    }
  });

  return (
    <div ref={rootRef} style={ROOT}>
      <RevealStage
        view={props.view}
        players={props.players}
        plan={plan}
        stage={stage}
        drawn={marksDrawn(plan.beats, moment)}
        live={moment.live}
        targets={targets}
        spotlightOn={spotlightOn}
        verdict={verdict}
        shakeRef={rootRef}
      />
    </div>
  );
}
