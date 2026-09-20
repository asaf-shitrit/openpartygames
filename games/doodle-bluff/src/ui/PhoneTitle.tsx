// The title phase: everyone but the artist writes a believable fake title for the drawing on
// screen; the artist sits tight. Follows Real or Nah's write-phase shape (games/real-or-nah/src/ui/Phone.tsx).
import { useState } from "react";
import type { ServerClock } from "@opg/ui";
import { Button, Card, DoodleView, Icon, Marker, TextInput } from "@opg/ui";
import { TITLE_MAX_LENGTH, type DoodleAction, type DoodlePlayerView, type DoodleTitleError } from "../state";

const TITLE_ERRORS = {
  truth: "That's the real title! Write a lie instead.",
  duplicate: "Someone already wrote that. Try another.",
  invalid: "Keep it between 1 and 40 characters.",
} satisfies Record<DoodleTitleError, string>;

function titleErrorText(error: DoodleTitleError | null): string | undefined {
  return error ? TITLE_ERRORS[error] : undefined;
}

export interface PhoneTitleProps {
  view: DoodlePlayerView;
  clock: ServerClock;
  send: (action: DoodleAction) => void;
}

function DrawingCard({ view, clock }: { view: DoodlePlayerView; clock: ServerClock }) {
  if (view.doodle === null) return null;
  return (
    <Card style={{ padding: 10, alignSelf: "center" }}>
      <DoodleView doodle={view.doodle} label={view.isArtist ? "Your drawing" : "The drawing to title"} clock={clock} size={220} />
    </Card>
  );
}

function ArtistWaiting({ view }: { view: DoodlePlayerView }) {
  const waiting = Math.max(0, view.playerCount - 1 - view.titledCount);
  return (
    <Card
      variant="M"
      style={{ padding: "24px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, textAlign: "center" }}
    >
      <Icon name="pencil" size={40} color="var(--opg-ink-secondary)" />
      <Marker size={30}>Your drawing — sit tight</Marker>
      <div style={{ fontSize: 17, fontWeight: 700 }}>
        {waiting > 0 ? `Waiting for ${waiting} more` : "Everyone's in — get ready to vote"}
      </div>
    </Card>
  );
}

function TitleForm({ view, send }: { view: DoodlePlayerView; send: (action: DoodleAction) => void }) {
  const [text, setText] = useState("");
  const ready = text.trim().length > 0;
  return (
    <>
      <Marker size={26}>Give it a good lie</Marker>
      <TextInput
        label="Your title"
        value={text}
        onChange={setText}
        maxLength={TITLE_MAX_LENGTH}
        placeholder="a raccoon on rollerskates"
        autoComplete="off"
        error={titleErrorText(view.titleError)}
        hint="Not the real title. Make it sound like it could be."
      />
      <Button
        fullWidth
        disabled={!ready}
        onClick={() => {
          if (ready) send({ type: "title", text: text.trim() });
        }}
      >
        Submit title
        <Icon name="arrow-right" size={22} />
      </Button>
    </>
  );
}

function TitleLocked({ view }: { view: DoodlePlayerView }) {
  const waiting = Math.max(0, view.playerCount - 1 - view.titledCount);
  return (
    <Card
      variant="M"
      style={{ padding: "24px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, textAlign: "center" }}
    >
      <Icon name="check" size={40} color="var(--opg-marker)" />
      <Marker size={30}>Title locked in</Marker>
      <div style={{ fontSize: 18, fontWeight: 700 }}>
        {waiting > 0 ? `Waiting for ${waiting} more` : "Everyone's in — get ready to vote"}
      </div>
    </Card>
  );
}

export function PhoneTitle({ view, clock, send }: PhoneTitleProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <DrawingCard view={view} clock={clock} />
      {view.isArtist ? <ArtistWaiting view={view} /> : <NonArtist view={view} send={send} />}
    </div>
  );
}

function NonArtist({ view, send }: { view: DoodlePlayerView; send: (action: DoodleAction) => void }) {
  return view.myTitle !== null ? <TitleLocked view={view} /> : <TitleForm view={view} send={send} />;
}
