// Pure helpers for the Imposter game: answer normalization, vote tallying, scoring.
import type { PlayerId } from "@opg/protocol";
import type { ImposterWord } from "./state";
import { POINTS_PER_CORRECT_VOTE, POINTS_PER_WORD } from "./state";

export { normalizeAnswer } from "@opg/sdk";

/** targetId -> voters. */
export function tallyVotes(votes: Record<PlayerId, PlayerId>) {
  const tally: Record<PlayerId, PlayerId[]> = {};
  for (const voter of Object.keys(votes)) {
    const target = votes[voter];
    if (target === undefined) continue;
    const voters = tally[target];
    if (voters === undefined) tally[target] = [voter];
    else voters.push(voter);
  }
  return tally;
}

/** Player ids with the highest non-zero vote count, in playerIds order. Empty when nobody got a vote. */
export function topVoted(
  tally: Record<PlayerId, PlayerId[]>,
  playerIds: readonly PlayerId[],
): PlayerId[] {
  let top = 0;
  let leaders: PlayerId[] = [];
  for (const id of playerIds) {
    const count = tally[id]?.length ?? 0;
    if (count === 0) continue;
    if (count > top) {
      top = count;
      leaders = [id];
    } else if (count === top) {
      leaders.push(id);
    }
  }
  return leaders;
}

/** Caught = exactly one unique top vote-getter, and that player is the imposter. */
export function isCaught(
  tally: Record<PlayerId, PlayerId[]>,
  imposterId: PlayerId,
  playerIds: readonly PlayerId[],
): boolean {
  const leaders = topVoted(tally, playerIds);
  return leaders.length === 1 && leaders[0] === imposterId;
}

/** What the votes decided, once the reveal starts. A tie is never "caught". */
export type RevealOutcome =
  | { kind: "caught" }
  | { kind: "wrong"; accusedId: PlayerId }
  | { kind: "tie"; tiedIds: PlayerId[] }
  | { kind: "no-votes" };

/** Reads the tally into one of the four reveal outcomes. */
export function revealOutcome(
  tally: Record<PlayerId, PlayerId[]>,
  imposterId: PlayerId | null,
  playerIds: readonly PlayerId[],
): RevealOutcome {
  const leaders = topVoted(tally, playerIds);
  const only = leaders[0];
  if (only === undefined) return { kind: "no-votes" };
  if (leaders.length > 1) return { kind: "tie", tiedIds: leaders };
  if (only === imposterId) return { kind: "caught" };
  return { kind: "wrong", accusedId: only };
}

/** How the current word ended, as far as scoring cares. */
export interface WordOutcome {
  caught: boolean | null;
  guessCorrect: boolean | null;
}

/**
 * Points for the current word. Not caught -> imposter +1000.
 * Caught with a right guess -> imposter +1000. Caught with a wrong/missing guess ->
 * every imposter voter +500.
 */
/** One entry per player currently on the roster, all on zero. */
function zeroPoints(playerIds: readonly PlayerId[]) {
  const points: Record<PlayerId, number> = {};
  for (const id of playerIds) points[id] = 0;
  return points;
}

/** True when the word went the imposter's way: never caught, or caught but guessed right. */
function imposterWon(outcome: WordOutcome): boolean {
  return outcome.caught !== true || outcome.guessCorrect === true;
}

/**
 * Awards, but only to someone still in the room.
 *
 * `points` starts as one entry per current player, so an id missing from it is one the room
 * has already removed — and writing to it would put that player back into `scores`. That is
 * reachable for the imposter as well as for a voter: a word can now be resolved after the
 * imposter has been kicked, rather than cancelled.
 */
function award(
  points: Record<PlayerId, number>,
  id: PlayerId,
  amount: number,
): void {
  if (points[id] === undefined) return;
  points[id] = amount;
}

export function scoreWord(
  word: ImposterWord,
  outcome: WordOutcome,
  tally: Record<PlayerId, PlayerId[]>,
  playerIds: readonly PlayerId[],
) {
  const points = zeroPoints(playerIds);
  if (imposterWon(outcome)) {
    award(points, word.imposterId, POINTS_PER_WORD);
    return points;
  }
  for (const voter of tally[word.imposterId] ?? []) {
    award(points, voter, POINTS_PER_CORRECT_VOTE);
  }
  return points;
}
