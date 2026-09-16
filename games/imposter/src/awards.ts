// End-of-game awards for Imposter. Pure and deterministic: derived only from
// state.history (one entry per scored word) and the current roster.
import type { Award, PlayerId } from "@opg/protocol";
import { MAX_AWARDS } from "@opg/protocol";
import type { ImposterState, ImposterWordRecord } from "./state";

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

/** How many times each player was the imposter, caught, and got the word back. */
function tallyImposterCounts(
  history: readonly ImposterWordRecord[],
  roster: ReadonlySet<PlayerId>,
) {
  const wordThief: Record<PlayerId, number> = {};
  const disguise: Record<PlayerId, number> = {};
  for (const record of history) {
    if (!roster.has(record.imposterId)) continue;
    if (record.caught && record.guessCorrect)
      bump(wordThief, record.imposterId);
    if (!record.caught) bump(disguise, record.imposterId);
  }
  return { wordThief, disguise };
}

/** How many times each player voted for that word's imposter. */
function tallySharpestEye(
  history: readonly ImposterWordRecord[],
  roster: ReadonlySet<PlayerId>,
) {
  const counts: Record<PlayerId, number> = {};
  for (const record of history) {
    for (const voter of Object.keys(record.votes)) {
      if (!roster.has(voter)) continue;
      if (record.votes[voter] === record.imposterId) bump(counts, voter);
    }
  }
  return counts;
}

/** How many words each crew member finished with nobody voting for them. */
function tallyTrustedCrew(
  history: readonly ImposterWordRecord[],
  roster: ReadonlySet<PlayerId>,
) {
  const counts: Record<PlayerId, number> = {};
  for (const record of history) {
    const votedAgainst = new Set(Object.values(record.votes));
    for (const playerId of record.playerIds) {
      if (playerId === record.imposterId) continue;
      if (!roster.has(playerId)) continue;
      if (!votedAgainst.has(playerId)) bump(counts, playerId);
    }
  }
  return counts;
}

/** Best first, capped at MAX_AWARDS like every award list the platform draws. */
export function imposterAwards(state: ImposterState): Award[] {
  const history = state.history ?? [];
  const roster = new Set(state.playerIds);
  const { wordThief, disguise } = tallyImposterCounts(history, roster);
  const sharpestEye = tallySharpestEye(history, roster);
  const trustedCrew = tallyTrustedCrew(history, roster);

  const awards = [
    topAward("word-thief", wordThief, 1),
    topAward("master-of-disguise", disguise, 1),
    topAward("sharpest-eye", sharpestEye, 2),
    topAward("trusted-crew", trustedCrew, 3),
  ];
  return awards
    .filter((award): award is Award => award !== null)
    .slice(0, MAX_AWARDS);
}
