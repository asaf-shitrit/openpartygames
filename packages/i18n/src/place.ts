import type { Dictionary } from "./dictionary";
import { format } from "./format";

/**
 * Every game caps at eight players, so each place a room can actually reach has its own
 * word in the dictionary rather than a number with a suffix glued on. English builds "3rd"
 * from a rule; Hebrew says "במקום השלישי" and has no suffix to attach. A rule in code would
 * only ever be English's rule, so the rule lives in the dictionary instead.
 */
const PLACE_KEYS = [
  "first",
  "second",
  "third",
  "fourth",
  "fifth",
  "sixth",
  "seventh",
  "eighth",
] as const;

export function placeFor(t: Dictionary, rank: number): string {
  const key = PLACE_KEYS[rank - 1];
  if (key) return t.common.place[key];
  return format(t.common.place.other, { rank });
}
