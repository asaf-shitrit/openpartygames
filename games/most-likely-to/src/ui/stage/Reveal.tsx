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
import { format, pickPluralByCount, useLocale } from "@opg/i18n";
import type { Dictionary } from "@opg/i18n";
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

function voteLabel(t: Dictionary, shown: number): string {
  return format(pickPluralByCount(shown, t.mostLikelyTo.votes), { count: shown });
}

const CARD_STYLE: CSSProperties = {
  padding: "20px 18px 16px",
  marginInline: 10,
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

const STAMP_WRAP: CSSProperties = {
  width: "100%",
  display: "flex",
  justifyContent: "center",
};

const STAMP_STYLE: CSSProperties = {
  maxWidth: "100%",
  textAlign: "center",
  whiteSpace: "normal",
};

function VerdictArea({
  outcome,
  verdictReached,
  verdictLive,
  players,
  t,
}: {
  outcome: MltOutcome;
  verdictReached: boolean;
  verdictLive: boolean;
  players: PlayerSummary[];
  t: Dictionary;
}) {
  if (!verdictReached) return <div style={{ minHeight: 44 }} />;
  const stampText = verdictStampText(t, outcome);
  const captionText = explainLine(t, outcome, players);
  return (
    <>
      <div data-testid="stage-verdict-stamp" style={STAMP_WRAP}>
        {/* `Stamp` (packages/ui/src/primitives.tsx) sizes itself to fit "Most likely!" at a
            single line, inline-flex, with no width of its own to cap it against — fine on
            the TV's 1920px stage this was built for, but at 200% zoom on a phone this column
            has already halved, and a 6deg tilt widens the box further still. `maxWidth: "100%"`
            here is what lets the stamp's own text wrap inside the card instead of running past
            it, the same physics `checkClipped`'s comment (e2e/layout/invariants.js) describes
            for a rotated box: rotation grows a bounding box without moving a word, so the box
            has to have room to grow into before it tilts. */}
        <SlamStamp live={verdictLive} shake="small" size={24} style={STAMP_STYLE}>
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
  // `minHeight`, not `height`, and `flexWrap: "wrap"`: eight players at NAME_MAX_LENGTH
  // already crowd this row, and at 200% zoom there isn't always room left for the mark strip
  // on the same line as a long name. Wrapping the name (packages/ui's `.opg-root` sets
  // `overflow-wrap: break-word` globally for exactly this) or dropping the tally group to a
  // line of its own both grow the row instead of forcing content past the card's edge — a
  // fixed height would have clipped either one into the row below it.
  minHeight: 48,
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 10,
  padding: "6px 10px",
  borderBottom: "2px dashed var(--opg-muted)",
};

const ROW_NAME: CSSProperties = {
  flexGrow: 1,
  minWidth: 0,
  fontSize: 17,
  fontWeight: 700,
};

/**
 * The mark strip plus the "N votes" text. Marks are capped (`MAX_DRAWN_MARKS` below) rather
 * than dropped: the drawing is still the same one the TV shows, just not a stroke per vote once
 * the count runs past what a scoreboard would draw out in full. `marginInlineStart: "auto"`
 * keeps it flush with the row's end on its own line when `ROW`'s wrap sends it there — the
 * common case is still one line for everyone at typical counts and typical zoom.
 */
const ROW_COUNT: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  marginInlineStart: "auto",
};

const ROW_COUNT_LABEL: CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
};

const ROW_HIGHLIGHTED: CSSProperties = {
  ...ROW,
  borderBottom: "2px dashed var(--opg-ink)",
  background: "var(--opg-highlight-soft)",
};

/**
 * `TallyScratch`'s own SVG is `count * 20px` wide (packages/ui/src/fx/TallyScratch.tsx) — sized
 * for the TV tile it was built for, which spends a whole card's width per player. This row
 * spends one line on eight, and a mark-per-vote drawing for anyone with, say, five or more
 * votes was on its own wider than the phone once 200% zoom doubled it. A scoreboard draws out a
 * few tally strokes and then just writes the number, rather than a stroke per point once the
 * count runs long — this caps the drawing the same way; the "N votes" text beside it always
 * carries the real count, capped marks or not.
 */
const MAX_DRAWN_MARKS = 4;

interface TallyRowProps {
  id: PlayerId;
  meId: PlayerId | null;
  voters: PlayerId[];
  order: readonly ScratchMark[];
  drawn: number;
  highlighted: boolean;
  players: PlayerSummary[];
  t: Dictionary;
}

function TallyRow({ id, meId, voters, order, drawn, highlighted, players, t }: TallyRowProps) {
  const shown = marksForTarget(order, id, drawn);
  const name = nameOf(players, id, t.common.someone);
  const label = id === meId ? `${name}${t.mostLikelyTo.youSuffixLower}` : name;
  return (
    <div style={highlighted ? ROW_HIGHLIGHTED : ROW}>
      <Avatar
        id={avatarOf(players, id)}
        size={32}
        alt={format(t.mostLikelyTo.avatarAlt, { name })}
      />
      <div style={ROW_NAME}>{label}</div>
      {shown > 0 ? (
        <div style={ROW_COUNT}>
          <span className="opg-mlt-tally-marks">
            <TallyScratch
              count={Math.min(voters.length, MAX_DRAWN_MARKS)}
              drawn={Math.min(shown, MAX_DRAWN_MARKS)}
              size={26}
              label={voteLabel(t, shown)}
            />
          </span>
          <div style={ROW_COUNT_LABEL}>{voteLabel(t, shown)}</div>
        </div>
      ) : (
        // --opg-muted reads fine against a dashed border but is only 3.45:1 as body text —
        // below the 4.5:1 floor for a 16px label. --opg-ink-secondary is the same "quieter
        // than the headline" weight and clears it.
        <div style={{ ...ROW_COUNT_LABEL, color: "var(--opg-ink-secondary)" }}>
          {t.mostLikelyTo.zeroVotes}
        </div>
      )}
    </div>
  );
}

function PointsLine({
  pointsReached,
  matchedIds,
  players,
  t,
}: {
  pointsReached: boolean;
  matchedIds: readonly PlayerId[];
  players: PlayerSummary[];
  t: Dictionary;
}) {
  if (!pointsReached) return null;
  return (
    <div style={{ fontSize: 18, fontWeight: 700, textAlign: "center" }}>
      {pointsLine(t, matchedIds, players)}
    </div>
  );
}

function NextNote({
  nextReached,
  roundNumber,
  roundCount,
  t,
}: {
  nextReached: boolean;
  t: Dictionary;
  roundNumber: number;
  roundCount: number;
}) {
  if (!nextReached) return null;
  return (
    <StickyNote tilt={-2} style={{ padding: "10px 18px", fontSize: 18, fontWeight: 700 }}>
      {nextNoteText(t, roundNumber, roundCount)}
    </StickyNote>
  );
}

function VerdictAnnouncer({
  verdictReached,
  outcome,
  players,
  t,
}: {
  verdictReached: boolean;
  t: Dictionary;
  outcome: MltOutcome;
  players: PlayerSummary[];
}) {
  return (
    <output aria-live="polite" style={HIDDEN}>
      {verdictReached ? verdictSentence(t, outcome, players) : ""}
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
  t,
}: {
  suspenseOn: boolean;
  startedAt: number | null;
  clock: ServerClock;
  t: Dictionary;
}) {
  if (!suspenseOn || startedAt === null) return null;
  return (
    <Suspense
      startedAt={startedAt}
      durationMs={REVEAL_TIMING.verdictMs - REVEAL_TIMING.suspenseMs}
      clock={clock}
      size={64}
      label={t.mostLikelyTo.verdictIncoming}
    />
  );
}

function highlightedIdsFor(
  verdictReached: boolean,
  highlightIds: readonly PlayerId[],
): readonly PlayerId[] {
  return verdictReached ? highlightIds : [];
}

/**
 * `TallyScratch`'s mark drawing has no width of its own to give up (see `MAX_DRAWN_MARKS`
 * above), so once this card is narrow enough — eight names sharing one line, a phone's width,
 * 200% zoom stacking on top of both — even a capped strip has nowhere left to sit next to the
 * "N votes" text it stands beside. A container query drops the drawing only on the rows where
 * that is actually true, rather than trading it away everywhere for a case that mostly doesn't
 * happen: at ordinary widths and zoom this card is comfortably wide enough and the marks stay
 * exactly as the TV renders them. `@container` (not a `max-width` media query) is what makes
 * this correct under browser zoom at all: 200% zoom halves the layout space available to this
 * card without touching `window.innerWidth`, and a container query reads the card's own
 * rendered width — the thing that actually changed — where a viewport media query would not
 * see it move (see the `text at 200%` comment in e2e/layout/a11y.spec.ts for the same trap).
 */
const TALLY_CONTAINER_QUERY_CSS = `
  .opg-mlt-tally-list { container-type: inline-size; container-name: opg-mlt-tally; }
  @container opg-mlt-tally (max-width: 260px) {
    .opg-mlt-tally-marks { display: none; }
  }
`;

function TallyList({
  reveal,
  plan,
  drawn,
  highlightedIds,
  me,
  players,
  t,
}: {
  reveal: MltReveal;
  plan: RevealPlan;
  drawn: number;
  highlightedIds: readonly PlayerId[];
  me: PlayerId | null;
  players: PlayerSummary[];
  t: Dictionary;
}) {
  return (
    <div
      className="opg-mlt-tally-list"
      style={{ width: "100%", display: "flex", flexDirection: "column" }}
    >
      <style>{TALLY_CONTAINER_QUERY_CSS}</style>
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
          t={t}
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
  const { t } = useLocale();
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
      <PromptLine prompt={view.prompt} size={19} level={1} />
      <VerdictArea
        outcome={reveal.outcome}
        verdictReached={stage.verdictReached}
        verdictLive={stage.verdictLive}
        players={players}
        t={t}
      />
      <SuspenseRing suspenseOn={suspense.on} startedAt={suspense.startedAt} clock={clock} t={t} />
      <TallyList
        reveal={reveal}
        plan={plan}
        drawn={drawn}
        highlightedIds={highlightedIds}
        me={me}
        players={players}
        t={t}
      />
      <PointsLine
        pointsReached={stage.pointsReached}
        matchedIds={reveal.matchedIds}
        players={players}
        t={t}
      />
      <NextNote
        nextReached={stage.nextReached}
        roundNumber={view.roundNumber}
        roundCount={view.roundCount}
        t={t}
      />
      <VerdictAnnouncer
        verdictReached={stage.verdictReached}
        outcome={reveal.outcome}
        players={players}
        t={t}
      />
    </Card>
  );
}
