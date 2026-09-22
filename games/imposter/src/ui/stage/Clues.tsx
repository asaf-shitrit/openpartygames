// No-TV stage for the clues phase: a single small, permanent row of avatars -- speaking
// order, the current speaker ringed, spoken ones struck through. Everyone is talking out
// loud during this phase and only glancing down, so this is a glance, not a focus. Names are
// dropped: six names don't fit at 16px across 390px in one row, and the speaker's name is
// already said aloud and carried in words by the banner rendered beneath this in Phone.tsx.
import type { CSSProperties } from "react";
import type { PlayerId, PlayerSummary } from "@opg/protocol";
import { Avatar } from "@opg/ui";
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

const SPOKEN_WRAP: CSSProperties = {
  position: "relative",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  opacity: 0.5,
};

const STRIKE: CSSProperties = {
  position: "absolute",
  left: -3,
  right: -3,
  top: 18,
  height: 3,
  background: "var(--opg-ink)",
  transform: "rotate(-8deg)",
};

const SPEAKING_RING: CSSProperties = {
  width: 46,
  height: 46,
  boxSizing: "border-box",
  borderRadius: "50%",
  border: "3px solid var(--opg-marker)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "var(--opg-highlight-soft)",
};

function ClueAvatar({
  id,
  spoken,
  speaking,
  players,
}: {
  id: PlayerId;
  spoken: boolean;
  speaking: boolean;
  players: PlayerSummary[];
}) {
  const { t } = useLocale();
  const alt = format(t.imposter.avatarAlt, {
    name: nameOf(players, id, t.common.someone),
  });
  if (speaking) {
    return (
      <div style={SPEAKING_RING} data-testid="stage-clues-speaking">
        <Avatar id={avatarOf(players, id)} size={38} alt={alt} />
      </div>
    );
  }
  if (spoken) {
    return (
      <div style={SPOKEN_WRAP} data-testid="stage-clues-spoken">
        <Avatar id={avatarOf(players, id)} size={40} alt={alt} />
        <div style={STRIKE} aria-hidden="true" />
      </div>
    );
  }
  return <Avatar id={avatarOf(players, id)} size={40} alt={alt} />;
}

export interface StageCluesProps {
  view: ImposterHostView;
  players: PlayerSummary[];
}

/** The stage region during clues: small and permanent, a glance rather than a focus. */
export function StageClues({ view, players }: StageCluesProps) {
  const { t } = useLocale();
  return (
    <div style={WRAP}>
      <div style={LABEL}>{t.imposter.clues.orderLabelStage}</div>
      <div style={ROW}>
        {view.clueOrder.map((id) => (
          <ClueAvatar
            key={id}
            id={id}
            spoken={view.doneSpeakerIds.includes(id)}
            speaking={id === view.currentSpeakerId}
            players={players}
          />
        ))}
      </div>
    </div>
  );
}
