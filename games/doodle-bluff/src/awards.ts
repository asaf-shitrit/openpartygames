// End-of-game awards for Doodle Bluff. Pure and deterministic: derived only from
// state.history (one entry per shown drawing's reveal) and the current roster.
import type { Award, PlayerId } from "@opg/protocol";
import { MAX_AWARDS } from "@opg/protocol";
import type { DoodleRoundRecord, DoodleState } from "./state";

const PEN_OF_THE_PEOPLE_THRESHOLD = 2;
const MASTER_FORGER_THRESHOLD = 2;
const SHARP_EYE_THRESHOLD = 2;
const ABSTRACT_ARTIST_THRESHOLD = 2;

/** The award for the top count(s) at or above threshold, or null when nobody qualifies. */
function topAward(id: string, counts: Record<PlayerId, number>, threshold: number): Award | null {
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

function bumpBy(counts: Record<PlayerId, number>, playerId: PlayerId, amount: number): void {
  if (amount <= 0) return;
  counts[playerId] = (counts[playerId] ?? 0) + amount;
}

/** How many people found each artist's real title, across every drawing they made. */
function tallyPenOfThePeople(history: readonly DoodleRoundRecord[], roster: ReadonlySet<PlayerId>) {
  const counts: Record<PlayerId, number> = {};
  for (const record of history) {
    if (!roster.has(record.artistId)) continue;
    const found = record.foundByIds.filter((id) => roster.has(id)).length;
    bumpBy(counts, record.artistId, found);
  }
  return counts;
}

/** How many people each player's fake titles fooled, across every drawing. */
function tallyMasterForger(history: readonly DoodleRoundRecord[], roster: ReadonlySet<PlayerId>) {
  const counts: Record<PlayerId, number> = {};
  for (const record of history) {
    for (const title of record.titles) {
      if (title.authorId === null || !roster.has(title.authorId)) continue;
      const fooled = title.fooledIds.filter((id) => roster.has(id)).length;
      bumpBy(counts, title.authorId, fooled);
    }
  }
  return counts;
}

/** How many times each player found the real title. */
function tallySharpEye(history: readonly DoodleRoundRecord[], roster: ReadonlySet<PlayerId>) {
  const counts: Record<PlayerId, number> = {};
  for (const record of history) {
    for (const finder of record.foundByIds) {
      if (!roster.has(finder)) continue;
      bumpBy(counts, finder, 1);
    }
  }
  return counts;
}

/** How many people each artist fooled completely: a drawing nobody found the real title for. */
function tallyAbstractArtist(history: readonly DoodleRoundRecord[], roster: ReadonlySet<PlayerId>) {
  const counts: Record<PlayerId, number> = {};
  for (const record of history) {
    if (record.foundByIds.length > 0 || !roster.has(record.artistId)) continue;
    const fooledTotal = record.titles.reduce(
      (sum, t) => sum + t.fooledIds.filter((id) => roster.has(id)).length,
      0,
    );
    bumpBy(counts, record.artistId, fooledTotal);
  }
  return counts;
}

/** Best first, capped at MAX_AWARDS like every award list the platform draws. */
export function doodleBluffAwards(state: DoodleState): Award[] {
  const history = state.history ?? [];
  const roster = new Set(state.playerIds);

  const awards = [
    topAward("pen-of-the-people", tallyPenOfThePeople(history, roster), PEN_OF_THE_PEOPLE_THRESHOLD),
    topAward("master-forger", tallyMasterForger(history, roster), MASTER_FORGER_THRESHOLD),
    topAward("sharp-eye", tallySharpEye(history, roster), SHARP_EYE_THRESHOLD),
    topAward("abstract-artist", tallyAbstractArtist(history, roster), ABSTRACT_ARTIST_THRESHOLD),
  ];
  return awards.filter((award): award is Award => award !== null).slice(0, MAX_AWARDS);
}
