// Pure beat timeline for the Doodle Bluff reveal. TV and phones share the same beats, so every
// device stages the fixed 12s moment (state.ts REVEAL_MS) off the server clock with no per-beat
// server messages. Shape follows games/most-likely-to/src/ui/reveal-timeline.ts.
import type { HapticName } from "@opg/ui";
import type { Beat, CueId, Moment } from "@opg/ui";
import { spacedBeats } from "@opg/ui";

export const REVEAL_TIMING = {
  replayMs: 0,
  titlesStartMs: 2600,
  titlesSpanMs: 3800,
  titleMaxStepMs: 900,
  truthMs: 7200,
  pointsMs: 8600,
  nextMs: 10500,
} as const;

/** Phones land their personal result this long after the TV's truth beat. */
export const PHONE_FOLLOW_MS = 200;

/**
 * TV beats: replay(0, whoosh), title-0..n (one per fake/house title, boing), truth(7200, slam),
 * points(8600, pop), next(10500, tape).
 */
export function hostRevealBeats(titleCount: number): Beat[] {
  return [
    { id: "replay", atMs: REVEAL_TIMING.replayMs, cue: "whoosh" },
    ...spacedBeats({
      prefix: "title",
      startMs: REVEAL_TIMING.titlesStartMs,
      count: titleCount,
      spanMs: REVEAL_TIMING.titlesSpanMs,
      maxStepMs: REVEAL_TIMING.titleMaxStepMs,
      cue: "boing",
    }),
    { id: "truth", atMs: REVEAL_TIMING.truthMs, cue: "slam" },
    { id: "points", atMs: REVEAL_TIMING.pointsMs, cue: "pop" },
    { id: "next", atMs: REVEAL_TIMING.nextMs, cue: "tape" },
  ];
}

/** How many of the (non-truth) titles are revealed at this moment. */
export function titlesShown(beats: readonly Beat[], moment: Moment): number {
  let index = -1;
  let shown = 0;
  for (const beat of beats) {
    index += 1;
    if (index > moment.index) break;
    if (beat.id.startsWith("title-")) shown += 1;
  }
  return shown;
}

export function truthCue(): CueId {
  return "slam";
}

export interface PersonalRevealInput {
  /** True when the viewer drew this round's drawing. */
  isArtist: boolean;
  /** The viewer's own vote, or null if they didn't vote (artist, or missed the deadline). */
  myVote: string | null;
  truthOptionId: string;
  /** Points the viewer scored this round (finder points, fooling points, or artist points). */
  myPoints: number | null;
  foundByCount: number;
}

export interface PersonalReveal {
  headline: string;
  sub: string;
  haptic: HapticName;
  celebrate: boolean;
}

function card(headline: string, sub: string, haptic: HapticName, celebrate = false): PersonalReveal {
  return { headline, sub, haptic, celebrate };
}

function artistReveal(input: PersonalRevealInput): PersonalReveal {
  const points = input.myPoints ?? 0;
  if (input.foundByCount === 0) {
    return card("Nobody found it!", "Your drawing fooled the whole room.", "soft");
  }
  return card(
    "They found you!",
    `${input.foundByCount === 1 ? "1 player" : `${input.foundByCount} players`} spotted the truth. +${points.toLocaleString("en-US")}`,
    "good",
    true,
  );
}

function voterReveal(input: PersonalRevealInput): PersonalReveal {
  if (input.myVote === null) return card("You sat this one out", "Vote next round to score.", "soft");
  const found = input.myVote === input.truthOptionId;
  const points = input.myPoints ?? 0;
  if (found) {
    return card("You found it!", `That was the real title. +${points.toLocaleString("en-US")}`, "good", true);
  }
  if (points > 0) {
    return card("You fooled someone!", `Your title caught a player out. +${points.toLocaleString("en-US")}`, "good", true);
  }
  return card("Not this time", "That title wasn't the truth.", "caught");
}

/** This device's result copy, one row of the reveal storyboard's personal column. */
export function personalReveal(input: PersonalRevealInput): PersonalReveal {
  return input.isArtist ? artistReveal(input) : voterReveal(input);
}

/**
 * Phone beats: intro(0), titles-follow-tv (titlesStartMs), personal (haptic, follows the TV's
 * truth beat by `followMs`), next(nextMs). In a no-TV room there is no TV to follow, so the
 * caller passes followMs 0: the stage and the personal line land together.
 */
export function phoneRevealBeats(haptic: HapticName, followMs: number = PHONE_FOLLOW_MS): Beat[] {
  return [
    { id: "intro", atMs: 0 },
    { id: "titles", atMs: REVEAL_TIMING.titlesStartMs },
    { id: "personal", atMs: REVEAL_TIMING.truthMs + followMs, haptic },
    { id: "next", atMs: REVEAL_TIMING.nextMs },
  ];
}
