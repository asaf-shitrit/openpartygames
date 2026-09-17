// Pure helpers for Most Likely To: vote tallying, outcome, scoring.
import type { PlayerId } from "@opg/protocol";
import { MIN_VOTES_FOR_PICK, POINTS_PER_MATCH, type MltOutcome } from "./state";

/** targetId -> voterIds, voters in roster order. Only targets with a vote appear. */
export function tallyVotes(
  votes: Record<PlayerId, PlayerId>,
  playerIds: readonly PlayerId[],
) {
  const tally: Record<PlayerId, PlayerId[]> = {};
  for (const voter of playerIds) {
    const target = votes[voter];
    if (target === undefined) continue;
    const voters = tally[target];
    if (voters === undefined) tally[target] = [voter];
    else voters.push(voter);
  }
  return tally;
}

/** The highest vote count(s), in roster order. Empty when nobody got a vote. */
function topVoted(
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

/**
 * Reads the tally into one of the four outcomes. A pick needs at least
 * MIN_VOTES_FOR_PICK votes, even when it is the unique leader.
 */
export function revealOutcome(
  tally: Record<PlayerId, PlayerId[]>,
  playerIds: readonly PlayerId[],
): MltOutcome {
  const leaders = topVoted(tally, playerIds);
  const only = leaders[0];
  if (only === undefined) return { kind: "no-votes" };
  const top = tally[only]?.length ?? 0;
  if (top < MIN_VOTES_FOR_PICK) return { kind: "split" };
  if (leaders.length > 1) return { kind: "tie", tiedIds: leaders };
  return { kind: "picked", pickedId: only };
}

/** The top pick id(s) for an outcome: one for `picked`, several for `tie`, none otherwise. */
export function topIdsOf(outcome: MltOutcome): PlayerId[] {
  if (outcome.kind === "picked") return [outcome.pickedId];
  if (outcome.kind === "tie") return outcome.tiedIds;
  return [];
}

/** Voters (roster order) whose vote landed on a top id. */
export function matchedVoters(
  votes: Record<PlayerId, PlayerId>,
  outcome: MltOutcome,
  playerIds: readonly PlayerId[],
): PlayerId[] {
  const topIds = new Set(topIdsOf(outcome));
  if (topIds.size === 0) return [];
  return playerIds.filter((id) => {
    const target = votes[id];
    return target !== undefined && topIds.has(target);
  });
}

/** POINTS_PER_MATCH for every matched voter, 0 for everyone else in the roster. */
export function roundPoints(
  playerIds: readonly PlayerId[],
  matchedIds: readonly PlayerId[],
) {
  const matched = new Set(matchedIds);
  const points: Record<PlayerId, number> = {};
  for (const id of playerIds) points[id] = matched.has(id) ? POINTS_PER_MATCH : 0;
  return points;
}

/** Adds `gained` into `scores`, keyed by playerId. Unknown ids in `gained` are ignored. */
export function addPoints(
  scores: Record<PlayerId, number>,
  gained: Record<PlayerId, number>,
) {
  const next = { ...scores };
  for (const id of Object.keys(gained)) {
    if (next[id] === undefined) continue;
    next[id] = (next[id] ?? 0) + (gained[id] ?? 0);
  }
  return next;
}
