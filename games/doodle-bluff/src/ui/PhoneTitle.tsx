// The title phase: everyone but the artist writes a believable fake title for the drawing on
// screen; the artist sits tight. Follows Real or Nah's write-phase shape (games/real-or-nah/src/ui/Phone.tsx).
import { useState } from "react";
import type { ServerClock } from "@opg/ui";
import { Button, Card, DoodleView, Icon, Marker, TextInput } from "@opg/ui";
import { format, useLocale } from "@opg/i18n";
import type { Dictionary } from "@opg/i18n";
import { TITLE_MAX_LENGTH, type DoodleAction, type DoodlePlayerView, type DoodleTitleError } from "../state";

function titleErrorText(t: Dictionary, error: DoodleTitleError | null): string | undefined {
  if (error === null) return undefined;
  const errors = {
    truth: t.doodleBluff.titleErrorTruth,
    duplicate: t.doodleBluff.titleErrorDuplicate,
    invalid: t.doodleBluff.titleErrorInvalid,
  } satisfies Record<DoodleTitleError, string>;
  return errors[error];
}

export interface PhoneTitleProps {
  view: DoodlePlayerView;
  clock: ServerClock;
  send: (action: DoodleAction) => void;
}

function DrawingCard({ view, clock, t }: { view: DoodlePlayerView; clock: ServerClock; t: Dictionary }) {
  if (view.doodle === null) return null;
  const label = view.isArtist ? t.doodleBluff.yourDrawingLabel : t.doodleBluff.drawingToTitleLabel;
  return (
    <Card style={{ padding: 10, alignSelf: "center" }}>
      <DoodleView doodle={view.doodle} label={label} clock={clock} size={220} />
    </Card>
  );
}

function WaitingLine({ waiting, t }: { waiting: number; t: Dictionary }) {
  return (
    <>{waiting > 0 ? format(t.doodleBluff.waitingForMore, { count: waiting }) : t.doodleBluff.everyonesInReadyToVote}</>
  );
}

function ArtistWaiting({ view, t }: { view: DoodlePlayerView; t: Dictionary }) {
  const waiting = Math.max(0, view.playerCount - 1 - view.titledCount);
  return (
    <Card
      variant="M"
      style={{ padding: "24px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, textAlign: "center" }}
    >
      <Icon name="pencil" size={40} color="var(--opg-ink-secondary)" />
      <Marker size={30}>{t.doodleBluff.yourDrawingSitTight}</Marker>
      <div style={{ fontSize: 17, fontWeight: 700 }}>
        <WaitingLine waiting={waiting} t={t} />
      </div>
    </Card>
  );
}

function TitleForm({ view, send, t }: { view: DoodlePlayerView; send: (action: DoodleAction) => void; t: Dictionary }) {
  const [text, setText] = useState("");
  const ready = text.trim().length > 0;
  return (
    <>
      <Marker size={26}>{t.doodleBluff.giveItAGoodLie}</Marker>
      <TextInput
        label={t.doodleBluff.yourTitleLabel}
        value={text}
        onChange={setText}
        maxLength={TITLE_MAX_LENGTH}
        placeholder={t.doodleBluff.raccoonPlaceholder}
        autoComplete="off"
        error={titleErrorText(t, view.titleError)}
        hint={t.doodleBluff.titleHint}
      />
      <Button
        fullWidth
        disabled={!ready}
        onClick={() => {
          if (ready) send({ type: "title", text: text.trim() });
        }}
      >
        {t.doodleBluff.submitTitle}
        <Icon name="arrow-right" size={22} />
      </Button>
    </>
  );
}

function TitleLocked({ view, t }: { view: DoodlePlayerView; t: Dictionary }) {
  const waiting = Math.max(0, view.playerCount - 1 - view.titledCount);
  return (
    <Card
      variant="M"
      style={{ padding: "24px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, textAlign: "center" }}
    >
      <Icon name="check" size={40} color="var(--opg-marker)" />
      <Marker size={30}>{t.doodleBluff.titleLockedIn}</Marker>
      <div style={{ fontSize: 18, fontWeight: 700 }}>
        <WaitingLine waiting={waiting} t={t} />
      </div>
    </Card>
  );
}

export function PhoneTitle({ view, clock, send }: PhoneTitleProps) {
  const { t } = useLocale();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <DrawingCard view={view} clock={clock} t={t} />
      {view.isArtist ? <ArtistWaiting view={view} t={t} /> : <NonArtist view={view} send={send} t={t} />}
    </div>
  );
}

function NonArtist({ view, send, t }: { view: DoodlePlayerView; send: (action: DoodleAction) => void; t: Dictionary }) {
  return view.myTitle !== null ? <TitleLocked view={view} t={t} /> : <TitleForm view={view} send={send} t={t} />;
}
