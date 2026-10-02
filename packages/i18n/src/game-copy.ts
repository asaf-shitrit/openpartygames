import type { Dictionary } from "./dictionary";

interface GameCopy {
  title: string;
  blurb: string;
  landingBlurb: string;
}

/**
 * A shipped game's name and blurbs in the UI language, or undefined for an id this build has
 * no copy for. The server sends English `name` and `blurb` for every game; showing those in a
 * Hebrew picker, then a Hebrew title once the game starts, split one game across two names.
 */
function copyFor(t: Dictionary, id: string): GameCopy | undefined {
  switch (id) {
    case "imposter":
      return t.imposter;
    case "real-or-nah":
      return t.realOrNah;
    case "most-likely-to":
      return t.mostLikelyTo;
    case "doodle-bluff":
      return t.doodleBluff;
    default:
      return undefined;
  }
}

/** The game's name in the UI language; `fallback` (the server's) for an unknown game. */
export function gameName(t: Dictionary, id: string, fallback: string): string {
  return copyFor(t, id)?.title ?? fallback;
}

/** The game's one-line description for the picker, in the UI language. */
export function gameBlurb(t: Dictionary, id: string, fallback: string): string {
  return copyFor(t, id)?.blurb ?? fallback;
}

/** The shorter description the landing page shows, in the UI language. */
export function gameLandingBlurb(t: Dictionary, id: string, fallback: string): string {
  return copyFor(t, id)?.landingBlurb ?? fallback;
}
