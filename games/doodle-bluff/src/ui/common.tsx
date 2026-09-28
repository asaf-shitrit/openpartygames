// Shared bits for the Doodle Bluff host and phone screens.
import { createContext, useContext } from "react";
import type { AvatarId, PlayerId, PlayerSummary } from "@opg/protocol";
import { Marker } from "@opg/ui";
import type { MarkerProps } from "@opg/ui";
import { format } from "@opg/i18n";
import type { Dictionary } from "@opg/i18n";

/**
 * The heading level the phone's own controls take. A room with a shared screen has nothing
 * above them, so their title is the screen's h1. A no-TV room stages the room's title (the
 * same words the TV shows) above the controls; that is the h1 and the controls' title sits
 * one level under it.
 */
const ControlsLevel = createContext<1 | 2>(1);
export const ControlsLevelProvider = ControlsLevel.Provider;

/** A `Marker` heading at the level the surrounding phone screen leaves for its controls. */
export function ControlsMarker(props: Omit<MarkerProps, "level">) {
  const level = useContext(ControlsLevel);
  return <Marker {...props} level={level} />;
}

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
