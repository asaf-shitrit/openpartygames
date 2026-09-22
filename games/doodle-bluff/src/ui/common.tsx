// Shared bits for the Doodle Bluff host and phone screens.
import type { AvatarId, PlayerId, PlayerSummary } from "@opg/protocol";
import { format } from "@opg/i18n";
import type { Dictionary } from "@opg/i18n";

/** Looks a player up in the room roster; null for a kicked or unknown id. */
export function findPlayer(
  players: readonly PlayerSummary[],
  id: PlayerId | null,
): PlayerSummary | null {
  if (id === null) return null;
  return players.find((player) => player.id === id) ?? null;
}

/** Display name, or `t.common.someone` for a player who left (never a raw id). */
export function nameOf(
  players: readonly PlayerSummary[],
  id: PlayerId | null,
  someone: string,
): string {
  return findPlayer(players, id)?.name ?? someone;
}

export function avatarOf(
  players: readonly PlayerSummary[],
  id: PlayerId | null,
): AvatarId | null {
  return findPlayer(players, id)?.avatar ?? null;
}

/**
 * What a screen reader says where a drawing is. Nobody can describe a freehand doodle, so
 * this names whose it is — which is the part that carries meaning in this game anyway.
 */
export function drawingLabel(t: Dictionary, name: string): string {
  return format(t.doodleBluff.drawingLabel, { name });
}
