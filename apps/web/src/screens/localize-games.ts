import { gameBlurb, gameName } from "@opg/i18n";
import type { Dictionary } from "@opg/i18n";
import type { GameSummary } from "@opg/protocol";

/**
 * The room view with each game's name and blurb in the viewer's UI language. The Worker sends
 * English for both, so without this a Hebrew picker, lobby and "starting" screen call a game
 * "Imposter" and then the game itself opens as "מתחזה".
 */
export function withLocalizedGames<V extends { games: GameSummary[] }>(t: Dictionary, view: V): V {
  return {
    ...view,
    games: view.games.map((game) => ({
      ...game,
      name: gameName(t, game.id, game.name),
      blurb: gameBlurb(t, game.id, game.blurb),
    })),
  };
}
