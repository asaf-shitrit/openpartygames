// End-of-game awards for Sketch Phone. Pure and deterministic: derived from the votes every link
// collected and the current roster. Nobody who left the room keeps an award.
import type { Award, PlayerId } from "@opg/protocol";
import { MAX_AWARDS } from "@opg/protocol";
import type { ChainLink, SketchState } from "./state";
import { votesOn } from "./rules";

const THRESHOLD = 1;

interface Tally {
  id: string;
  /** The links that count toward this award. */
  includes: (link: ChainLink) => boolean;
}

const TALLIES: Tally[] = [
  { id: "favourite", includes: () => true },
  { id: "sharpest-pencil", includes: (link) => link.kind === "drawing" },
  { id: "wordsmith", includes: (link) => link.kind === "words" },
];

function topAward(tally: Tally, state: SketchState): Award | null {
  const counts: Record<PlayerId, number> = {};
  for (const link of Object.values(state.links)) {
    if (!tally.includes(link) || !state.playerIds.includes(link.authorId)) continue;
    counts[link.authorId] = (counts[link.authorId] ?? 0) + votesOn(state, link.id);
  }
  let top = 0;
  let leaders: PlayerId[] = [];
  for (const playerId of Object.keys(counts)) {
    const value = counts[playerId] ?? 0;
    if (value < THRESHOLD) continue;
    if (value > top) {
      top = value;
      leaders = [playerId];
    } else if (value === top) {
      leaders.push(playerId);
    }
  }
  return leaders.length > 0 ? { id: tally.id, playerIds: leaders, value: top } : null;
}

/** Best first, capped at MAX_AWARDS like every award list the platform draws. */
export function sketchPhoneAwards(state: SketchState): Award[] {
  return TALLIES.map((tally) => topAward(tally, state))
    .filter((award): award is Award => award !== null)
    .slice(0, MAX_AWARDS);
}
