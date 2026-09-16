// Real or Nah — phone controller. One phase component per screen.
import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode, RefObject } from "react";
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
  TextInput,
  Timer,
  useBuzz,
} from "@opg/ui";
import {
  LIE_MAX_LENGTH,
  type RonAction,
  type RonLieError,
  type RonPlayerView,
} from "../types";
import { PromptText } from "./common";
import { PhoneReveal } from "./PhoneReveal";

export interface PhoneProps {
  view: RonPlayerView;
  room: PlayerRoomView;
  deadline: number | null;
  timerStartedAt: number | null;
  clock: ServerClock;
  send: (action: RonAction) => void;
}

/** Only the player's own timed actions (writing, voting) get haptics and a draining ring. */
function timedPhase(phase: RonPlayerView["phase"]): boolean {
  return phase === "write" || phase === "vote";
}

export function Phone({ view, room, deadline, timerStartedAt, clock, send }: PhoneProps) {
  const timed = timedPhase(view.phase);
  return (
    <PhoneScreen>
      <PhoneStrip
        gameName="Real or Nah"
        progress={`Fact ${view.factNumber} of ${view.factCount}`}
        right={
          <Timer
            deadline={deadline}
            clock={clock}
            startedAt={timed ? timerStartedAt : null}
            haptics={timed}
          />
        }
      />
      <PhoneBody
        view={view}
        room={room}
        deadline={deadline}
        timerStartedAt={timerStartedAt}
        clock={clock}
        send={send}
      />
    </PhoneScreen>
  );
}

function PhoneBody({
  view,
  room,
  deadline,
  timerStartedAt,
  clock,
  send,
}: Omit<PhoneProps, "room"> & { room: PlayerRoomView }) {
  let phase: ReactNode;
  if (view.phase === "write") {
    phase = <WritePhase view={view} send={send} />;
  } else if (view.phase === "vote") {
    phase = <VotePhase view={view} send={send} />;
  } else {
    phase = (
      <PhoneReveal
        view={view}
        players={room.players}
        myId={room.you}
        deadline={deadline}
        timerStartedAt={timerStartedAt}
        clock={clock}
      />
    );
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

/** Buzzes "locked" the moment `myLie` first becomes non-null while this stays mounted. */
function useLieLockedBuzz(
  myLie: string | null,
  target: RefObject<HTMLElement | null>,
): void {
  const buzz = useBuzz();
  const wasLocked = useRef(myLie !== null);
  useEffect(() => {
    if (myLie !== null && !wasLocked.current) buzz("locked", target.current);
    wasLocked.current = myLie !== null;
  }, [myLie, target, buzz]);
}

/** Buzzes "soft" whenever a rejection is freshly set while this stays mounted. */
function useLieErrorBuzz(
  lieError: RonLieError | null,
  target: RefObject<HTMLElement | null>,
): void {
  const buzz = useBuzz();
  const previous = useRef(lieError);
  useEffect(() => {
    if (lieError !== null && lieError !== previous.current) {
      buzz("soft", target.current);
    }
    previous.current = lieError;
  }, [lieError, target, buzz]);
}

function WritePhase({
  view,
  send,
}: {
  view: RonPlayerView;
  send: (action: RonAction) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  useLieLockedBuzz(view.myLie, rootRef);
  useLieErrorBuzz(view.lieError, rootRef);
  return (
    <div ref={rootRef} style={{ display: "flex", flexDirection: "column", gap: "inherit", flexGrow: 1 }}>
      {view.myLie ? (
        <LieLocked view={view} />
      ) : (
        <WriteForm view={view} send={send} />
      )}
    </div>
  );
}

function WriteForm({
  view,
  send,
}: {
  view: RonPlayerView;
  send: (action: RonAction) => void;
}) {
  const [text, setText] = useState("");
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

/** Buzzes "locked" the moment `myPick` first becomes non-null while this stays mounted. */
function usePickLockedBuzz(
  myPick: string | null,
  target: RefObject<HTMLElement | null>,
): void {
  const buzz = useBuzz();
  const wasLocked = useRef(myPick !== null);
  useEffect(() => {
    if (myPick !== null && !wasLocked.current) buzz("locked", target.current);
    wasLocked.current = myPick !== null;
  }, [myPick, target, buzz]);
}

function VotePhase({
  view,
  send,
}: {
  view: RonPlayerView;
  send: (action: RonAction) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  usePickLockedBuzz(view.myPick, rootRef);
  return (
    <div ref={rootRef} style={{ display: "flex", flexDirection: "column", gap: "inherit", flexGrow: 1 }}>
      {view.myPick ? (
        <VoteLocked view={view} />
      ) : (
        <VoteForm view={view} send={send} />
      )}
    </div>
  );
}

function VoteForm({
  view,
  send,
}: {
  view: RonPlayerView;
  send: (action: RonAction) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const options = view.options ?? [];
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
