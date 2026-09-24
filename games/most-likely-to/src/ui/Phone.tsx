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
import { format, useLocale } from "@opg/i18n";
import type { Dictionary } from "@opg/i18n";
import type { MltAction, MltHostView, MltPhase, MltPlayerView } from "../state";
import { avatarOf, findPlayer, nameOf, PromptLine } from "./common";
import { PhoneReveal } from "./PhoneReveal";
import { StageVote } from "./stage/Vote";

interface SectionProps {
  view: MltPlayerView;
  players: PlayerSummary[];
  me: PlayerSummary | null;
  deadline: number | null;
  timerStartedAt: number | null;
  clock: ServerClock;
  send: (action: MltAction) => void;
  /** The host view, in a no-TV room only; null in a room with a shared screen. */
  stage: MltHostView | null;
}

function Strip({ progress, t }: { progress: string; t: Dictionary }) {
  return <PhoneStrip gameName={t.mostLikelyTo.title} progress={progress} />;
}

function progressFor(t: Dictionary, view: MltPlayerView): string {
  return view.phase === "vote"
    ? t.mostLikelyTo.voteProgress
    : t.mostLikelyTo.verdictProgress;
}

/**
 * A shared-screen room fits the phone column to the screen, so this list is the one
 * flexible region that gives up space and scrolls internally (basis 0, so it never sizes
 * itself from its rows and pushes "Lock in vote" off the bottom edge). A no-TV room stacks
 * the staged prompt above this same list, which is already more content than a shared-screen
 * phone carries; forcing that combination into one screen-height would starve the list to a
 * sliver (or, with an unbounded container, to nothing — flex-basis 0 has no free space to
 * grow into when the column's height is auto). So a no-TV list takes its natural size and the
 * whole screen scrolls instead.
 */
function voteListStyle(fits: boolean): CSSProperties {
  return {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    padding: "4px 2px",
    ...(fits
      ? { flex: "1 1 0", minHeight: 0, overflowY: "auto" }
      : { flexShrink: 0 }),
  };
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

function VotePickMark({ selected, t }: { selected: boolean; t: Dictionary }) {
  if (!selected)
    return <Icon name="pencil" size={30} color="var(--opg-muted)" />;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <Icon name="check" size={28} color="var(--opg-marker)" />
      <div style={{ fontSize: 17, fontWeight: 700 }}>{t.mostLikelyTo.yourPick}</div>
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
  t,
}: {
  id: PlayerId;
  index: number;
  selected: boolean;
  isMe: boolean;
  players: PlayerSummary[];
  onPick: () => void;
  t: Dictionary;
}) {
  const name = nameOf(players, id, t.common.someone);
  const label = isMe ? `${name}${t.mostLikelyTo.youSuffix}` : name;
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
        alt={format(t.mostLikelyTo.avatarAlt, { name })}
      />
      <div style={{ flexGrow: 1, fontSize: 21, fontWeight: 700 }}>
        {label}
      </div>
      <VotePickMark selected={selected} t={t} />
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

interface PickLabel {
  isSelf: boolean;
  label: string;
}

/** `yourself` for a self-vote, otherwise the pick's name (or `someone` for a kicked player). */
function pickLabelFor(
  t: Dictionary,
  myVote: PlayerId | null,
  meId: PlayerId | undefined,
  votedFor: PlayerSummary | null,
): PickLabel {
  const isSelf = myVote !== null && myVote === meId;
  return {
    isSelf,
    label: isSelf ? t.mostLikelyTo.yourself : (votedFor?.name ?? t.common.someone),
  };
}

function VoteLocked(
  props: SectionProps & { pulseRef?: RefObject<HTMLDivElement | null> },
) {
  const { view, players, me, deadline, clock, pulseRef, stage } = props;
  const { t } = useLocale();
  const votedFor = findPlayer(players, view.myVote);
  const { isSelf, label: pickLabel } = pickLabelFor(t, view.myVote, me?.id, votedFor);
  return (
    <>
      <Strip progress={progressFor(t, view)} t={t} />
      {stage !== null ? <StageVote view={stage} players={players} /> : null}
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
              {t.mostLikelyTo.voteLockedIn}
            </div>
            {isSelf ? null : (
              <Avatar
                id={avatarOf(players, view.myVote)}
                size={56}
                alt={format(t.mostLikelyTo.avatarAlt, { name: pickLabel })}
                style={{ alignSelf: "center" }}
              />
            )}
          </div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>
            {format(t.mostLikelyTo.youPicked, { name: pickLabel })}
          </div>
          <div style={{ fontSize: 17, color: "var(--opg-ink-secondary)" }}>
            {format(t.mostLikelyTo.votedOfTotalPhone, {
              voted: view.votedCount,
              total: view.playerCount,
            })}
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
  const { view, players, me, deadline, clock, send, stage } = props;
  const { t } = useLocale();
  const [pick, setPick] = useState<PlayerId | null>(null);
  const [sent, setSent] = useState(false);

  return (
    <>
      <Strip progress={progressFor(t, view)} t={t} />
      {stage !== null ? <StageVote view={stage} players={players} /> : null}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <PromptLine prompt={view.prompt} size={22} />
        <Timer deadline={deadline} clock={clock} style={{ marginTop: 4 }} />
      </div>
      <div style={voteListStyle(stage === null)}>
        {view.voteCandidates.map((id, index) => (
          <VoteRow
            key={id}
            id={id}
            index={index}
            selected={pick === id}
            isMe={id === me?.id}
            players={players}
            onPick={() => setPick(id)}
            t={t}
          />
        ))}
      </div>
      <Button
        size="lg"
        fullWidth
        disabled={pick === null || sent}
        disabledReason={pick === null ? t.mostLikelyTo.pickSomeoneFirst : undefined}
        onClick={() => {
          if (pick === null || sent) return;
          setSent(true);
          send({ type: "vote", target: pick });
        }}
      >
        <Icon name="lock" size={22} color="var(--opg-paper)" />
        <span>{t.mostLikelyTo.lockInVote}</span>
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
  const { view, players, me, deadline, timerStartedAt, clock, stage } = props;
  return (
    <PhoneReveal
      view={view}
      players={players}
      me={me}
      deadline={deadline}
      timerStartedAt={timerStartedAt}
      clock={clock}
      stage={stage}
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
  /** The host view, in a no-TV room only; null in a room with a shared screen. */
  stage: MltHostView | null;
}

export function Phone({
  view,
  room,
  deadline,
  timerStartedAt,
  clock,
  send,
  stage,
}: PhoneProps) {
  return (
    // A shared-screen room fits: header, prompt and list, action. A no-TV room adds the
    // staged prompt/roll-call above that, which makes this screen genuinely long content —
    // let it scroll instead of squeezing the candidate list into a sliver of leftover space.
    <PhoneScreen fit={view.phase === "vote" && stage === null}>
      <PhaseEnter phaseKey={`${view.roundNumber}:${view.phase}`}>
        {renderPhase({
          view,
          players: room.players,
          me: findPlayer(room.players, room.you),
          deadline,
          timerStartedAt,
          clock,
          send,
          stage,
        })}
      </PhaseEnter>
    </PhoneScreen>
  );
}
