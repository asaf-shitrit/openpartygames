// Small pure helpers shared by the TV and phone screens: names, avatars, link labels, and where
// a favourite link came from. Kept out of the components so they can be unit tested without DOM.
import type { PlayerId, PlayerSummary } from "@opg/protocol";
import { format } from "@opg/i18n";
import type { Dictionary } from "@opg/i18n";
import type { SketchLinkKind, SketchLinkView, SketchPhase } from "../state";

export function nameOf(players: readonly PlayerSummary[], id: PlayerId, fallback: string): string {
  return players.find((player) => player.id === id)?.name ?? fallback;
}

export function avatarOf(players: readonly PlayerSummary[], id: PlayerId) {
  return players.find((player) => player.id === id)?.avatar ?? null;
}

export function linkLabel(t: Dictionary, kind: SketchLinkKind, name: string): string {
  return kind === "words"
    ? format(t.sketchPhone.wordsOf, { name })
    : format(t.sketchPhone.drawingOf, { name });
}

/** What a player who has not handed in yet is doing: the phase's own verb. */
export function statusLabel(t: Dictionary, phase: SketchPhase): string | null {
  if (phase === "write") return t.sketchPhone.writing;
  if (phase === "draw") return t.sketchPhone.drawing;
  if (phase === "describe") return t.sketchPhone.describing;
  return null;
}

/**
 * The words a favourite link came from: the nearest earlier words link in the same chain. Null
 * when the favourite is the chain's seed or when the link before it was dropped by a kick.
 */
export function sourceOf(links: readonly SketchLinkView[], favouriteId: string | null): SketchLinkView | null {
  if (favouriteId === null) return null;
  const index = links.findIndex((link) => link.id === favouriteId);
  if (index < 0) return null;
  for (let i = index - 1; i >= 0; i -= 1) {
    const link = links[i];
    if (link !== undefined && link.kind === "words") return link;
  }
  return null;
}
