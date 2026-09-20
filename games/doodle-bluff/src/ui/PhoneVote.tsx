// The vote phase: everyone but the artist picks which title is real. Follows Real or Nah's
// vote-phase shape (games/real-or-nah/src/ui/Phone.tsx).
import { useState } from "react";
import type { CSSProperties } from "react";
import type { ServerClock } from "@opg/ui";
import { Button, Card, DoodleView, Icon, Marker, PRESSABLE_CLASS } from "@opg/ui";
import { useLocale } from "@opg/i18n";
import type { Dictionary } from "@opg/i18n";
import type { DoodleAction, DoodlePlayerOption, DoodlePlayerView } from "../state";

export interface PhoneVoteProps {
  view: DoodlePlayerView;
  clock: ServerClock;
  send: (action: DoodleAction) => void;
}

function DrawingCard({ view, clock, t }: { view: DoodlePlayerView; clock: ServerClock; t: Dictionary }) {
  if (view.doodle === null) return null;
  const label = view.isArtist ? t.doodleBluff.yourDrawingLabel : t.doodleBluff.drawingBeingVotedLabel;
  return (
    <Card style={{ padding: 10, alignSelf: "center" }}>
      <DoodleView doodle={view.doodle} label={label} clock={clock} size={180} />
    </Card>
  );
}

function rowBorder(mine: boolean, selected: boolean): string {
  if (mine) return "3px dashed var(--opg-muted)";
  return selected ? "4px solid var(--opg-ink)" : "3px solid var(--opg-ink)";
}

function rowStyle(mine: boolean, selected: boolean): CSSProperties {
  return {
    minHeight: 52,
    boxSizing: "border-box",
    padding: "0 16px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    background: selected ? "var(--opg-highlight-soft)" : "var(--opg-card)",
    border: rowBorder(mine, selected),
    borderRadius: "var(--opg-radius-button)",
    fontFamily: "var(--opg-font-body)",
    fontSize: 19,
    fontWeight: 700,
    color: "var(--opg-ink)",
    textAlign: "start",
    cursor: mine ? "not-allowed" : "pointer",
  };
}

function RowMark({ mine, selected }: { mine: boolean; selected: boolean }) {
  if (mine) return <Icon name="pencil" size={18} color="var(--opg-ink-secondary)" />;
  if (selected) return <Icon name="check" size={26} color="var(--opg-marker)" />;
  return null;
}

function VoteRow({ option, selected, onSelect }: { option: DoodlePlayerOption; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      disabled={option.mine}
      aria-pressed={option.mine ? undefined : selected}
      className={PRESSABLE_CLASS}
      onClick={option.mine ? undefined : onSelect}
      style={rowStyle(option.mine, selected)}
    >
      <div style={{ opacity: option.mine ? 0.45 : 1 }}>{option.text}</div>
      <RowMark mine={option.mine} selected={selected} />
    </button>
  );
}

function VoteForm({ view, send, t }: { view: DoodlePlayerView; send: (action: DoodleAction) => void; t: Dictionary }) {
  const [selected, setSelected] = useState<string | null>(null);
  const options = view.options ?? [];
  return (
    <>
      <Marker size={26}>{t.doodleBluff.whichIsReal}</Marker>
      <div style={{ fontSize: 15, fontWeight: 700, color: "var(--opg-ink-secondary)" }}>{t.doodleBluff.pickOneNotYourOwn}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {options.map((option) => (
          <VoteRow key={option.id} option={option} selected={selected === option.id} onSelect={() => setSelected(option.id)} />
        ))}
      </div>
      <Button
        fullWidth
        disabled={selected === null}
        onClick={() => {
          if (selected !== null) send({ type: "vote", optionId: selected });
        }}
        style={{ marginTop: "auto" }}
      >
        <Icon name="check" size={22} />
        {t.doodleBluff.lockIn}
      </Button>
    </>
  );
}

function VoteLocked({ t }: { t: Dictionary }) {
  return (
    <Card
      variant="M"
      style={{ padding: "24px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, textAlign: "center" }}
    >
      <Icon name="check" size={40} color="var(--opg-marker)" />
      <Marker size={30}>{t.doodleBluff.voteLockedIn}</Marker>
      <div style={{ fontSize: 18, fontWeight: 700 }}>{t.doodleBluff.holdTightForReveal}</div>
    </Card>
  );
}

function ArtistSpectator({ t }: { t: Dictionary }) {
  return (
    <Card
      variant="M"
      style={{ padding: "24px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, textAlign: "center" }}
    >
      <Icon name="eye-off" size={40} color="var(--opg-ink-secondary)" />
      <Marker size={30}>{t.doodleBluff.noPeekingOwnTitle}</Marker>
      <div style={{ fontSize: 18, fontWeight: 700 }}>{t.doodleBluff.roomIsVoting}</div>
    </Card>
  );
}

export function PhoneVote({ view, clock, send }: PhoneVoteProps) {
  const { t } = useLocale();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, flexGrow: 1 }}>
      <DrawingCard view={view} clock={clock} t={t} />
      {view.isArtist ? <ArtistSpectator t={t} /> : <NonArtist view={view} send={send} t={t} />}
    </div>
  );
}

function NonArtist({ view, send, t }: { view: DoodlePlayerView; send: (action: DoodleAction) => void; t: Dictionary }) {
  return view.myVote !== null ? <VoteLocked t={t} /> : <VoteForm view={view} send={send} t={t} />;
}
