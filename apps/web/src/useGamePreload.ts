import { useEffect } from "react";
import { preloadGameUi } from "./games";

/**
 * Fetches the room's game chunk as soon as the room names the game, which is well before any
 * game screen renders (the lobby and the "Starting…" screen cover the download). Only moves
 * *when the bytes arrive*: the finale's copy is not in that chunk, so no beat depends on it.
 * `preload` is a parameter so a test can watch it.
 */
export function useGamePreload(
  gameId: string | null | undefined,
  preload: (id: string) => Promise<void> = preloadGameUi,
): void {
  useEffect(() => {
    if (gameId) void preload(gameId);
  }, [gameId, preload]);
}

interface RoomNamingAGame {
  game: { id: string } | null;
  selectedGameId: string;
}

/** The room's running game, or the one picked in the lobby; preloads whichever it is. */
export function useRoomGamePreload(
  room: RoomNamingAGame | null,
  preload: (id: string) => Promise<void> = preloadGameUi,
): void {
  useGamePreload(room?.game?.id ?? room?.selectedGameId, preload);
}
