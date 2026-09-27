// What PlayerApp reads out of a room view, as pure functions: whether the error on screen is
// still true, and which round the screen is showing. Both are decisions about server state
// rather than about pixels, so they live here and are table-tested.
import { MIN_PLAYERS } from "@opg/protocol";
import type {
  ActiveGameView,
  ErrorCode,
  PlayerRoomView,
  RoomPhase,
} from "@opg/protocol";
import { z } from "zod";

/** Complaints about getting a seat; holding a player view is proof the seat exists. */
const JOIN_ERROR_CODES = new Set<ErrorCode>([
  "room-not-found",
  "room-full",
  "room-locked",
  "name-taken",
  "name-invalid",
  "not-joined",
]);

/** The room was short of playable phones; the roster arriving is what answers these. */
const ROSTER_ERROR_CODES = new Set<ErrorCode>([
  "not-enough-players",
  "players-away",
]);

/** Complaints about a start that did not happen; a start that does answers them. */
const START_ERROR_CODES = new Set<ErrorCode>([
  "invalid-action",
  "no-language-packs",
  "start-failed",
]);

/** Counted the way the server counts before it starts a game (RoomCore.onStartGame). */
export function readyPlayerCount(view: PlayerRoomView): number {
  return view.players.filter((p) => p.connected && !p.waitingForNextGame)
    .length;
}

function minPlayersFor(view: PlayerRoomView): number {
  return (
    view.games.find((g) => g.id === view.selectedGameId)?.minPlayers ??
    MIN_PLAYERS
  );
}

/**
 * Whether the room as it now stands has overtaken the error on screen. Nothing clears on a
 * timer and nothing clears on the next frame: "Not enough players yet." goes when the players
 * arrive, a start complaint goes when the start works, and an error that is still true stays
 * up for as long as it takes to read.
 */
export function errorOutlived(code: ErrorCode, view: PlayerRoomView): boolean {
  if (JOIN_ERROR_CODES.has(code)) return true;
  if (ROSTER_ERROR_CODES.has(code))
    return readyPlayerCount(view) >= minPlayersFor(view);
  if (code === "game-in-progress") return view.phase === "lobby";
  if (START_ERROR_CODES.has(code)) return view.phase !== "lobby";
  return false;
}

/** Every game's player view names the phase it is in; a round-based game numbers it too. */
const gamePhaseSchema = z.object({
  phase: z.string(),
  roundNumber: z.number().optional(),
});

/** The phase a game's own view names, or the room's phase when the view names none. */
function gamePhaseLabel(
  game: ActiveGameView | null,
  roomPhase: RoomPhase,
): string {
  const parsed = gamePhaseSchema.safeParse(game?.view);
  if (!parsed.success) return roomPhase;
  return `${parsed.data.phase}/${parsed.data.roundNumber ?? ""}`;
}

/**
 * Identity for the round the VIP is looking at, so the in-game bar can tell a send that has
 * landed from one that is merely slow. The game's own view names its phase, the deadline's
 * start marks a phase that repeats across rounds, and the last error code covers a send the
 * server refused outright — between them, a tapped Skip re-enables when the room has answered
 * rather than when a timer guesses that it probably has.
 */
export function settledKeyOf(
  view: PlayerRoomView,
  errorCode: ErrorCode | null,
): string {
  const game = view.game;
  return [
    game?.id,
    gamePhaseLabel(game, view.phase),
    game?.timerStartedAt,
    errorCode,
  ].join(":");
}
