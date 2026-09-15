// Which music bed, if any, the host stage claims for the current view. Pure so the mapping is
// table-tested; HostApp feeds the result into useMusic.
import type { HostRoomView } from "@opg/protocol";
import type { MusicId } from "@opg/ui";

/**
 * The lobby loop plays behind the join and game-pick screens. Everything else is null: the
 * starting screen gets the start stinger instead, an in-game phase lets the game claim its own
 * bed (the tension bed during a vote, say), and the results screen is left to the finale slice.
 */
export function screenMusic(view: HostRoomView): MusicId | null {
  if (view.phase !== "lobby") return null;
  if (view.lobbyScreen === "results") return null;
  return "lobby";
}
