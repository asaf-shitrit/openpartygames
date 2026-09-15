// End-of-game awards for Real or Nah. Pure and deterministic: derived only from
// state.history (one entry per fact whose reveal was left) and the current roster.
import type { Award, PlayerId } from "@opg/protocol";
import type { RonFactRecord, RonState } from "./types";

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

/** Total people fooled, and the best single lie's fooled count, per author. */
function tallyLies(
  history: readonly RonFactRecord[],
  roster: ReadonlySet<PlayerId>,
) {
  const total: Record<PlayerId, number> = {};
  const best: Record<PlayerId, number> = {};
  for (const record of history) {
    for (const lie of record.lies) {
      const authorId = lie.authorId;
      if (authorId === null || !roster.has(authorId)) continue;
      const fooled = lie.fooledIds.length;
      total[authorId] = (total[authorId] ?? 0) + fooled;
      best[authorId] = Math.max(best[authorId] ?? 0, fooled);
    }
  }
  return { total, best };
}

/** How many truths each player found. */
function tallyTruthFinder(
  history: readonly RonFactRecord[],
  roster: ReadonlySet<PlayerId>,
) {
  const counts: Record<PlayerId, number> = {};
  for (const record of history) {
    for (const playerId of record.foundByIds) {
      if (!roster.has(playerId)) continue;
      counts[playerId] = (counts[playerId] ?? 0) + 1;
    }
  }
  return counts;
}

/** How many times each player's pick was someone's lie, not a house decoy. */
function tallyMostTrusting(
  history: readonly RonFactRecord[],
  roster: ReadonlySet<PlayerId>,
) {
  const counts: Record<PlayerId, number> = {};
  for (const record of history) {
    const lieOptionIds = new Set(
      record.lies.filter((lie) => lie.authorId !== null).map((l) => l.optionId),
    );
    for (const playerId of Object.keys(record.picks)) {
      if (!roster.has(playerId)) continue;
      const pick = record.picks[playerId];
      if (pick !== undefined && lieOptionIds.has(pick)) {
        counts[playerId] = (counts[playerId] ?? 0) + 1;
      }
    }
  }
  return counts;
}

/** Best first: best liar, truth finder, greatest hit, most trusting. */
export function realOrNahAwards(state: RonState): Award[] {
  const history = state.history ?? [];
  const roster = new Set(state.playerIds);
  const { total, best } = tallyLies(history, roster);
  const truthFinder = tallyTruthFinder(history, roster);
  const mostTrusting = tallyMostTrusting(history, roster);

  const awards = [
    topAward("best-liar", total, 2),
    topAward("truth-finder", truthFinder, 2),
    topAward("greatest-hit", best, 2),
    topAward("most-trusting", mostTrusting, 3),
  ];
  return awards.filter((award): award is Award => award !== null);
}
