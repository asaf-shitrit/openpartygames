// End-of-game awards for Most Likely To. Pure and deterministic: derived only
// from state.history (one entry per completed round) and the current roster.
import type { Award, PlayerId } from "@opg/protocol";
import { MAX_AWARDS } from "@opg/protocol";
import type { MltRoundRecord, MltState } from "./state";

const MAIN_CHARACTER_THRESHOLD = 3;
const CROWD_READER_THRESHOLD = 3;
const OWNS_IT_THRESHOLD = 2;
const WILD_CARD_THRESHOLD = 3;

/** The award for the top count(s) at or above threshold, or null when nobody qualifies. */
function topAward(
  id: string,
  counts: Record<PlayerId, number>,
  threshold: number,
): Award | null {
  let top = 0;
  let leaders: PlayerId[] = [];
  for (const playerId of Object.keys(counts)) {
    const value = counts[playerId] ?? 0;
    if (value < threshold) continue;
    if (value > top) {
      top = value;
      leaders = [playerId];
    } else if (value === top) {
      leaders.push(playerId);
    }
  }
  return leaders.length > 0 ? { id, playerIds: leaders, value: top } : null;
}

function bump(counts: Record<PlayerId, number>, playerId: PlayerId): void {
  counts[playerId] = (counts[playerId] ?? 0) + 1;
}

/**
 * How many votes each player received from players still in the roster. A kicked
 * player's old votes stop counting, the same way their own awards do.
 */
function tallyMainCharacter(
  history: readonly MltRoundRecord[],
  roster: ReadonlySet<PlayerId>,
) {
  const counts: Record<PlayerId, number> = {};
  for (const record of history) {
    for (const [voter, target] of Object.entries(record.votes)) {
      if (!roster.has(voter) || !roster.has(target)) continue;
      bump(counts, target);
    }
  }
  return counts;
}

/** How many rounds each player's vote matched a top pick. */
function tallyCrowdReader(
  history: readonly MltRoundRecord[],
  roster: ReadonlySet<PlayerId>,
) {
  const counts: Record<PlayerId, number> = {};
  for (const record of history) {
    for (const voter of record.matchedIds) {
      if (!roster.has(voter)) continue;
      bump(counts, voter);
    }
  }
  return counts;
}

/** How many times each player voted for themselves. */
function tallyOwnsIt(
  history: readonly MltRoundRecord[],
  roster: ReadonlySet<PlayerId>,
) {
  const counts: Record<PlayerId, number> = {};
  for (const record of history) {
    for (const voter of Object.keys(record.votes)) {
      if (!roster.has(voter)) continue;
      if (record.votes[voter] === voter) bump(counts, voter);
    }
  }
  return counts;
}

/** How many votes each target got in one round. */
function targetCountsOf(votes: Record<PlayerId, PlayerId>) {
  const counts: Record<PlayerId, number> = {};
  for (const target of Object.values(votes)) bump(counts, target);
  return counts;
}

/** Bumps every lone-vote-for-someone-else in one round into `counts`. */
function bumpWildCardVoters(
  record: MltRoundRecord,
  roster: ReadonlySet<PlayerId>,
  counts: Record<PlayerId, number>,
): void {
  const targetCounts = targetCountsOf(record.votes);
  for (const [voter, target] of Object.entries(record.votes)) {
    if (!roster.has(voter) || target === voter) continue;
    if (targetCounts[target] === 1) bump(counts, voter);
  }
}

/**
 * How many times each player cast a lone vote for someone else: their target
 * got exactly 1 vote that round, and the target is not the voter.
 */
function tallyWildCard(
  history: readonly MltRoundRecord[],
  roster: ReadonlySet<PlayerId>,
) {
  const counts: Record<PlayerId, number> = {};
  for (const record of history) bumpWildCardVoters(record, roster, counts);
  return counts;
}

/** Best first, capped at MAX_AWARDS like every award list the platform draws. */
export function mostLikelyToAwards(state: MltState): Award[] {
  const history = state.history ?? [];
  const roster = new Set(state.playerIds);
  const mainCharacter = tallyMainCharacter(history, roster);
  const crowdReader = tallyCrowdReader(history, roster);
  const ownsIt = tallyOwnsIt(history, roster);
  const wildCard = tallyWildCard(history, roster);

  const awards = [
    topAward("main-character", mainCharacter, MAIN_CHARACTER_THRESHOLD),
    topAward("crowd-reader", crowdReader, CROWD_READER_THRESHOLD),
    topAward("owns-it", ownsIt, OWNS_IT_THRESHOLD),
    topAward("wild-card", wildCard, WILD_CARD_THRESHOLD),
  ];
  return awards
    .filter((award): award is Award => award !== null)
    .slice(0, MAX_AWARDS);
}
