// Shared helpers for the Imposter no-TV stage sections.
import type { PlayerId, PlayerSummary } from "@opg/protocol";

export function findPlayer(
  players: PlayerSummary[],
  id: PlayerId | null,
): PlayerSummary | null {
  if (!id) return null;
  return players.find((player) => player.id === id) ?? null;
}

export function nameOf(
  players: PlayerSummary[],
  id: PlayerId | null,
  someone: string,
): string {
  return findPlayer(players, id)?.name ?? someone;
}

export function avatarOf(players: PlayerSummary[], id: PlayerId | null) {
  return findPlayer(players, id)?.avatar ?? null;
}
