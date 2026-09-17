// Phone screens for Most Likely To. Renders only the player's own view.
import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode, RefObject } from "react";
import type { PlayerId, PlayerRoomView, PlayerSummary } from "@opg/protocol";
import type { ServerClock } from "@opg/ui";
import {
  Avatar,
  Button,
  Card,
  Icon,
  PhaseEnter,
  PhoneScreen,
  PhoneStrip,
  PRESSABLE_CLASS,
  Timer,
  useBuzz,
} from "@opg/ui";
import type { MltAction, MltPhase, MltPlayerView } from "../state";
import { avatarOf, findPlayer, nameOf, PromptLine } from "./common";
import { PhoneReveal } from "./PhoneReveal";

interface SectionProps {
  view: MltPlayerView;
  players: PlayerSummary[];
  me: PlayerSummary | null;
  deadline: number | null;
  timerStartedAt: number | null;
  clock: ServerClock;
  send: (action: MltAction) => void;
}

function Strip({ progress }: { progress: string }) {
  return <PhoneStrip gameName="Most Likely To" progress={progress} />;
}

function progressFor(view: MltPlayerView): string {
  return view.phase === "vote" ? "Vote" : "Here comes the verdict";
}

function voteRowStyle(index: number, selected: boolean): CSSProperties {
  return {
    minHeight: 66,
    padding: selected ? "0 14px 0 12px" : "0 16px 0 12px",
    display: "flex",
    alignItems: "center",
    gap: 14,
    width: "100%",
    textAlign: "left",
    color: "var(--opg-ink)",
    background: selected ? "var(--opg-highlight-soft)" : "var(--opg-card)",
    border: selected
      ? "5px solid var(--opg-marker)"
      : "4px solid var(--opg-ink)",
    borderRadius:
      index % 2 === 0 ? "var(--opg-radius-m)" : "var(--opg-radius-m-alt)",
    transform: selected ? "rotate(-1deg)" : undefined,
  };
}

function VotePickMark({ selected }: { selected: boolean }) {
  if (!selected)
    return <Icon name="pencil" size={30} color="var(--opg-muted)" />;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <Icon name="check" size={28} color="var(--opg-marker)" />
      <div style={{ fontSize: 17, fontWeight: 700 }}>Your pick</div>
    </div>
  );
}

function VoteRow({
  id,
  index,
  selected,
  isMe,
  players,
  onPick,
}: {
  id: PlayerId;
  index: number;
  selected: boolean;
  isMe: boolean;
  players: PlayerSummary[];
  onPick: () => void;
}) {
  const name = nameOf(players, id);
  const label = isMe ? `${name} (You)` : name;
  return (
    <button
      type="button"
      className={`opg-reset ${PRESSABLE_CLASS}`}
      onClick={onPick}
      style={voteRowStyle(index, selected)}
    >
      <Avatar
        id={avatarOf(players, id)}
        size={48}
        alt={`${name}'s avatar`}
      />
      <div style={{ flexGrow: 1, fontSize: 21, fontWeight: 700 }}>
        {label}
      </div>
      <VotePickMark selected={selected} />
    </button>
  );
}

/** Buzzes "locked" the moment `myVote` flips from null to set while mounted; a remount
 * that arrives already locked (a reconnect) never buzzes. */
function useVoteLockBuzz(
  myVote: PlayerId | null,
  ref: RefObject<HTMLDivElement | null>,
): void {
  const buzz = useBuzz();
  const buzzRef = useRef(buzz);
  useEffect(() => {
    buzzRef.current = buzz;
  });
  const mountedRef = useRef(false);
  const prevRef = useRef(myVote);
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      prevRef.current = myVote;
      return;
    }
    const justLocked = prevRef.current === null && myVote !== null;
    prevRef.current = myVote;
    if (justLocked) buzzRef.current("locked", ref.current);
  }, [myVote, ref]);
}

function VoteLocked(
  props: SectionProps & { pulseRef?: RefObject<HTMLDivElement | null> },
) {
  const { view, players, me, deadline, clock, pulseRef } = props;
  const votedFor = findPlayer(players, view.myVote);
  const isSelf = view.myVote !== null && view.myVote === me?.id;
  const pickLabel = isSelf ? "yourself" : (votedFor?.name ?? "Someone");
  return (
    <>
      <Strip progress={progressFor(view)} />
      <div ref={pulseRef}>
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
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div
              className="opg-marker"
              style={{ fontSize: 32, color: "var(--opg-ink)" }}
            >
              Vote locked in
            </div>
            {isSelf ? null : (
              <Avatar
                id={avatarOf(players, view.myVote)}
                size={56}
                alt={`${pickLabel}'s avatar`}
                style={{ alignSelf: "center" }}
              />
            )}
          </div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>
            You picked {pickLabel}.
          </div>
          <div style={{ fontSize: 17, color: "var(--opg-ink-secondary)" }}>
            {view.votedCount} of {view.playerCount} voted
          </div>
        </Card>
      </div>
      <Timer
        deadline={deadline}
        clock={clock}
        style={{ alignSelf: "center" }}
      />
    </>
  );
}

/**
 * The picking form. It unmounts while a vote is locked and is keyed by round and roster,
 * so a kick that clears `myVote`, a vote the server dropped because its target was kicked,
 * or a fresh round always starts from a clean pick/sent state.
 */
function VoteForm(props: SectionProps) {
  const { view, players, me, deadline, clock, send } = props;
  const [pick, setPick] = useState<PlayerId | null>(null);
  const [sent, setSent] = useState(false);

  return (
    <>
      <Strip progress={progressFor(view)} />
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <PromptLine prompt={view.prompt} size={22} />
        <Timer deadline={deadline} clock={clock} style={{ marginTop: 4 }} />
      </div>
      <div
        style={{
          flexGrow: 1,
          minHeight: 0,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 10,
          padding: "4px 2px",
        }}
      >
        {view.voteCandidates.map((id, index) => (
          <VoteRow
            key={id}
            id={id}
            index={index}
            selected={pick === id}
            isMe={id === me?.id}
            players={players}
            onPick={() => setPick(id)}
          />
        ))}
      </div>
      <Button
        size="lg"
        fullWidth
        disabled={pick === null || sent}
        disabledReason={pick === null ? "Pick someone first" : undefined}
        onClick={() => {
          if (pick === null || sent) return;
          setSent(true);
          send({ type: "vote", target: pick });
        }}
      >
        <Icon name="lock" size={22} color="var(--opg-paper)" />
        <span>Lock in vote</span>
      </Button>
    </>
  );
}

function VoteView(props: SectionProps) {
  const { view } = props;
  const lockRef = useRef<HTMLDivElement>(null);
  useVoteLockBuzz(view.myVote, lockRef);
  if (view.myVote !== null) {
    return <VoteLocked {...props} pulseRef={lockRef} />;
  }
  const formKey = `${view.roundNumber}:${view.voteCandidates.join(",")}`;
  return <VoteForm key={formKey} {...props} />;
}

function revealPhase(props: SectionProps) {
  const { view, players, me, deadline, timerStartedAt, clock } = props;
  return (
    <PhoneReveal
      view={view}
      players={players}
      me={me}
      deadline={deadline}
      timerStartedAt={timerStartedAt}
      clock={clock}
    />
  );
}

type PhaseComponent = (props: SectionProps) => ReactNode;

const PHONE_PHASES = {
  vote: VoteView,
  reveal: revealPhase,
} satisfies Record<MltPhase, PhaseComponent>;

function renderPhase(props: SectionProps): ReactNode {
  const Phase = PHONE_PHASES[props.view.phase];
  return <Phase {...props} />;
}

export interface PhoneProps {
  view: MltPlayerView;
  room: PlayerRoomView;
  deadline: number | null;
  timerStartedAt: number | null;
  clock: ServerClock;
  send: (action: MltAction) => void;
}

export function Phone({
  view,
  room,
  deadline,
  timerStartedAt,
  clock,
  send,
}: PhoneProps) {
  return (
    <PhoneScreen>
      <PhaseEnter phaseKey={`${view.roundNumber}:${view.phase}`}>
        {renderPhase({
          view,
          players: room.players,
          me: findPlayer(room.players, room.you),
          deadline,
          timerStartedAt,
          clock,
          send,
        })}
      </PhaseEnter>
    </PhoneScreen>
  );
}
