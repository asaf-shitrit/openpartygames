// Pure beat timeline for the finale ceremony: awards, then the crown. Anchored on
// `lastResult.finishedAt`, so the TV and every phone stage the same ~25s moment off the
// server clock alone, with no per-beat server messages.
import type { PlayerId } from "@opg/protocol";
import type { Beat, CueId } from "@opg/ui";
import { CUE_IDS } from "@opg/ui";

export const FINALE_TIMING = {
  wrapMs: 0,
  firstAwardMs: 2000,
  awardStepMs: 3000,
  crownIntroAfterMs: 0,
  thirdAfterIntroMs: 3000,
  secondAfterIntroMs: 5000,
  crownAfterIntroMs: 8000,
  settleAfterIntroMs: 11000,
  drumrollMs: 3000,
} as const;

/** ms from the ceremony start to "And the crown goes to…", after every award has stamped in. */
function crownIntroAtMs(awardCount: number): number {
  return (
    FINALE_TIMING.firstAwardMs +
    awardCount * FINALE_TIMING.awardStepMs +
    FINALE_TIMING.crownIntroAfterMs
  );
}

/** "fanfare" once the kit has it, "slam" otherwise. */
export function crownCueId(): CueId {
  return CUE_IDS.includes("fanfare") ? "fanfare" : "slam";
}

export interface FinaleBeatsInput {
  awardCount: number;
  /**
   * The highest rank anyone holds (0 when nobody is ranked). A tie for first plays no
   * third or second beat, because nobody is standing at those ranks.
   */
  rankedCount: number;
  /** "fanfare" when the kit has it, "slam" otherwise. */
  crownCue: CueId;
}

function awardBeats(awardCount: number): Beat[] {
  const beats: Beat[] = [];
  for (let index = 0; index < awardCount; index += 1) {
    beats.push({
      id: `award-${index}`,
      atMs: FINALE_TIMING.firstAwardMs + index * FINALE_TIMING.awardStepMs,
      cue: "tape",
    });
  }
  return beats;
}

/**
 * Beats: wrap(0, whoosh), award-i (2000 + 3000i, tape), crown-intro (drumroll),
 * third (pop) and second (pop) when there are enough ranked players, crown (crownCue), settle.
 */
export function finaleBeats(input: FinaleBeatsInput): Beat[] {
  const crownIntroAt = crownIntroAtMs(input.awardCount);
  const beats: Beat[] = [
    { id: "wrap", atMs: FINALE_TIMING.wrapMs, cue: "whoosh" },
    ...awardBeats(input.awardCount),
    { id: "crown-intro", atMs: crownIntroAt, cue: "drumroll" },
  ];
  if (input.rankedCount >= 3) {
    beats.push({
      id: "third",
      atMs: crownIntroAt + FINALE_TIMING.thirdAfterIntroMs,
      cue: "pop",
    });
  }
  if (input.rankedCount >= 2) {
    beats.push({
      id: "second",
      atMs: crownIntroAt + FINALE_TIMING.secondAfterIntroMs,
      cue: "pop",
    });
  }
  beats.push(
    {
      id: "crown",
      atMs: crownIntroAt + FINALE_TIMING.crownAfterIntroMs,
      cue: input.crownCue,
    },
    { id: "settle", atMs: crownIntroAt + FINALE_TIMING.settleAfterIntroMs },
  );
  return beats;
}

export interface RankedPlayer {
  id: PlayerId;
  score: number;
  rank: number;
}

interface ScoredRow {
  id: PlayerId;
  score: number;
}

/** Highest score first, stable on ties (using `order`). ES2022 has no Array#toSorted. */
function sortByScore(rows: readonly ScoredRow[]): ScoredRow[] {
  const remaining = [...rows];
  const sorted: ScoredRow[] = [];
  while (remaining.length > 0) {
    const best = Math.max(...remaining.map((row) => row.score));
    const at = remaining.findIndex((row) => row.score === best);
    sorted.push(...remaining.splice(at, 1));
  }
  return sorted;
}

/** Highest score first; ties share a rank, so the next rank skips. */
export function rankPlayers(
  scores: Readonly<Record<PlayerId, number>>,
  order: readonly PlayerId[],
): RankedPlayer[] {
  const sorted = sortByScore(
    order.map((id) => ({ id, score: scores[id] ?? 0 })),
  );
  let rank = 0;
  let lastScore: number | null = null;
  return sorted.map((row, index) => {
    if (lastScore === null || row.score !== lastScore) {
      rank = index + 1;
      lastScore = row.score;
    }
    return { id: row.id, score: row.score, rank };
  });
}

/** The highest rank anyone holds, which is what decides the third and second beats. */
export function topRank(ranked: readonly RankedPlayer[]): number {
  return ranked.reduce((top, row) => Math.max(top, row.rank), 0);
}

/** "A", "A and B", "A, B and C". */
export function joinNames(names: readonly string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  const last = names.at(-1);
  const rest = names.slice(0, -1).join(", ");
  return `${rest} and ${last}`;
}

/** "Dov wins the crown!" / "Dov and Maya share the crown!" / "Dov, Maya and Sam share the crown!". */
export function crownCopy(names: readonly string[]): string | null {
  if (names.length === 0) return null;
  if (names.length === 1) return `${names[0]} wins the crown!`;
  return `${joinNames(names)} share the crown!`;
}

const TEEN_SUFFIX_RANKS = new Set([11, 12, 13]);

/** 1st, 2nd, 3rd, 4th, 11th, 12th, 13th, 21st, ... */
export function ordinal(rank: number): string {
  const rem100 = rank % 100;
  if (TEEN_SUFFIX_RANKS.has(rem100)) return `${rank}th`;
  const rem10 = rank % 10;
  if (rem10 === 1) return `${rank}st`;
  if (rem10 === 2) return `${rank}nd`;
  if (rem10 === 3) return `${rank}rd`;
  return `${rank}th`;
}
