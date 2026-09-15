// Real or Nah — phone controller. One phase component per screen.
import { useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import type { PlayerRoomView } from "@opg/protocol";
import type { ServerClock } from "@opg/ui";
import {
  Button,
  Card,
  Icon,
  LinedCard,
  Marker,
  PhaseEnter,
  PhoneScreen,
  PhoneStrip,
  PRESSABLE_CLASS,
  Stamp,
  TextInput,
  Timer,
} from "@opg/ui";
import {
  LIE_MAX_LENGTH,
  POINTS_TRUTH,
  type RonAction,
  type RonFooledLie,
  type RonLieError,
  type RonPlayerView,
  type RonReveal,
} from "../types";
import { Person, PromptText } from "./common";

export interface PhoneProps {
  view: RonPlayerView;
  room: PlayerRoomView;
  deadline: number | null;
  clock: ServerClock;
  send: (action: RonAction) => void;
}

export function Phone({ view, room, deadline, clock, send }: PhoneProps) {
  return (
    <PhoneScreen>
      <PhoneStrip
        gameName="Real or Nah"
        progress={`Fact ${view.factNumber} of ${view.factCount}`}
        right={<Timer deadline={deadline} clock={clock} />}
      />
      <PhoneBody view={view} room={room} send={send} />
    </PhoneScreen>
  );
}

function PhoneBody({
  view,
  room,
  send,
}: Pick<PhoneProps, "view" | "room" | "send">) {
  let phase: ReactNode;
  if (view.phase === "write") {
    phase = <WritePhase view={view} send={send} />;
  } else if (view.phase === "vote") {
    phase = <VotePhase view={view} send={send} />;
  } else {
    phase = <RevealPhase view={view} room={room} />;
  }
  return (
    <PhaseEnter phaseKey={`${view.factNumber}:${view.phase}`}>
      {phase}
    </PhaseEnter>
  );
}

const LIE_ERRORS = {
  truth: "That's the real answer! Write a lie instead.",
  duplicate: "Someone already wrote that. Try another.",
  invalid: "Keep it between 1 and 40 characters.",
} satisfies Record<RonLieError, string>;

function lieErrorText(error: RonLieError | null): string | undefined {
  return error ? LIE_ERRORS[error] : undefined;
}

function PromptLine({
  prompt,
  compact,
}: {
  prompt: string;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <Card style={{ padding: "12px 14px" }}>
        <PromptText
          prompt={prompt}
          blank={{
            width: 64,
            height: 10,
            thickness: 16,
            verticalAlign: "-1px",
          }}
          style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.35 }}
        />
      </Card>
    );
  }
  return (
    <LinedCard
      tilt={1}
      style={{ marginTop: 6, padding: "18px 18px 20px 56px" }}
    >
      <PromptText
        prompt={prompt}
        blank={{ width: 96, height: 14, thickness: 12, verticalAlign: "-2px" }}
        style={{ fontSize: 23, fontWeight: 700, lineHeight: "38px" }}
      />
    </LinedCard>
  );
}

function WritePhase({
  view,
  send,
}: {
  view: RonPlayerView;
  send: (action: RonAction) => void;
}) {
  const [text, setText] = useState("");

  if (view.myLie) return <LieLocked view={view} />;
  const ready = text.trim().length > 0;
  return (
    <>
      <PromptLine prompt={view.prompt} />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
          marginTop: 8,
        }}
      >
        <TextInput
          label="Your lie"
          value={text}
          onChange={setText}
          maxLength={LIE_MAX_LENGTH}
          placeholder="cane toads"
          autoComplete="off"
          error={lieErrorText(view.lieError)}
          hint="Make it believable. Don't write the real answer."
        />
        <Button
          fullWidth
          disabled={!ready}
          onClick={() => {
            if (ready) send({ type: "lie", text: text.trim() });
          }}
        >
          Submit lie
          <Icon name="arrow-right" size={22} />
        </Button>
      </div>
    </>
  );
}

function LieLocked({ view }: { view: RonPlayerView }) {
  const waiting = Math.max(0, view.playerCount - view.submittedCount);
  return (
    <>
      <PromptLine prompt={view.prompt} />
      <Card
        variant="M"
        tilt={1}
        style={{
          padding: "24px 20px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 8,
          textAlign: "center",
        }}
      >
        <Icon name="check" size={40} color="var(--opg-marker)" />
        <Marker size={32}>Lie locked in</Marker>
        <div style={{ fontSize: 18, fontWeight: 700 }}>
          {waiting > 0
            ? `Waiting for ${waiting} more`
            : "Everyone's in — get ready to vote"}
        </div>
      </Card>
    </>
  );
}

function VotePhase({
  view,
  send,
}: {
  view: RonPlayerView;
  send: (action: RonAction) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const options = view.options ?? [];

  if (view.myPick) return <VoteLocked view={view} />;
  const canLock = selected !== null;
  return (
    <>
      <PromptLine prompt={view.prompt} compact />
      <Marker size={28}>Which one is real?</Marker>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {options.map((option) => (
          <VoteRow
            key={option.id}
            text={option.text}
            mine={option.mine}
            selected={selected === option.id}
            onSelect={() => setSelected(option.id)}
          />
        ))}
      </div>
      <div style={{ marginTop: "auto" }}>
        <Button
          fullWidth
          disabled={!canLock}
          onClick={() => {
            if (selected) send({ type: "pick", optionId: selected });
          }}
        >
          <Icon name="check" size={22} />
          Lock in
        </Button>
      </div>
    </>
  );
}

function rowBackground(mine: boolean, selected: boolean): string {
  if (selected) return "var(--opg-highlight-soft)";
  if (mine) return "rgba(255, 255, 255, 0.6)";
  return "var(--opg-card)";
}

function rowBorder(mine: boolean, selected: boolean): string {
  if (mine) return "3px dashed var(--opg-muted)";
  if (selected) return "4px solid var(--opg-ink)";
  return "3px solid var(--opg-ink)";
}

function voteRowStyle(mine: boolean, selected: boolean): CSSProperties {
  return {
    minHeight: 52,
    boxSizing: "border-box",
    padding: selected || mine ? "0 12px 0 16px" : "0 16px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    background: rowBackground(mine, selected),
    border: rowBorder(mine, selected),
    borderRadius: selected
      ? "var(--opg-radius-m-alt)"
      : "var(--opg-radius-button)",
    fontFamily: "var(--opg-font-body)",
    fontSize: 20,
    fontWeight: 700,
    color: "var(--opg-ink)",
    textAlign: "left",
    cursor: mine ? "not-allowed" : "pointer",
  };
}

function VoteRow({
  text,
  mine,
  selected,
  onSelect,
}: {
  text: string;
  mine: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      disabled={mine}
      aria-pressed={mine ? undefined : selected}
      className={PRESSABLE_CLASS}
      onClick={mine ? undefined : onSelect}
      style={voteRowStyle(mine, selected)}
    >
      <div style={{ opacity: mine ? 0.45 : 1 }}>{text}</div>
      <RowHint mine={mine} selected={selected} />
    </button>
  );
}

function RowHint({ mine, selected }: { mine: boolean; selected: boolean }) {
  if (mine) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 16,
          fontWeight: 700,
          color: "var(--opg-ink-secondary)",
        }}
      >
        <Icon name="pencil" size={18} color="var(--opg-ink-secondary)" />
        <div>Your lie</div>
      </div>
    );
  }
  if (selected) {
    return <Icon name="check" size={28} color="var(--opg-marker)" />;
  }
  return null;
}

function VoteLocked({ view }: { view: RonPlayerView }) {
  return (
    <>
      <PromptLine prompt={view.prompt} compact />
      <Marker size={28}>Which one is real?</Marker>
      <Card
        variant="M"
        style={{
          padding: "24px 20px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 8,
          textAlign: "center",
        }}
      >
        <Icon name="check" size={40} color="var(--opg-marker)" />
        <Marker size={32}>Vote locked in</Marker>
        <div style={{ fontSize: 18, fontWeight: 700 }}>
          Hold tight for the reveal
        </div>
      </Card>
    </>
  );
}

const PHONE_LABEL = {
  fontSize: 17,
  fontWeight: 700,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "var(--opg-ink-secondary)",
} as const;

function FoundLine({ found }: { found: boolean }) {
  const color = found ? "var(--opg-marker)" : "var(--opg-ink-secondary)";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        fontSize: 18,
        fontWeight: 700,
        color,
      }}
    >
      <Icon name={found ? "check" : "eye-off"} size={20} color={color} />
      <div>
        {found
          ? `You found it, +${POINTS_TRUTH.toLocaleString("en-US")}`
          : "You missed it"}
      </div>
    </div>
  );
}

function RevealAnswerCard({
  reveal,
  found,
}: {
  reveal: RonReveal;
  found: boolean;
}) {
  return (
    <Card
      tilt={-1}
      style={{
        padding: "18px 18px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div style={PHONE_LABEL}>The real answer</div>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <span className="opg-marker" style={{ fontSize: 44 }}>
          {reveal.answer}
        </span>
        <Stamp size={26} tilt={-8}>
          REAL
        </Stamp>
      </div>
      <FoundLine found={found} />
    </Card>
  );
}

function FactPointsCard({ points }: { points: number }) {
  return (
    <Card
      style={{
        padding: "14px 16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
      }}
    >
      <div style={{ fontSize: 20, fontWeight: 700 }}>This fact</div>
      <div
        className="opg-marker"
        style={{
          fontSize: 40,
          color: points > 0 ? "var(--opg-ink)" : "var(--opg-ink-secondary)",
        }}
      >
        +{points.toLocaleString("en-US")}
      </div>
    </Card>
  );
}

function RevealPhase({
  view,
  room,
}: {
  view: RonPlayerView;
  room: PlayerRoomView;
}) {
  const reveal = view.reveal;
  if (!reveal) return null;
  const myLie = reveal.lies.find((lie) => lie.authorId === room.you);
  return (
    <>
      <RevealAnswerCard
        reveal={reveal}
        found={reveal.foundByIds.includes(room.you)}
      />
      <MyLieCard lie={myLie} room={room} />
      <FactPointsCard points={view.myPoints ?? 0} />
    </>
  );
}

function MyLieCard({
  lie,
  room,
}: {
  lie: RonFooledLie | undefined;
  room: PlayerRoomView;
}) {
  if (!lie) {
    return (
      <Card style={{ padding: "14px 16px" }}>
        <div style={PHONE_LABEL}>Your lie</div>
        <div style={{ fontSize: 20, fontWeight: 700, marginTop: 6 }}>
          No lie from you this round
        </div>
      </Card>
    );
  }
  const fooled = lie.fooledIds.length > 0;
  return (
    <Card
      variant="M"
      tilt={1}
      style={{
        padding: "14px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div style={PHONE_LABEL}>Your lie</div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div style={{ fontSize: 24, fontWeight: 700 }}>{lie.text}</div>
        <Stamp size={22} tilt={-6}>
          NAH
        </Stamp>
      </div>
      {fooled ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 700 }}>Fooled</div>
          {lie.fooledIds.map((id) => (
            <Person
              key={id}
              room={room}
              id={id}
              avatarSize={36}
              fontSize={18}
            />
          ))}
        </div>
      ) : (
        <div
          style={{
            fontSize: 18,
            fontWeight: 700,
            color: "var(--opg-ink-secondary)",
          }}
        >
          Fooled nobody
        </div>
      )}
    </Card>
  );
}
