// No-TV stage for the vote phase: the prompt and who has voted, painted at phone scale.
// Layout only — the prompt is already on the player view; `stage` adds just `votedIds`.
import type { CSSProperties } from "react";
import type { PlayerId, PlayerSummary } from "@opg/protocol";
import { Avatar, Card, Icon } from "@opg/ui";
import { format, useLocale } from "@opg/i18n";
import type { Dictionary } from "@opg/i18n";
import type { MltHostView } from "../../state";
import { avatarOf, nameOf, PromptLine } from "../common";

const CARD_STYLE: CSSProperties = {
  padding: "18px 18px 16px",
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const VOTED_LABEL: CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
  color: "var(--opg-ink-secondary)",
};

const AVATAR_ROW: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap",
};

const BADGE: CSSProperties = {
  position: "absolute",
  right: -4,
  bottom: -4,
  width: 18,
  height: 18,
  borderRadius: "50%",
  background: "var(--opg-highlight)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const PLACEHOLDER: CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: "50%",
  border: "3px dashed var(--opg-muted)",
};

function VotedAvatar({
  players,
  id,
  t,
}: {
  players: PlayerSummary[];
  id: PlayerId;
  t: Dictionary;
}) {
  return (
    <div style={{ position: "relative" }}>
      <Avatar
        id={avatarOf(players, id)}
        size={40}
        alt={format(t.mostLikelyTo.avatarAlt, {
          name: nameOf(players, id, t.common.someone),
        })}
      />
      <div style={BADGE}>
        <Icon name="check" size={12} color="var(--opg-ink)" />
      </div>
    </div>
  );
}

export interface StageVoteProps {
  view: MltHostView;
  players: PlayerSummary[];
}

/** The stage region while the room votes: the prompt, and who has locked in. */
export function StageVote({ view, players }: StageVoteProps) {
  const { t } = useLocale();
  const remaining = Math.max(view.playerIds.length - view.votedIds.length, 0);
  return (
    <Card variant="M" tilt={-0.6} style={CARD_STYLE}>
      <PromptLine prompt={view.prompt} size={26} />
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={VOTED_LABEL}>
          {format(t.mostLikelyTo.votedSoFar, {
            voted: view.votedIds.length,
            total: view.playerIds.length,
          })}
        </div>
        <div style={AVATAR_ROW}>
          {view.votedIds.map((id) => (
            <VotedAvatar key={id} players={players} id={id} t={t} />
          ))}
          {Array.from({ length: remaining }, (_, index) => (
            <div
              key={`pending-${index}`}
              data-testid="stage-vote-pending"
              style={PLACEHOLDER}
              aria-hidden="true"
            />
          ))}
        </div>
      </div>
    </Card>
  );
}
