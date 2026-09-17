// Pure beat timeline for the Most Likely To reveal. TV and phones share the same beats, so every
// device stages the 12s moment off the server clock with no per-beat server messages.
import type { PlayerId } from "@opg/protocol";
import type { Beat, CueId, HapticName, Moment } from "@opg/ui";
import { spacedBeats } from "@opg/ui";
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

const SAT_OUT = card("You sat this one out", "Vote next round to score.", "soft");
const SPLIT_CARD = card(
  "No clear pick",
  "Nobody got 2 votes. No points this time.",
  "soft",
);

function pickedCard(
  input: PersonalRevealInput,
  pickedId: PlayerId,
): PersonalReveal {
  if (pickedId === input.me) {
    return input.matched
      ? card("You called it on yourself!", "+500. Own it.", "good", true)
      : card("The room picked you!", "Time to explain yourself.", "caught");
  }
  const name = input.pickedName ?? "Someone";
  return input.matched
    ? card("You read the room!", `+500. It's ${name}.`, "good", true)
    : card(`The room picked ${name}`, "Your vote went another way.", "soft");
}

function tieCard(
  input: PersonalRevealInput,
  tiedIds: readonly PlayerId[],
): PersonalReveal {
  if (input.matched) {
    return card("You backed a winner!", "+500. It's a tie.", "good", true);
  }
  return tiedIds.includes(input.me)
    ? card("You're in the tie!", "Explain yourself.", "caught")
    : card("It's a tie", "Your vote went another way.", "soft");
}

/** This phone's result copy, one row of the reveal storyboard's phone column. */
export function personalReveal(input: PersonalRevealInput): PersonalReveal {
  if (input.myVote === null) return SAT_OUT;
  const { outcome } = input;
  if (outcome.kind === "picked") return pickedCard(input, outcome.pickedId);
  if (outcome.kind === "tie") return tieCard(input, outcome.tiedIds);
  return SPLIT_CARD;
}

/**
 * Phone beats: intro(0), suspense(5500), personal (200ms after the TV's verdict,
 * with haptic), next(10500).
 */
export function phoneRevealBeats(haptic: HapticName): Beat[] {
  return [
    { id: "intro", atMs: 0 },
    { id: "suspense", atMs: REVEAL_TIMING.suspenseMs },
    {
      id: "personal",
      atMs: REVEAL_TIMING.verdictMs + PHONE_FOLLOW_MS,
      haptic,
    },
    { id: "next", atMs: REVEAL_TIMING.nextMs },
  ];
}
