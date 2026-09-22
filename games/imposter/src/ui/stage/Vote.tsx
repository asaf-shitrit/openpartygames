// No-TV stage for the vote phase: who has voted, never whom. `votedIds` is the whole signal --
// hostView never carries anyone's target, so this component cannot leak one even by accident.
import type { CSSProperties } from "react";
import type { PlayerId, PlayerSummary } from "@opg/protocol";
import { Avatar, Icon } from "@opg/ui";
import { format, useLocale } from "@opg/i18n";
import type { ImposterHostView } from "../../state";
import { avatarOf, nameOf } from "./common";

const WRAP: CSSProperties = {
  boxSizing: "border-box",
  padding: "10px 12px",
  display: "flex",
  flexDirection: "column",
  gap: 8,
  background: "var(--opg-card)",
  border: "3px solid var(--opg-ink)",
  borderRadius: "22px 8px 20px 10px / 10px 20px 8px 22px",
};

const HEADER: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
};

const LABEL: CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
  color: "var(--opg-ink-secondary)",
  letterSpacing: "0.02em",
};

const ROW: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
};

const BADGE: CSSProperties = {
  position: "absolute",
  insetInlineEnd: -5,
  top: -5,
  width: 19,
  height: 19,
  borderRadius: "50%",
  background: "var(--opg-highlight)",
  border: "2.5px solid var(--opg-marker)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

function VoteAvatar({
  id,
  voted,
  players,
}: {
  id: PlayerId;
  voted: boolean;
  players: PlayerSummary[];
}) {
  const { t } = useLocale();
  const alt = format(t.imposter.avatarAlt, {
    name: nameOf(players, id, t.common.someone),
  });
  if (!voted) {
    return (
      <Avatar
        id={avatarOf(players, id)}
        size={40}
        alt={alt}
        style={{ opacity: 0.5 }}
      />
    );
  }
  return (
    <div
      style={{ position: "relative", display: "flex" }}
      data-testid="stage-vote-voted"
    >
      <Avatar id={avatarOf(players, id)} size={40} alt={alt} />
      <div style={BADGE}>
        <Icon name="check" size={12} color="var(--opg-marker)" />
      </div>
    </div>
  );
}

export interface StageVoteProps {
  view: ImposterHostView;
  players: PlayerSummary[];
}

/** The stage region during the vote: who has locked in, never their pick. */
export function StageVote({ view, players }: StageVoteProps) {
  const { t } = useLocale();
  return (
    <div style={WRAP}>
      <div style={HEADER}>
        <div style={LABEL}>{t.imposter.vote.whoHasVotedLabel}</div>
        <div style={LABEL}>
          {format(t.imposter.vote.ofTotal, {
            voted: view.votedIds.length,
            total: view.playerIds.length,
          })}
        </div>
      </div>
      <div style={ROW}>
        {view.playerIds.map((id) => (
          <VoteAvatar
            key={id}
            id={id}
            voted={view.votedIds.includes(id)}
            players={players}
          />
        ))}
      </div>
    </div>
  );
}
