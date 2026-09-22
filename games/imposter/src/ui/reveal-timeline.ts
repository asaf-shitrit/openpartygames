// Pure beat timeline for the Imposter reveal. TV and phones share the same beats, so every
// device stages the 12s moment off the server clock with no per-beat server messages.
import type { PlayerId } from "@opg/protocol";
import type { Beat, CueId, HapticName, Moment } from "@opg/ui";
import { spacedBeats } from "@opg/ui";
import { format } from "@opg/i18n";
import type { Dictionary } from "@opg/i18n";
import type { RevealOutcome } from "../rules";

export const REVEAL_TIMING = {
  tallyStartMs: 1500,
  tallySpanMs: 3600,
  tallyMaxStepMs: 450,
  suspenseMs: 5500,
  verdictMs: 8000,
  unmaskMs: 9000,
  nextMs: 10500,
} as const;

/** Phones land their personal result this long after the TV's big beat. */
export const PHONE_FOLLOW_MS = 200;

export interface ScratchMark {
  targetId: PlayerId;
  voterId: PlayerId;
}

/** Round-robin across playerIds order: every target's 1st voter, then every target's 2nd voter, ... */
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

/** The verdict sting: a clean catch slams, a wrong accusation buzzes, everything else boings. */
function verdictCue(outcome: RevealOutcome): CueId {
  if (outcome.kind === "caught") return "slam";
  if (outcome.kind === "wrong") return "buzzer";
  return "boing";
}

/** The unmask sting: the marker for a catch, a sneaky tiptoe otherwise. */
function unmaskCue(outcome: RevealOutcome): CueId {
  return outcome.kind === "caught" ? "marker" : "sneak";
}

/** TV beats: intro(0, whoosh), mark-0..n, suspense(5500, drumroll), verdict(8000), unmask(9000), next(10500, tape). */
export function hostRevealBeats(
  outcome: RevealOutcome,
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
    {
      id: "verdict",
      atMs: REVEAL_TIMING.verdictMs,
      cue: verdictCue(outcome),
    },
    { id: "unmask", atMs: REVEAL_TIMING.unmaskMs, cue: unmaskCue(outcome) },
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

/** How this phone's owner relates to the reveal. spotter = my vote was the imposter. */
export type RevealRole = "imposter" | "spotter" | "crew";

export function revealRole(
  imposterId: PlayerId | null,
  me: PlayerId,
  myVote: PlayerId | null,
): RevealRole {
  if (imposterId !== null && imposterId === me) return "imposter";
  if (imposterId !== null && myVote === imposterId) return "spotter";
  return "crew";
}

export interface PersonalReveal {
  headline: string;
  sub: string;
  haptic: HapticName;
  celebrate: boolean;
}

/** This phone's result copy, one row of the reveal storyboard's phone column. */
export function personalReveal(
  t: Dictionary,
  caught: boolean,
  role: RevealRole,
  imposterName: string,
): PersonalReveal {
  const r = t.imposter.reveal;
  if (caught) {
    if (role === "imposter") {
      return {
        headline: r.caughtHeadline,
        sub: r.caughtSub,
        haptic: "caught",
        celebrate: false,
      };
    }
    if (role === "spotter") {
      return {
        headline: format(r.spottedHeadline, { name: imposterName }),
        sub: r.spottedSub,
        haptic: "good",
        celebrate: true,
      };
    }
    return {
      headline: format(r.crewCaughtHeadline, { name: imposterName }),
      sub: r.crewCaughtSub,
      haptic: "soft",
      celebrate: false,
    };
  }
  if (role === "imposter") {
    return {
      headline: r.escapedHeadline,
      sub: r.escapedSub,
      haptic: "good",
      celebrate: true,
    };
  }
  if (role === "spotter") {
    return {
      headline: format(r.spotterEscapedHeadline, { name: imposterName }),
      sub: r.spotterEscapedSub,
      haptic: "soft",
      celebrate: false,
    };
  }
  return {
    headline: format(r.crewEscapedHeadline, { name: imposterName }),
    sub: r.crewEscapedSub,
    haptic: "soft",
    celebrate: false,
  };
}

/**
 * Phone beats: intro(0), suspense(5500), personal (haptic), next(10500). The personal beat
 * follows the TV's big beat by `followMs` (default PHONE_FOLLOW_MS) so a phone never spoils
 * the TV's beat. In a no-TV room there is no TV to follow, so the caller passes 0: the stage
 * and the personal line land together.
 */
export function phoneRevealBeats(
  caught: boolean,
  haptic: HapticName,
  followMs: number = PHONE_FOLLOW_MS,
): Beat[] {
  const tvMs = caught ? REVEAL_TIMING.verdictMs : REVEAL_TIMING.unmaskMs;
  return [
    { id: "intro", atMs: 0 },
    { id: "suspense", atMs: REVEAL_TIMING.suspenseMs },
    { id: "personal", atMs: tvMs + followMs, haptic },
    { id: "next", atMs: REVEAL_TIMING.nextMs },
  ];
}
