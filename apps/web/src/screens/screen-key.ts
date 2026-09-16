// Identifies the host stage's current screen, so HostApp can key a PhaseEnter transition and a
// whoosh cue off it. Pure and table-tested.
import type { HostRoomView } from "@opg/protocol";

export function screenKey(view: HostRoomView): string {
  if (view.phase === "starting") return "starting";
  if (view.phase === "in-game") {
    return `game:${view.game?.id ?? view.selectedGameId}`;
  }
  return `lobby:${view.lobbyScreen}`;
}
