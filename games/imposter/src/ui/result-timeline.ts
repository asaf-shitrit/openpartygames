// Pure beat timeline for the Imposter word result (guess reveal, points, standings).
// TV and phones share the same beats, so every device stages the moment off the server
// clock with no per-beat server messages. Mirrors reveal-timeline.ts's patterns.
import type { Beat, CueId, HapticName, Moment } from "@opg/ui";
import { beatIndexOf, formatPoints, spacedBeats } from "@opg/ui";

export const RESULT_TIMING = {
  caught: {
    drumMs: 0,
    lettersMs: 1500,
    lettersSpanMs: 1800,
    letterMaxStepMs: 140,
    verdictMs: 3500,
    wordMs: 4500,
    pointsMs: 5500,
    countMs: 7000,
    reorderMs: 8500,
    settleMs: 10000,
  },
  escaped: {
    wordMs: 0,
    pointsMs: 1000,
    countMs: 2500,
    reorderMs: 4000,
    settleMs: 5500,
  },
} as const;

/** Phones land their personal result this long after the TV's big beat. */
const PHONE_FOLLOW_MS = 200;

export type ResultPath = "caught" | "escaped" | "cancelled";

/** `caught === true` -> caught, `false` -> escaped, `null` (cancelled word) -> cancelled. */
export function resultPath(caught: boolean | null): ResultPath {
  if (caught === true) return "caught";
  if (caught === false) return "escaped";
  return "cancelled";
}

/** The verdict sting: a landed steal slams, a miss buzzes. */
function verdictCue(guessCorrect: boolean | null): CueId {
  return guessCorrect === true ? "slam" : "buzzer";
}

function cancelledBeats(): Beat[] {
  return [{ id: "settle", atMs: 0 }];
}

function escapedBeats(): Beat[] {
  const t = RESULT_TIMING.escaped;
  return [
    { id: "word", atMs: t.wordMs, cue: "sneak" },
    { id: "points", atMs: t.pointsMs, cue: "pop" },
    { id: "count", atMs: t.countMs },
    { id: "reorder", atMs: t.reorderMs, cue: "whoosh" },
    { id: "settle", atMs: t.settleMs },
  ];
}

function caughtBeats(guessCorrect: boolean | null, guessLetters: number): Beat[] {
  const t = RESULT_TIMING.caught;
  return [
    { id: "drum", atMs: t.drumMs, cue: "drumroll" },
    ...spacedBeats({
      prefix: "letter",
      startMs: t.lettersMs,
      count: guessLetters,
      spanMs: t.lettersSpanMs,
      maxStepMs: t.letterMaxStepMs,
      cue: "tick",
    }),
    { id: "verdict", atMs: t.verdictMs, cue: verdictCue(guessCorrect) },
    { id: "word", atMs: t.wordMs, cue: "marker" },
    { id: "points", atMs: t.pointsMs, cue: "pop" },
    { id: "count", atMs: t.countMs },
    { id: "reorder", atMs: t.reorderMs, cue: "whoosh" },
    { id: "settle", atMs: t.settleMs },
  ];
}

/**
 * TV beats. caught: drum, letter-0..n, verdict, word, points, count, reorder, settle.
 * escaped: word, points, count, reorder, settle. cancelled: settle only.
 */
export function hostResultBeats(
  path: ResultPath,
  guessCorrect: boolean | null,
  guessLetters: number,
): Beat[] {
  if (path === "cancelled") return cancelledBeats();
  if (path === "escaped") return escapedBeats();
  return caughtBeats(guessCorrect, guessLetters);
}

/** Letters face up at this moment: 0 before letter-0, all of them from the verdict beat on. */
export function lettersRevealed(beats: readonly Beat[], moment: Moment): number {
  const total = beats.filter((beat) => beat.id.startsWith("letter-")).length;
  if (total === 0 || moment.index < 0) return 0;
  const verdictIndex = beatIndexOf(beats, "verdict");
  if (verdictIndex >= 0 && moment.index >= verdictIndex) return total;
  let count = 0;
  let index = -1;
  for (const beat of beats) {
    index += 1;
    if (index > moment.index) break;
    if (beat.id.startsWith("letter-")) count += 1;
  }
  return count;
}

export interface PersonalResult {
  headline: string;
  sub: string;
  haptic: HapticName;
  celebrate: boolean;
}

export interface PersonalResultInput {
  path: ResultPath;
  isImposter: boolean;
  votedImposter: boolean;
  guessCorrect: boolean | null;
  myPoints: number;
  crewWord: string | null;
}

/** myPoints when it is positive and differs from the table amount; the table amount otherwise. */
function amountText(tableAmount: number, myPoints: number): string {
  const value = myPoints > 0 && myPoints !== tableAmount ? myPoints : tableAmount;
  return formatPoints(value);
}

function cancelledResult(): PersonalResult {
  return {
    headline: "Word cancelled",
    sub: "No points this word.",
    haptic: "soft",
    celebrate: false,
  };
}

function escapedResult(input: PersonalResultInput): PersonalResult {
  if (input.isImposter) {
    return {
      headline: "You slipped away!",
      sub: `+${amountText(1000, input.myPoints)} for you.`,
      haptic: "good",
      celebrate: true,
    };
  }
  return {
    headline: "The imposter got away",
    sub: "0 this word.",
    haptic: "soft",
    celebrate: false,
  };
}

function caughtImposterResult(input: PersonalResultInput): PersonalResult {
  if (input.guessCorrect === true) {
    return {
      headline: "You stole the word!",
      sub: `+${amountText(1000, input.myPoints)} for you.`,
      haptic: "good",
      celebrate: true,
    };
  }
  return {
    headline: "So close!",
    sub: `The word was ${input.crewWord ?? "—"}.`,
    haptic: "soft",
    celebrate: false,
  };
}

function caughtCrewResult(input: PersonalResultInput): PersonalResult {
  if (input.guessCorrect === true) {
    return { headline: "They stole it!", sub: "0 this word.", haptic: "soft", celebrate: false };
  }
  if (input.votedImposter) {
    return {
      headline: "Nice spotting!",
      sub: `+${amountText(500, input.myPoints)} for you.`,
      haptic: "good",
      celebrate: true,
    };
  }
  return {
    headline: "Caught without you",
    sub: "0 this word.",
    haptic: "soft",
    celebrate: false,
  };
}

/** This phone's result copy, one row of the result storyboard's phone column. */
export function personalResult(input: PersonalResultInput): PersonalResult {
  if (input.path === "cancelled") return cancelledResult();
  if (input.path === "escaped") return escapedResult(input);
  if (input.isImposter) return caughtImposterResult(input);
  return caughtCrewResult(input);
}

function cancelledPhoneBeats(haptic: HapticName): Beat[] {
  return [{ id: "personal", atMs: 0, haptic }];
}

function caughtPhoneBeats(haptic: HapticName): Beat[] {
  const t = RESULT_TIMING.caught;
  return [
    { id: "drum", atMs: 0 },
    { id: "personal", atMs: t.verdictMs + PHONE_FOLLOW_MS, haptic },
    { id: "count", atMs: t.countMs },
    { id: "settle", atMs: t.settleMs },
  ];
}

function escapedPhoneBeats(haptic: HapticName): Beat[] {
  const t = RESULT_TIMING.escaped;
  return [
    { id: "personal", atMs: t.pointsMs + PHONE_FOLLOW_MS, haptic },
    { id: "count", atMs: t.countMs },
    { id: "settle", atMs: t.settleMs },
  ];
}

/**
 * Phone beats: caught -> drum(0), personal(verdictMs + 200, haptic), count(countMs), settle(settleMs);
 * escaped -> personal(pointsMs + 200, haptic), count(countMs), settle(settleMs); cancelled -> personal(0, haptic).
 */
export function phoneResultBeats(path: ResultPath, haptic: HapticName): Beat[] {
  if (path === "cancelled") return cancelledPhoneBeats(haptic);
  if (path === "escaped") return escapedPhoneBeats(haptic);
  return caughtPhoneBeats(haptic);
}

/** Standings ids sorted by score desc, ties broken by playerIds order (a stable insertion). */
export function standingsOrder(
  playerIds: readonly string[],
  totals: Readonly<Record<string, number>>,
): string[] {
  const order: string[] = [];
  for (const id of playerIds) {
    const score = totals[id] ?? 0;
    const at = order.findIndex((other) => (totals[other] ?? 0) < score);
    if (at === -1) order.push(id);
    else order.splice(at, 0, id);
  }
  return order;
}

/** totals minus this word's points, never below 0. */
export function previousTotals(
  totals: Readonly<Record<string, number>>,
  points: Readonly<Record<string, number>> | null,
) {
  return Object.fromEntries(
    Object.entries(totals).map(([id, total]) => [
      id,
      Math.max(0, total - (points?.[id] ?? 0)),
    ]),
  );
}
