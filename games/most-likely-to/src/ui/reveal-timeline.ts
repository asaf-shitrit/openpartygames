// Pure beat timeline for the Most Likely To reveal. TV and phones share the same beats, so every
// device stages the 12s moment off the server clock with no per-beat server messages.
import type { PlayerId } from "@opg/protocol";
import type { Beat, CueId, HapticName, Moment } from "@opg/ui";
import { spacedBeats } from "@opg/ui";
import { format } from "@opg/i18n";
import type { Dictionary } from "@opg/i18n";
import type { MltOutcome } from "../state";

export const REVEAL_TIMING = {
  tallyStartMs: 1500,
  tallySpanMs: 3600,
  tallyMaxStepMs: 450,
  suspenseMs: 5500,
  verdictMs: 8000,
  pointsMs: 9000,
  nextMs: 10500,
} as const;

/** Phones land their personal result this long after the TV's verdict. */
export const PHONE_FOLLOW_MS = 200;

export interface ScratchMark {
  targetId: PlayerId;
  voterId: PlayerId;
}

/**
 * Round-robin across playerIds order: every target's 1st voter, then every
 * target's 2nd voter, ...
 */
export function scratchOrder(
  tally: Record<PlayerId, PlayerId[]>,
  playerIds: readonly PlayerId[],
): ScratchMark[] {
  let rounds = 0;
  for (const id of playerIds) {
    rounds = Math.max(rounds, tally[id]?.length ?? 0);
  }
  const marks: ScratchMark[] = [];
  for (let round = 0; round < rounds; round += 1) {
    for (const targetId of playerIds) {
      const voterId = tally[targetId]?.[round];
      if (voterId !== undefined) marks.push({ targetId, voterId });
    }
  }
  return marks;
}

/** Players the spotlight lands on: the pick, or everyone in the tie. */
export function spotlightIds(outcome: MltOutcome): PlayerId[] {
  if (outcome.kind === "picked") return [outcome.pickedId];
  if (outcome.kind === "tie") return outcome.tiedIds;
  return [];
}

/** The verdict sting: a clear pick slams, anything else boings. */
export function verdictCue(outcome: MltOutcome): CueId {
  return outcome.kind === "picked" ? "slam" : "boing";
}

/**
 * TV beats: intro(0, whoosh), mark-0..n, suspense(5500, drumroll), verdict(8000),
 * points(9000, pop), next(10500, tape).
 */
export function hostRevealBeats(
  outcome: MltOutcome,
  markCount: number,
): Beat[] {
  return [
    { id: "intro", atMs: 0, cue: "whoosh" },
    ...spacedBeats({
      prefix: "mark",
      startMs: REVEAL_TIMING.tallyStartMs,
      count: markCount,
      spanMs: REVEAL_TIMING.tallySpanMs,
      maxStepMs: REVEAL_TIMING.tallyMaxStepMs,
      cue: "scratch",
    }),
    { id: "suspense", atMs: REVEAL_TIMING.suspenseMs, cue: "drumroll" },
    { id: "verdict", atMs: REVEAL_TIMING.verdictMs, cue: verdictCue(outcome) },
    { id: "points", atMs: REVEAL_TIMING.pointsMs, cue: "pop" },
    { id: "next", atMs: REVEAL_TIMING.nextMs, cue: "tape" },
  ];
}

/** How many marks are drawn at this moment (0 before mark-0; all once suspense is reached). */
export function marksDrawn(beats: readonly Beat[], moment: Moment): number {
  let index = -1;
  let drawn = 0;
  for (const beat of beats) {
    index += 1;
    if (index > moment.index) break;
    if (beat.id.startsWith("mark-")) drawn += 1;
  }
  return drawn;
}

/** Marks drawn for one target given the global drawn count. */
export function marksForTarget(
  order: readonly ScratchMark[],
  targetId: PlayerId,
  drawn: number,
): number {
  let count = 0;
  const limit = Math.min(Math.max(0, drawn), order.length);
  for (let index = 0; index < limit; index += 1) {
    if (order[index]?.targetId === targetId) count += 1;
  }
  return count;
}

export interface PersonalRevealInput {
  outcome: MltOutcome;
  me: PlayerId;
  myVote: PlayerId | null;
  /** Whether my vote matched a top pick. */
  matched: boolean;
  /** Display name of the pick (for "picked"), or null. */
  pickedName: string | null;
}

export interface PersonalReveal {
  headline: string;
  sub: string;
  haptic: HapticName;
  celebrate: boolean;
}

function card(
  headline: string,
  sub: string,
  haptic: HapticName,
  celebrate = false,
): PersonalReveal {
  return { headline, sub, haptic, celebrate };
}

function satOutCard(t: Dictionary): PersonalReveal {
  const p = t.mostLikelyTo.personal;
  return card(p.satOutHeadline, p.satOutSub, "soft");
}

function splitCard(t: Dictionary): PersonalReveal {
  const p = t.mostLikelyTo.personal;
  return card(p.splitHeadline, p.splitSub, "soft");
}

function pickedCard(
  t: Dictionary,
  input: PersonalRevealInput,
  pickedId: PlayerId,
): PersonalReveal {
  const p = t.mostLikelyTo.personal;
  if (pickedId === input.me) {
    return input.matched
      ? card(p.selfCalledHeadline, p.selfCalledSub, "good", true)
      : card(p.selfCaughtHeadline, p.selfCaughtSub, "caught");
  }
  const name = input.pickedName ?? t.common.someone;
  return input.matched
    ? card(p.matchedHeadline, format(p.matchedSub, { name }), "good", true)
    : card(format(p.missedHeadline, { name }), p.missedSub, "soft");
}

function tieCard(
  t: Dictionary,
  input: PersonalRevealInput,
  tiedIds: readonly PlayerId[],
): PersonalReveal {
  const p = t.mostLikelyTo.personal;
  if (input.matched) {
    return card(p.tieMatchedHeadline, p.tieMatchedSub, "good", true);
  }
  return tiedIds.includes(input.me)
    ? card(p.tieCaughtHeadline, p.tieCaughtSub, "caught")
    : card(p.tieMissedHeadline, p.tieMissedSub, "soft");
}

/** This phone's result copy, one row of the reveal storyboard's phone column. */
export function personalReveal(t: Dictionary, input: PersonalRevealInput): PersonalReveal {
  if (input.myVote === null) return satOutCard(t);
  const { outcome } = input;
  if (outcome.kind === "picked") return pickedCard(t, input, outcome.pickedId);
  if (outcome.kind === "tie") return tieCard(t, input, outcome.tiedIds);
  return splitCard(t);
}

/**
 * Phone beats: intro(0), suspense(5500), personal (haptic), next(10500). The personal beat
 * follows the TV's verdict by `followMs` (default PHONE_FOLLOW_MS) so a phone never spoils
 * the TV's beat. In a no-TV room there is no TV to follow, so the caller passes 0: the stage
 * and the personal line land together.
 */
export function phoneRevealBeats(
  haptic: HapticName,
  followMs: number = PHONE_FOLLOW_MS,
): Beat[] {
  return [
    { id: "intro", atMs: 0 },
    { id: "suspense", atMs: REVEAL_TIMING.suspenseMs },
    {
      id: "personal",
      atMs: REVEAL_TIMING.verdictMs + followMs,
      haptic,
    },
    { id: "next", atMs: REVEAL_TIMING.nextMs },
  ];
}
