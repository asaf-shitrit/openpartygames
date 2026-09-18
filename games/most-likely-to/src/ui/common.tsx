// Shared bits for the Most Likely To host and phone screens.
import type { AvatarId, PlayerId, PlayerSummary } from "@opg/protocol";
import { Highlight } from "@opg/ui";
import { useLocale } from "@opg/i18n";

/** Looks a player up in the room roster; null for a kicked or unknown id. */
export function findPlayer(
  players: readonly PlayerSummary[],
  id: PlayerId | null,
): PlayerSummary | null {
  if (id === null) return null;
  return players.find((player) => player.id === id) ?? null;
}

/** Display name, or `someone` for a player who left (never a raw id). */
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

export interface PromptLineProps {
  prompt: string;
  /** Font size in px for the whole line. */
  size: number;
}

/** "Who's most likely to <prompt>?", with the prompt highlighted. */
export function PromptLine({ prompt, size }: PromptLineProps) {
  const { t } = useLocale();
  return (
    <p style={{ margin: 0, fontSize: size, lineHeight: 1.25, fontWeight: 700 }}>
      {t.mostLikelyTo.promptPrefix}{" "}
      <Highlight style={{ padding: "0 4px" }}>{prompt}</Highlight>?
    </p>
  );
}
