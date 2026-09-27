// No-TV stage for the reveal phase: the same 12s ceremony as the TV's HostReveal, repainted
// as a single-column tally list. Reuses ../reveal-timeline.ts unchanged -- hostRevealBeats,
// scratchOrder, marksDrawn, marksForTarget are all pure and phone-ready; only the painting is
// new. The verdict lands on one row at a time (the accused, then the real imposter), so the
// Suspense element sits on that row rather than centered, matching design/PhoneNoTvImposterReveal.
import { useMemo } from "react";
import type { CSSProperties } from "react";
import type { PlayerId, PlayerSummary } from "@opg/protocol";
import type { Beat, Moment, ServerClock } from "@opg/ui";
import {
  anchorAt,
  Avatar,
  Card,
  Highlight,
  Marker,
  reached,
  SlamStamp,
  StickyNote,
  Suspense,
  TallyScratch,
  useMoment,
} from "@opg/ui";
import { format, pickPluralByCount, useLocale } from "@opg/i18n";
import type { Dictionary } from "@opg/i18n";
import { REVEAL_MS, type ImposterHostView } from "../../state";
import { revealOutcome } from "../../rules";
import type { RevealOutcome } from "../../rules";
import { nextNoteText, verdictSentence } from "../HostReveal";
import {
  hostRevealBeats,
  marksDrawn,
  marksForTarget,
  REVEAL_TIMING,
  scratchOrder,
} from "../reveal-timeline";
import type { ScratchMark } from "../reveal-timeline";
import { avatarOf, nameOf } from "./common";

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

interface RevealPlan {
  roster: PlayerId[];
  tally: Record<PlayerId, PlayerId[]>;
  order: ScratchMark[];
  beats: Beat[];
  outcome: RevealOutcome;
}

function revealPlan(view: ImposterHostView): RevealPlan {
  const tally = view.tally ?? {};
  // The frozen roster: a kick mid-reveal must not move the marks or the verdict.
  const roster = view.revealPlayerIds ?? view.playerIds;
  const outcome = revealOutcome(tally, view.imposterId, roster);
  const order = scratchOrder(tally, roster);
  return { roster, tally, order, beats: hostRevealBeats(outcome, order.length), outcome };
}

interface Stage {
  suspenseReached: boolean;
  verdictReached: boolean;
  verdictLive: boolean;
  unmaskReached: boolean;
  unmaskLive: boolean;
  nextReached: boolean;
}

function stageFromMoment(moment: Moment, beats: readonly Beat[]): Stage {
  const isLive = (id: string) => moment.live && moment.beatId === id;
  return {
    suspenseReached: reached(moment, beats, "suspense"),
    verdictReached: reached(moment, beats, "verdict"),
    verdictLive: isLive("verdict"),
    unmaskReached: reached(moment, beats, "unmask"),
    unmaskLive: isLive("unmask"),
    nextReached: reached(moment, beats, "next"),
  };
}

/** The row the verdict beat lands on: the imposter when caught, the accused when wrong. */
function verdictTargetId(outcome: RevealOutcome, imposterId: PlayerId | null): PlayerId | null {
  if (outcome.kind === "caught") return imposterId;
  if (outcome.kind === "wrong") return outcome.accusedId;
  return null;
}

function verdictStampText(t: Dictionary, outcome: RevealOutcome): string {
  return outcome.kind === "caught"
    ? t.imposter.reveal.imposterBadge
    : t.imposter.reveal.notImposter;
}

/** The row the unmask beat lands on: the real imposter, only when they were not caught. */
function unmaskTargetId(outcome: RevealOutcome, imposterId: PlayerId | null): PlayerId | null {
  return outcome.kind === "caught" ? null : imposterId;
}

function centerCaption(
  t: Dictionary,
  outcome: RevealOutcome,
  verdictReached: boolean,
): string | null {
  if (!verdictReached) return null;
  if (outcome.kind === "tie") return t.imposter.reveal.itsATie;
  if (outcome.kind === "no-votes") return t.imposter.reveal.noVotesBang;
  return null;
}

function voteLabel(t: Dictionary, shown: number): string {
  return format(pickPluralByCount(shown, t.imposter.reveal.votes), { count: shown });
}

interface RowBadge {
  text: string;
  live: boolean;
  shake: "small" | "none";
}

interface RowBadgeArgs {
  t: Dictionary;
  id: PlayerId;
  stage: Stage;
  verdictId: PlayerId | null;
  unmaskId: PlayerId | null;
  outcome: RevealOutcome;
}

function rowBadge({ t, id, stage, verdictId, unmaskId, outcome }: RowBadgeArgs): RowBadge | null {
  if (stage.verdictReached && id === verdictId) {
    return { text: verdictStampText(t, outcome), live: stage.verdictLive, shake: "small" };
  }
  if (stage.unmaskReached && id === unmaskId) {
    return { text: t.imposter.reveal.imposterBadge, live: stage.unmaskLive, shake: "none" };
  }
  return null;
}

const REST_ROW: CSSProperties = {
  minHeight: 46,
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 10,
  padding: "0 6px",
};

function RestRow({
  id,
  shown,
  total,
  players,
}: {
  id: PlayerId;
  shown: number;
  total: number;
  players: PlayerSummary[];
}) {
  const { t } = useLocale();
  const name = nameOf(players, id, t.common.someone);
  const voted = shown > 0;
  return (
    <div style={REST_ROW}>
      <Avatar
        id={avatarOf(players, id)}
        size={32}
        alt={format(t.imposter.avatarAlt, { name })}
        style={voted ? undefined : { opacity: 0.55 }}
      />
      <div
        style={{
          flexGrow: 1,
          minWidth: "6ch",
          fontSize: 17,
          fontWeight: 700,
          opacity: voted ? 1 : 0.55,
          overflowWrap: "anywhere",
        }}
      >
        {name}
      </div>
      {voted ? (
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          <TallyScratch count={total} drawn={shown} size={20} />
          <div style={{ fontSize: 16, fontWeight: 700 }}>{voteLabel(t, shown)}</div>
        </div>
      ) : (
        <div style={{ fontSize: 16, fontWeight: 700, color: "var(--opg-ink-secondary)" }}>
          {format(pickPluralByCount(0, t.imposter.reveal.votes), { count: 0 })}
        </div>
      )}
    </div>
  );
}

const FOCUS_ROW: CSSProperties = {
  position: "relative",
  margin: "4px 0",
  padding: "14px 14px 12px",
  display: "flex",
  flexDirection: "column",
  gap: 8,
  background: "var(--opg-highlight)",
  border: "4px solid var(--opg-ink)",
  borderRadius: "26px 8px 24px 10px / 10px 24px 8px 26px",
  transform: "rotate(-0.6deg)",
};

const VOTER_ROW_MAX = 4;

/** Who voted for this row's target -- the same avatars the TV's tile row carries, shrunk to
 * fit a single-column focus row. Only ever shows voters already scratched onto the tally. */
function VoterAvatars({
  voters,
  shown,
  players,
}: {
  voters: readonly PlayerId[];
  shown: number;
  players: PlayerSummary[];
}) {
  const { t } = useLocale();
  const drawnVoters = voters.slice(0, shown);
  if (drawnVoters.length === 0) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      {drawnVoters.slice(0, VOTER_ROW_MAX).map((voterId) => (
        <Avatar
          key={voterId}
          id={avatarOf(players, voterId)}
          size={26}
          alt={format(t.imposter.avatarAlt, { name: nameOf(players, voterId, t.common.someone) })}
        />
      ))}
      {drawnVoters.length > VOTER_ROW_MAX ? (
        <div style={{ fontSize: 15, fontWeight: 700 }}>+{drawnVoters.length - VOTER_ROW_MAX}</div>
      ) : null}
    </div>
  );
}

interface FocusRowProps {
  id: PlayerId;
  shown: number;
  total: number;
  voters: readonly PlayerId[];
  badge: RowBadge | null;
  suspenseStartedAt: number | null;
  clock: ServerClock;
  players: PlayerSummary[];
}

function FocusRow({ id, shown, total, voters, badge, suspenseStartedAt, clock, players }: FocusRowProps) {
  const { t } = useLocale();
  const name = nameOf(players, id, t.common.someone);
  return (
    <div style={FOCUS_ROW} data-testid="stage-reveal-focus-row">
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
        <Avatar
          id={avatarOf(players, id)}
          size={56}
          alt={format(t.imposter.avatarAlt, { name })}
        />
        <div style={{ flexGrow: 1, minWidth: "6ch", fontSize: 20, fontWeight: 700, overflowWrap: "anywhere" }}>
          {name}
        </div>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "flex-end",
            alignItems: "center",
            gap: 6,
          }}
        >
          <TallyScratch count={total} drawn={shown} size={22} />
          <div style={{ fontSize: 18, fontWeight: 700 }}>{voteLabel(t, shown)}</div>
        </div>
      </div>
      <VoterAvatars voters={voters} shown={shown} players={players} />
      {badge === null ? null : (
        // `tilt={0}`: `Stamp`'s default -6deg tilt widens its rotated bounding box past the
        // un-rotated one -- but even un-rotated, "Imposter!" at 200% text is simply wider than
        // this focus row. `alignSelf: "stretch"` (instead of "flex-end") gives the stamp's
        // own containing block the row's real width, so `maxWidth: "100%"` below has something
        // to shrink against and the text wraps onto a second line instead of spilling past the
        // row's left edge (the row is right-to-left safe already: `justifyContent: "flex-end"`
        // keeps the stamp pinned to the name-and-tally side in both directions).
        <div
          style={{ alignSelf: "stretch", display: "flex", justifyContent: "flex-end" }}
          data-testid="stage-reveal-badge"
        >
          <SlamStamp
            live={badge.live}
            shake={badge.shake}
            size={24}
            tilt={0}
            // `--opg-marker` is 3.69:1 against this row's highlight background -- below the
            // 4.5:1 body-text floor. `--opg-marker-text` is the same ink family sized for body
            // text, but even that only clears 4.20:1 against this particular yellow, still short
            // of 4.5. `size={24}` crosses into WCAG's large-text bracket (24px, regular weight),
            // whose floor is 3:1 -- comfortably cleared by either color, so 24px is the one
            // change that actually closes the gap.
            color="var(--opg-marker-text)"
            style={{ maxWidth: "100%", whiteSpace: "normal", overflowWrap: "anywhere", textAlign: "center" }}
          >
            {badge.text}
          </SlamStamp>
        </div>
      )}
      {suspenseStartedAt === null ? null : (
        <div style={{ alignSelf: "center" }}>
          <Suspense
            startedAt={suspenseStartedAt}
            durationMs={REVEAL_TIMING.verdictMs - REVEAL_TIMING.suspenseMs}
            clock={clock}
            size={98}
            label={t.imposter.reveal.verdictIncoming}
          />
        </div>
      )}
    </div>
  );
}

interface TallyRowProps {
  id: PlayerId;
  shown: number;
  total: number;
  voters: readonly PlayerId[];
  badge: RowBadge | null;
  suspenseStartedAt: number | null;
  clock: ServerClock;
  players: PlayerSummary[];
}

function TallyRow(props: TallyRowProps) {
  const focused = props.badge !== null || props.suspenseStartedAt !== null;
  if (!focused) return <RestRow id={props.id} shown={props.shown} total={props.total} players={props.players} />;
  return <FocusRow {...props} />;
}

const CARD_STYLE: CSSProperties = {
  padding: "14px 14px 16px",
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const CAPTION: CSSProperties = {
  fontSize: 20,
  fontWeight: 700,
  textAlign: "center",
  marginTop: 4,
};

const DECOY_ROW: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  marginTop: 2,
};

/** The payoff every room gets, TV or not: what the imposter's decoy word actually was. Public
 * from the unmask beat on -- `view.decoyWord` is only ever set once the state is revealed
 * (see views.ts), so there is no secret to leak by rendering it here. */
function DecoyFooter({
  view,
  players,
}: {
  view: ImposterHostView;
  players: PlayerSummary[];
}) {
  const { t } = useLocale();
  const imposter = nameOf(players, view.imposterId, t.common.someone);
  return (
    <div style={DECOY_ROW} data-testid="stage-reveal-decoy">
      <div style={{ fontSize: 16, fontWeight: 700 }}>
        {format(t.imposter.reveal.decoyWas, { name: imposter })}
      </div>
      <Highlight style={{ padding: "0 8px" }}>
        <Marker size={22}>{view.decoyWord ?? "—"}</Marker>
      </Highlight>
    </div>
  );
}

function NextNote({
  nextReached,
  view,
  players,
}: {
  nextReached: boolean;
  view: ImposterHostView;
  players: PlayerSummary[];
}) {
  const { t } = useLocale();
  if (!nextReached) return null;
  return (
    <StickyNote tilt={-2} style={{ padding: "10px 18px", fontSize: 18, fontWeight: 700 }}>
      {nextNoteText(t, view, players)}
    </StickyNote>
  );
}

function VerdictAnnouncer({
  verdictReached,
  outcome,
  imposterId,
  players,
}: {
  verdictReached: boolean;
  outcome: RevealOutcome;
  imposterId: PlayerId | null;
  players: PlayerSummary[];
}) {
  const { t } = useLocale();
  return (
    <output aria-live="polite" style={HIDDEN}>
      {verdictReached ? verdictSentence(t, outcome, imposterId, players) : ""}
    </output>
  );
}

export interface StageRevealProps {
  view: ImposterHostView;
  players: PlayerSummary[];
  deadline: number | null;
  timerStartedAt: number | null;
  clock: ServerClock;
}

/** The stage region during the reveal: the same 12s ceremony as the TV, in one column. */
export function StageReveal(props: StageRevealProps) {
  const { t } = useLocale();
  const { view, players, clock } = props;
  const plan = useMemo(() => revealPlan(view), [view]);
  const startedAt = anchorAt(props.timerStartedAt, props.deadline, REVEAL_MS);
  const moment = useMoment(plan.beats, startedAt, clock);
  const stage = stageFromMoment(moment, plan.beats);
  const drawn = marksDrawn(plan.beats, moment);
  const verdictId = verdictTargetId(plan.outcome, view.imposterId);
  const unmaskId = unmaskTargetId(plan.outcome, view.imposterId);
  const suspenseOn = stage.suspenseReached && !stage.verdictReached && verdictId !== null;
  const suspenseStartedAt =
    startedAt === null ? null : startedAt + REVEAL_TIMING.suspenseMs;
  const caption = centerCaption(t, plan.outcome, stage.verdictReached);

  return (
    <Card variant="M" tilt={-0.6} style={CARD_STYLE}>
      {plan.roster.map((id) => (
        <TallyRow
          key={id}
          id={id}
          shown={marksForTarget(plan.order, id, drawn)}
          total={plan.tally[id]?.length ?? 0}
          voters={plan.tally[id] ?? []}
          badge={rowBadge({ t, id, stage, verdictId, unmaskId, outcome: plan.outcome })}
          suspenseStartedAt={suspenseOn && id === verdictId ? suspenseStartedAt : null}
          clock={clock}
          players={players}
        />
      ))}
      {caption === null ? null : <div style={CAPTION}>{caption}</div>}
      {stage.unmaskReached ? <DecoyFooter view={view} players={players} /> : null}
      <NextNote nextReached={stage.nextReached} view={view} players={players} />
      <VerdictAnnouncer
        verdictReached={stage.verdictReached}
        outcome={plan.outcome}
        imposterId={view.imposterId}
        players={players}
      />
    </Card>
  );
}
