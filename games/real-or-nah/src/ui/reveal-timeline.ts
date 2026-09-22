// Pure beat timeline for the Real or Nah reveal. TV and phones share the same segment plan
// (see ../reveal-plan), so every device stages the same lie-by-lie moment off the server clock
// with no per-beat server messages.
import type { PlayerId } from "@opg/protocol";
import type { Beat, HapticName, Moment } from "@opg/ui";
import { reached } from "@opg/ui";
import { format, joinNamesAnd } from "@opg/i18n";
import { placeFor } from "@opg/i18n";
import type { Dictionary } from "@opg/i18n";
import type { RevealSegment } from "../reveal-plan";
import type { RonReveal } from "../types";

/** A card lands this long after the TV beat it follows. */
export const CARD_FOLLOW_MS = 200;

// ---------- Beats ----------

function introBeats(segment: RevealSegment): Beat[] {
  return [{ id: "intro", atMs: segment.atMs, cue: "whoosh" }];
}

function dudsBeats(segment: RevealSegment): Beat[] {
  return [{ id: "duds", atMs: segment.atMs, cue: "tape" }];
}

function lieBeats(segment: RevealSegment, index: number): Beat[] {
  const d = segment.durationMs;
  return [
    { id: `lie-${index}-in`, atMs: segment.atMs, cue: "whoosh" },
    {
      id: `lie-${index}-fooled`,
      atMs: Math.round(segment.atMs + 0.17 * d),
      cue: "pop",
    },
    {
      id: `lie-${index}-author`,
      atMs: Math.round(segment.atMs + 0.5 * d),
      cue: "slam",
    },
    {
      id: `lie-${index}-points`,
      atMs: Math.round(segment.atMs + 0.7 * d),
      cue: "boing",
    },
  ];
}

function truthBeats(segment: RevealSegment): Beat[] {
  const d = segment.durationMs;
  return [
    { id: "truth-in", atMs: segment.atMs, cue: "drumroll" },
    {
      id: "truth-real",
      atMs: Math.round(segment.atMs + 0.3 * d),
      cue: "slam",
    },
    {
      id: "truth-finders",
      atMs: Math.round(segment.atMs + 0.45 * d),
      cue: "pop",
    },
  ];
}

function standingsBeats(segment: RevealSegment): Beat[] {
  const d = segment.durationMs;
  return [
    { id: "standings-in", atMs: segment.atMs, cue: "whoosh" },
    { id: "standings-count", atMs: Math.round(segment.atMs + 0.2 * d) },
    {
      id: "standings-reorder",
      atMs: Math.round(segment.atMs + 0.6 * d),
      cue: "whoosh",
    },
  ];
}

/** Beats for one segment; `lieIndex` counts only the "lie" segments seen so far. */
function beatsForSegment(segment: RevealSegment, lieIndex: number): Beat[] {
  if (segment.kind === "intro") return introBeats(segment);
  if (segment.kind === "duds") return dudsBeats(segment);
  if (segment.kind === "lie") return lieBeats(segment, lieIndex);
  if (segment.kind === "truth") return truthBeats(segment);
  return standingsBeats(segment);
}

/** All beats for the reveal, in play order (segments are already sorted by atMs). */
export function hostRevealBeats(segments: readonly RevealSegment[]): Beat[] {
  const beats: Beat[] = [];
  let lieIndex = 0;
  for (const segment of segments) {
    beats.push(...beatsForSegment(segment, lieIndex));
    if (segment.kind === "lie") lieIndex += 1;
  }
  return beats;
}

// ---------- Progress ----------

function isLive(moment: Moment, id: string): boolean {
  return moment.live && moment.beatId === id;
}

export interface LieProgress {
  optionId: string;
  index: number;
  /** The card has slid onto the stage. */
  shown: boolean;
  /** The fooled players' avatars have popped on. */
  fooledShown: boolean;
  /** The card has flipped to show its author. */
  flipped: boolean;
  /** The points chip (and callout, if any) has landed. */
  pointsShown: boolean;
  live: {
    in: boolean;
    fooled: boolean;
    author: boolean;
    points: boolean;
  };
}

function lieProgressFor(
  beats: readonly Beat[],
  moment: Moment,
  optionId: string,
  index: number,
): LieProgress {
  const inId = `lie-${index}-in`;
  const fooledId = `lie-${index}-fooled`;
  const authorId = `lie-${index}-author`;
  const pointsId = `lie-${index}-points`;
  return {
    optionId,
    index,
    shown: reached(moment, beats, inId),
    fooledShown: reached(moment, beats, fooledId),
    flipped: reached(moment, beats, authorId),
    pointsShown: reached(moment, beats, pointsId),
    live: {
      in: isLive(moment, inId),
      fooled: isLive(moment, fooledId),
      author: isLive(moment, authorId),
      points: isLive(moment, pointsId),
    },
  };
}

export interface RevealProgress {
  introLive: boolean;
  dudsShown: boolean;
  dudsLive: boolean;
  lies: LieProgress[];
  truthShown: boolean;
  truthStamped: boolean;
  truthStampedLive: boolean;
  truthFindersShown: boolean;
  truthFindersLive: boolean;
  standingsShown: boolean;
  standingsCountReached: boolean;
  standingsCountLive: boolean;
  standingsReorderReached: boolean;
  standingsReorderLive: boolean;
}

/**
 * Which lies are shown or flipped, whether duds/truth/standings are on stage, and
 * whether the truth has been stamped yet. Everything a HostReveal render needs.
 */
export function revealProgress(
  segments: readonly RevealSegment[],
  beats: readonly Beat[],
  moment: Moment,
): RevealProgress {
  let lieIndex = 0;
  const lies: LieProgress[] = [];
  for (const segment of segments) {
    if (segment.kind !== "lie") continue;
    lies.push(lieProgressFor(beats, moment, segment.optionId ?? "", lieIndex));
    lieIndex += 1;
  }
  return {
    introLive: isLive(moment, "intro"),
    dudsShown: reached(moment, beats, "duds"),
    dudsLive: isLive(moment, "duds"),
    lies,
    truthShown: reached(moment, beats, "truth-in"),
    truthStamped: reached(moment, beats, "truth-real"),
    truthStampedLive: isLive(moment, "truth-real"),
    truthFindersShown: reached(moment, beats, "truth-finders"),
    truthFindersLive: isLive(moment, "truth-finders"),
    standingsShown: reached(moment, beats, "standings-in"),
    standingsCountReached: reached(moment, beats, "standings-count"),
    standingsCountLive: isLive(moment, "standings-count"),
    standingsReorderReached: reached(moment, beats, "standings-reorder"),
    standingsReorderLive: isLive(moment, "standings-reorder"),
  };
}

// ---------- Personal cards (phone) ----------

export interface PersonalCard {
  id: string;
  atMs: number;
  headline: string;
  sub: string;
  /** Omitted for the one row of the storyboard with no haptic (the standings card). */
  haptic?: HapticName;
  celebrate: boolean;
}

export interface PersonalRevealInput {
  segments: readonly RevealSegment[];
  reveal: RonReveal;
  me: PlayerId;
  /** Display names by player id, resolved by the caller. */
  names: Record<PlayerId, string>;
  /** This player's rank (1-based) once standings are counted. */
  standingsOrdinal: number;
  myPointsThisFact: number;
}

function beatAtMs(beats: readonly Beat[], id: string): number {
  return beats.find((beat) => beat.id === id)?.atMs ?? 0;
}

/** Index of the lie segment with this optionId among "lie" segments, or -1. */
function lieIndexOf(
  segments: readonly RevealSegment[],
  optionId: string,
): number {
  let index = -1;
  for (const segment of segments) {
    if (segment.kind !== "lie") continue;
    index += 1;
    if (segment.optionId === optionId) return index;
  }
  return -1;
}

function dudsCard(
  t: Dictionary,
  input: PersonalRevealInput,
  beats: readonly Beat[],
): PersonalCard | null {
  const myLie = input.reveal.lies.find((lie) => lie.authorId === input.me);
  if (myLie === undefined || myLie.fooledIds.length > 0) return null;
  const p = t.realOrNah.personal;
  return {
    id: "duds",
    atMs: beatAtMs(beats, "duds"),
    headline: p.dudsHeadline,
    sub: p.dudsSub,
    haptic: "soft",
    celebrate: false,
  };
}

function fooledByCard(
  t: Dictionary,
  input: PersonalRevealInput,
  beats: readonly Beat[],
): PersonalCard | null {
  const lie = input.reveal.lies.find((l) => l.fooledIds.includes(input.me));
  if (lie === undefined) return null;
  const index = lieIndexOf(input.segments, lie.optionId);
  if (index < 0) return null;
  const author = input.names[lie.authorId ?? ""] ?? t.common.someone;
  const p = t.realOrNah.personal;
  return {
    id: "fooled-by",
    atMs: beatAtMs(beats, `lie-${index}-fooled`) + CARD_FOLLOW_MS,
    headline: format(p.fooledByHeadline, { author }),
    sub: format(p.fooledBySub, { text: lie.text }),
    haptic: "soft",
    celebrate: false,
  };
}

function authorFooledCard(
  t: Dictionary,
  input: PersonalRevealInput,
  beats: readonly Beat[],
): PersonalCard | null {
  const lie = input.reveal.lies.find(
    (l) => l.authorId === input.me && l.fooledIds.length > 0,
  );
  if (lie === undefined) return null;
  const index = lieIndexOf(input.segments, lie.optionId);
  if (index < 0) return null;
  const names = lie.fooledIds.map((id) => input.names[id] ?? t.common.someone);
  const p = t.realOrNah.personal;
  return {
    id: "author-fooled",
    atMs: beatAtMs(beats, `lie-${index}-author`) + CARD_FOLLOW_MS,
    headline: format(p.authorFooledHeadline, { names: joinNamesAnd(t.common, names) }),
    sub: format(p.authorFooledSub, { points: lie.points.toLocaleString("en-US") }),
    haptic: "good",
    celebrate: true,
  };
}

function truthCard(
  t: Dictionary,
  input: PersonalRevealInput,
  beats: readonly Beat[],
): PersonalCard {
  const atMs = beatAtMs(beats, "truth-real") + CARD_FOLLOW_MS;
  const p = t.realOrNah.personal;
  if (input.reveal.foundByIds.includes(input.me)) {
    return {
      id: "truth-found",
      atMs,
      headline: p.truthFoundHeadline,
      sub: format(p.truthFoundSub, { points: "1,000" }),
      haptic: "good",
      celebrate: true,
    };
  }
  return {
    id: "truth-missed",
    atMs,
    headline: format(p.truthMissedHeadline, { answer: input.reveal.answer }),
    sub: "",
    haptic: "soft",
    celebrate: false,
  };
}

/** "3rd" in English; Hebrew names a place by number alone, so this is a no-op there. */
function standingsCard(
  t: Dictionary,
  input: PersonalRevealInput,
  beats: readonly Beat[],
): PersonalCard {
  const atMs = beatAtMs(beats, "standings-count") + CARD_FOLLOW_MS;
  const points = input.myPointsThisFact;
  const sign = points >= 0 ? "+" : "";
  const p = t.realOrNah.personal;
  return {
    id: "standings",
    atMs,
    headline: format(p.standingsHeadline, {
      place: placeFor(t, input.standingsOrdinal),
    }),
    sub: format(p.standingsSub, { sign, points: points.toLocaleString("en-US") }),
    celebrate: false,
  };
}

/** This phone's stack of result cards, in the order they land. */
export function personalRevealCards(
  t: Dictionary,
  input: PersonalRevealInput,
): PersonalCard[] {
  const beats = hostRevealBeats(input.segments);
  const cards = [
    dudsCard(t, input, beats),
    fooledByCard(t, input, beats),
    authorFooledCard(t, input, beats),
    truthCard(t, input, beats),
    standingsCard(t, input, beats),
  ];
  return cards.filter((card): card is PersonalCard => card !== null);
}

/** A phone-local beat per card, so useMoment can stage the +200ms follow lands. */
export function personalCardBeats(cards: readonly PersonalCard[]): Beat[] {
  return cards.map((card) => {
    const beat: Beat = { id: card.id, atMs: card.atMs };
    if (card.haptic !== undefined) beat.haptic = card.haptic;
    return beat;
  });
}

// ---------- Callout ----------

/** "Fooled everyone!" (>=2 voters, all fooled), "Fooled N people!" (>=3), else null. */
export function callout(t: Dictionary, fooledCount: number, voterCount: number): string | null {
  if (fooledCount >= 2 && fooledCount === voterCount) return t.realOrNah.calloutEveryone;
  if (fooledCount >= 3) return format(t.realOrNah.calloutCount, { count: fooledCount });
  return null;
}
