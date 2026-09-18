// No-TV stage for the reveal phase: the same 12s ceremony as the TV, repainted as a single
// column. Reuses ../reveal-timeline.ts unchanged; only the painting is new. PHONE_FOLLOW_MS
// does not apply here — the stage IS the TV in this mode, so there is nothing to follow.
import { useMemo } from "react";
import type { CSSProperties } from "react";
import type { PlayerId, PlayerSummary } from "@opg/protocol";
import type { Beat, Moment, ServerClock } from "@opg/ui";
import {
  anchorAt,
  Avatar,
  Card,
  reached,
  SlamStamp,
  StickyNote,
  Suspense,
  TallyScratch,
  useMoment,
} from "@opg/ui";
import type { MltHostView, MltOutcome, MltReveal } from "../../state";
import { REVEAL_MS } from "../../state";
import { avatarOf, nameOf, PromptLine } from "../common";
import {
  explainLine,
  nextNoteText,
  pointsLine,
  verdictSentence,
  verdictStampText,
} from "../HostReveal";
import {
  hostRevealBeats,
  marksDrawn,
  marksForTarget,
  REVEAL_TIMING,
  scratchOrder,
  spotlightIds,
} from "../reveal-timeline";
import type { ScratchMark } from "../reveal-timeline";

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

const FALLBACK_REVEAL: MltReveal = {
  playerIds: [],
  tally: {},
  outcome: { kind: "no-votes" },
  matchedIds: [],
};

interface RevealPlan {
  order: ScratchMark[];
  beats: Beat[];
  highlightIds: PlayerId[];
}

function revealPlan(reveal: MltReveal): RevealPlan {
  const order = scratchOrder(reveal.tally, reveal.playerIds);
  return {
    order,
    beats: hostRevealBeats(reveal.outcome, order.length),
    highlightIds: spotlightIds(reveal.outcome),
  };
}

interface Stage {
  suspenseReached: boolean;
  verdictReached: boolean;
  verdictLive: boolean;
  pointsReached: boolean;
  nextReached: boolean;
  nextLive: boolean;
}

function stageFromMoment(moment: Moment, beats: readonly Beat[]): Stage {
  const isLive = (id: string) => moment.live && moment.beatId === id;
  return {
    suspenseReached: reached(moment, beats, "suspense"),
    verdictReached: reached(moment, beats, "verdict"),
    verdictLive: isLive("verdict"),
    pointsReached: reached(moment, beats, "points"),
    nextReached: reached(moment, beats, "next"),
    nextLive: isLive("next"),
  };
}

function voteLabel(shown: number): string {
  return `${shown} ${shown === 1 ? "vote" : "votes"}`;
}

const CARD_STYLE: CSSProperties = {
  padding: "20px 18px 16px",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 10,
};

const CAPTION: CSSProperties = {
  fontSize: 18,
  fontWeight: 700,
  textAlign: "center",
  minHeight: 24,
};

function VerdictArea({
  outcome,
  verdictReached,
  verdictLive,
  players,
}: {
  outcome: MltOutcome;
  verdictReached: boolean;
  verdictLive: boolean;
  players: PlayerSummary[];
}) {
  if (!verdictReached) return <div style={{ minHeight: 44 }} />;
  const stampText = verdictStampText(outcome);
  const captionText = explainLine(outcome, players);
  return (
    <>
      <div data-testid="stage-verdict-stamp">
        <SlamStamp live={verdictLive} shake="small" size={40}>
          {stampText}
        </SlamStamp>
      </div>
      <div style={CAPTION}>
        {captionText === stampText ? null : captionText}
      </div>
    </>
  );
}

const ROW: CSSProperties = {
  height: 48,
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "0 10px",
  borderBottom: "2px dashed var(--opg-muted)",
};

const ROW_HIGHLIGHTED: CSSProperties = {
  ...ROW,
  borderBottom: "2px dashed var(--opg-ink)",
  background: "var(--opg-highlight-soft)",
};

interface TallyRowProps {
  id: PlayerId;
  meId: PlayerId | null;
  voters: PlayerId[];
  order: readonly ScratchMark[];
  drawn: number;
  highlighted: boolean;
  players: PlayerSummary[];
}

function TallyRow({ id, meId, voters, order, drawn, highlighted, players }: TallyRowProps) {
  const shown = marksForTarget(order, id, drawn);
  const name = nameOf(players, id);
  const label = id === meId ? `${name} (you)` : name;
  return (
    <div style={highlighted ? ROW_HIGHLIGHTED : ROW}>
      <Avatar id={avatarOf(players, id)} size={32} alt={`${name}'s avatar`} />
      <div style={{ flexGrow: 1, fontSize: 17, fontWeight: 700 }}>{label}</div>
      {shown > 0 ? (
        <>
          <TallyScratch count={voters.length} drawn={shown} size={26} />
          <div style={{ fontSize: 16, fontWeight: 700 }}>{voteLabel(shown)}</div>
        </>
      ) : (
        <div style={{ fontSize: 16, fontWeight: 700, color: "var(--opg-muted)" }}>
          0 votes
        </div>
      )}
    </div>
  );
}

function PointsLine({
  pointsReached,
  matchedIds,
  players,
}: {
  pointsReached: boolean;
  matchedIds: readonly PlayerId[];
  players: PlayerSummary[];
}) {
  if (!pointsReached) return null;
  return (
    <div style={{ fontSize: 18, fontWeight: 700, textAlign: "center" }}>
      {pointsLine(matchedIds, players)}
    </div>
  );
}

function NextNote({
  nextReached,
  roundNumber,
  roundCount,
}: {
  nextReached: boolean;
  roundNumber: number;
  roundCount: number;
}) {
  if (!nextReached) return null;
  return (
    <StickyNote tilt={-2} style={{ padding: "10px 18px", fontSize: 18, fontWeight: 700 }}>
      {nextNoteText(roundNumber, roundCount)}
    </StickyNote>
  );
}

function VerdictAnnouncer({
  verdictReached,
  outcome,
  players,
}: {
  verdictReached: boolean;
  outcome: MltOutcome;
  players: PlayerSummary[];
}) {
  return (
    <output aria-live="polite" style={HIDDEN}>
      {verdictReached ? verdictSentence(outcome, players) : ""}
    </output>
  );
}

interface SuspenseState {
  startedAt: number | null;
  on: boolean;
}

/** Where the suspense ring is anchored, and whether it should show right now. */
function suspenseState(
  startedAt: number | null,
  stage: Pick<Stage, "suspenseReached" | "verdictReached">,
): SuspenseState {
  return {
    startedAt: startedAt === null ? null : startedAt + REVEAL_TIMING.suspenseMs,
    on: stage.suspenseReached && !stage.verdictReached,
  };
}

function SuspenseRing({
  suspenseOn,
  startedAt,
  clock,
}: {
  suspenseOn: boolean;
  startedAt: number | null;
  clock: ServerClock;
}) {
  if (!suspenseOn || startedAt === null) return null;
  return (
    <Suspense
      startedAt={startedAt}
      durationMs={REVEAL_TIMING.verdictMs - REVEAL_TIMING.suspenseMs}
      clock={clock}
      size={64}
      label="Verdict incoming"
    />
  );
}

function highlightedIdsFor(
  verdictReached: boolean,
  highlightIds: readonly PlayerId[],
): readonly PlayerId[] {
  return verdictReached ? highlightIds : [];
}

function TallyList({
  reveal,
  plan,
  drawn,
  highlightedIds,
  me,
  players,
}: {
  reveal: MltReveal;
  plan: RevealPlan;
  drawn: number;
  highlightedIds: readonly PlayerId[];
  me: PlayerId | null;
  players: PlayerSummary[];
}) {
  return (
    <div style={{ width: "100%", display: "flex", flexDirection: "column" }}>
      {reveal.playerIds.map((id) => (
        <TallyRow
          key={id}
          id={id}
          meId={me}
          voters={reveal.tally[id] ?? []}
          order={plan.order}
          drawn={drawn}
          highlighted={highlightedIds.includes(id)}
          players={players}
        />
      ))}
    </div>
  );
}

export interface StageRevealProps {
  view: MltHostView;
  players: PlayerSummary[];
  me: PlayerId | null;
  deadline: number | null;
  timerStartedAt: number | null;
  clock: ServerClock;
}

/** The stage region during the reveal: the same 12s ceremony as the TV, in one column. */
export function StageReveal(props: StageRevealProps) {
  const { view, players, me, clock } = props;
  const reveal = view.reveal ?? FALLBACK_REVEAL;
  const plan = useMemo(() => revealPlan(reveal), [reveal]);
  const startedAt = anchorAt(props.timerStartedAt, props.deadline, REVEAL_MS);
  const moment = useMoment(plan.beats, startedAt, clock);
  const stage = stageFromMoment(moment, plan.beats);
  const drawn = marksDrawn(plan.beats, moment);
  const suspense = suspenseState(startedAt, stage);
  const highlightedIds = highlightedIdsFor(stage.verdictReached, plan.highlightIds);

  return (
    <Card variant="M" tilt={-0.8} style={CARD_STYLE}>
      <PromptLine prompt={view.prompt} size={19} />
      <VerdictArea
        outcome={reveal.outcome}
        verdictReached={stage.verdictReached}
        verdictLive={stage.verdictLive}
        players={players}
      />
      <SuspenseRing suspenseOn={suspense.on} startedAt={suspense.startedAt} clock={clock} />
      <TallyList
        reveal={reveal}
        plan={plan}
        drawn={drawn}
        highlightedIds={highlightedIds}
        me={me}
        players={players}
      />
      <PointsLine
        pointsReached={stage.pointsReached}
        matchedIds={reveal.matchedIds}
        players={players}
      />
      <NextNote
        nextReached={stage.nextReached}
        roundNumber={view.roundNumber}
        roundCount={view.roundCount}
      />
      <VerdictAnnouncer
        verdictReached={stage.verdictReached}
        outcome={reveal.outcome}
        players={players}
      />
    </Card>
  );
}
