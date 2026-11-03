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

/** The tally's votes for one link, and nothing for a link nobody on the roster wrote. */
function votesFor(tally: Tally, state: SketchState, link: ChainLink): number {
  if (!tally.includes(link) || !state.playerIds.includes(link.authorId)) return 0;
  return votesOn(state, link.id);
}

function countsOf(tally: Tally, state: SketchState) {
  const counts: Record<PlayerId, number> = {};
  for (const link of Object.values(state.links)) {
    counts[link.authorId] = (counts[link.authorId] ?? 0) + votesFor(tally, state, link);
  }
  return counts;
}

/** Everyone holding the highest count, and that count; empty when nobody reached the minimum. */
function leadersOf(counts: Record<PlayerId, number>) {
  let top = 0;
  let leaders: PlayerId[] = [];
  for (const [playerId, value] of Object.entries(counts)) {
    if (value < THRESHOLD) continue;
    if (value === top) leaders.push(playerId);
    if (value > top) {
      top = value;
      leaders = [playerId];
    }
  }
  return { top, leaders };
}

function topAward(tally: Tally, state: SketchState): Award | null {
  const { top, leaders } = leadersOf(countsOf(tally, state));
  if (leaders.length === 0) return null;
  return { id: tally.id, playerIds: leaders, value: top };
}

/** Best first, capped at MAX_AWARDS like every award list the platform draws. */
export function sketchPhoneAwards(state: SketchState): Award[] {
  return TALLIES.map((tally) => topAward(tally, state))
    .filter((award): award is Award => award !== null)
    .slice(0, MAX_AWARDS);
}
