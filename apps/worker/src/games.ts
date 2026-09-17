import type { AnyGame } from "@opg/sdk";
import { imposter } from "@opg/game-imposter";
import { mostLikelyTo } from "@opg/game-most-likely-to";
import { realOrNah } from "@opg/game-real-or-nah";

/** Game registry: the first entry is the default selection for a new room. */
export const GAMES: AnyGame[] = [imposter, realOrNah, mostLikelyTo];
