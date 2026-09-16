// Imposter's own last chance to guess the crew's word, and the crew's waiting screen.
// The imposter's typing sends only a LENGTH to the TV (never letters), throttled so a fast
// typist can't flood the room with actions.
import { useEffect, useRef, useState } from "react";
import type { PlayerId, PlayerSummary } from "@opg/protocol";
import type { HeartbeatTempo, ServerClock } from "@opg/ui";
import {
  Avatar,
  Button,
  EyesOnTv,
  Highlight,
  Icon,
  LinedCard,
  Marker,
  PhoneStrip,
  TextInput,
  Timer,
} from "@opg/ui";
import { MAX_GUESS_LENGTH, POINTS_PER_WORD } from "../state";
import type { ImposterAction, ImposterPlayerView } from "../state";
import type { SectionProps } from "./Phone";

/** Last chance's own tempo switch: slow until the final 5 seconds, then fast. */
const LAST_CHANCE_FAST_MS = 5000;

/** At most one `typing` send per this window; the final length always lands. */
export const TYPING_THROTTLE_MS = 250;

function findPlayer(
  players: PlayerSummary[],
  id: PlayerId | null,
): PlayerSummary | null {
  if (!id) return null;
  return players.find((player) => player.id === id) ?? null;
}

function nameOf(players: PlayerSummary[], id: PlayerId | null): string {
  const player = findPlayer(players, id);
  if (player) return player.name;
  return id ?? "Someone";
}

function money(value: number): string {
  return value.toLocaleString("en-US");
}

function avatarAlt(me: PlayerSummary | null): string | undefined {
  return me === null ? undefined : `${me.name}'s avatar`;
}

function meName(me: PlayerSummary | null): string {
  return me?.name ?? "You";
}

function meAvatarId(me: PlayerSummary | null) {
  return me?.avatar ?? null;
}

function MeRow({ me }: { me: PlayerSummary | null }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <Avatar id={meAvatarId(me)} size={50} alt={avatarAlt(me)} />
      <div style={{ fontSize: 21, fontWeight: 700 }}>{meName(me)}</div>
    </div>
  );
}

export interface ThrottleState {
  lastSentAt: number;
  pending: number | null;
}

export function initialThrottleState(): ThrottleState {
  return { lastSentAt: -Infinity, pending: null };
}

export interface ThrottleStepInput {
  state: ThrottleState;
  length: number;
  now: number;
  intervalMs: number;
  /** Whether a trailing timeout from an earlier update is already scheduled. */
  timerScheduled: boolean;
}

export interface ThrottleStepResult {
  state: ThrottleState;
  /** Send this length now, or null when this update is being throttled. */
  sendNow: number | null;
  /** Schedule a new trailing timeout for this many ms, or null to reuse one already running. */
  scheduleDelayMs: number | null;
}

/**
 * Pure trailing-throttle step. At most one send per `intervalMs`; a throttled update is
 * remembered as `pending` so the caller's already-scheduled timeout can flush it later.
 */
export function throttleStep(input: ThrottleStepInput): ThrottleStepResult {
  const { state, length, now, intervalMs, timerScheduled } = input;
  const elapsed = now - state.lastSentAt;
  if (elapsed >= intervalMs) {
    return {
      state: { lastSentAt: now, pending: null },
      sendNow: length,
      scheduleDelayMs: null,
    };
  }
  const nextState = { ...state, pending: length };
  if (timerScheduled) {
    return { state: nextState, sendNow: null, scheduleDelayMs: null };
  }
  return {
    state: nextState,
    sendNow: null,
    scheduleDelayMs: intervalMs - elapsed,
  };
}

interface TypingSenderOptions {
  send: (action: ImposterAction) => void;
  clock: ServerClock;
  disabled: boolean;
}

/** Sends `{ type: "typing", length }` on a trailing throttle; never sends once disabled. */
function useTypingSender(options: TypingSenderOptions): (length: number) => void {
  const stateRef = useRef<ThrottleState>(initialThrottleState());
  const timeoutRef = useRef<number | null>(null);
  const liveRef = useRef(options);
  useEffect(() => {
    liveRef.current = options;
  });
  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    };
  }, []);

  return (length: number) => {
    const { send, clock, disabled } = liveRef.current;
    if (disabled) return;
    const result = throttleStep({
      state: stateRef.current,
      length,
      now: clock.now(),
      intervalMs: TYPING_THROTTLE_MS,
      timerScheduled: timeoutRef.current !== null,
    });
    stateRef.current = result.state;
    if (result.sendNow !== null) {
      send({ type: "typing", length: result.sendNow });
      return;
    }
    if (result.scheduleDelayMs !== null) {
      timeoutRef.current = window.setTimeout(() => {
        timeoutRef.current = null;
        const pending = stateRef.current.pending;
        stateRef.current = { ...stateRef.current, pending: null };
        // Re-check disabled/submitted here: the guess may have been sent (or the phase may
        // have moved on) between scheduling this trailing send and it firing.
        if (pending === null || liveRef.current.disabled) return;
        stateRef.current = {
          lastSentAt: liveRef.current.clock.now(),
          pending: null,
        };
        liveRef.current.send({ type: "typing", length: pending });
      }, result.scheduleDelayMs);
    }
  };
}

function GuessForm({
  view,
  send,
  clock,
}: {
  view: ImposterPlayerView;
  send: (action: ImposterAction) => void;
  clock: ServerClock;
}) {
  const [text, setText] = useState(view.myGuess ?? "");
  const [sent, setSent] = useState(view.myGuess !== null);
  const sendTyping = useTypingSender({ send, clock, disabled: sent });
  const canSubmit = !sent && text.trim().length > 0;
  let label = "Submit guess";
  if (sent) label = "Guess sent";

  const onChange = (value: string) => {
    setText(value);
    sendTyping(Array.from(value).length);
  };

  return (
    <>
      <TextInput
        label="Your guess"
        value={text}
        onChange={onChange}
        maxLength={MAX_GUESS_LENGTH}
        placeholder="Type the crew's word"
        disabled={sent}
      />
      <Button
        size="lg"
        fullWidth
        disabled={!canSubmit}
        disabledReason={sent ? "Guess sent" : undefined}
        onClick={() => {
          send({ type: "guess", text: text.trim() });
          setSent(true);
        }}
      >
        <span>{label}</span>
        <Icon name="arrow-right" size={22} color="var(--opg-paper)" />
      </Button>
    </>
  );
}

/** The imposter's own last-chance screen: guess the crew's word before time runs out. */
export function GuessView(props: SectionProps) {
  const { view, me, deadline, timerStartedAt, clock, send } = props;
  return (
    <>
      <PhoneStrip
        gameName="Imposter"
        progress="Last chance"
        right={
          <Timer
            deadline={deadline}
            clock={clock}
            startedAt={timerStartedAt}
            haptics
          />
        }
      />
      <LinedCard
        tilt={1}
        style={{
          flexGrow: 1,
          marginTop: 8,
          padding: "24px 20px 24px 56px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 18,
        }}
      >
        <Marker
          size={40}
          color="var(--opg-marker)"
          style={{ transform: "rotate(-3deg)" }}
        >
          You got caught!
        </Marker>
        <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.4 }}>
          Guess the crew&apos;s word. Get it right and you steal{" "}
          {money(POINTS_PER_WORD)} points.
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 8,
            fontSize: 19,
          }}
        >
          <div style={{ fontWeight: 400 }}>Your decoy was</div>
          <Highlight style={{ padding: "0 6px" }}>
            <strong style={{ fontWeight: 700, letterSpacing: "0.04em" }}>
              {view.decoyWord ?? "—"}
            </strong>
          </Highlight>
        </div>
      </LinedCard>
      <GuessForm view={view} send={send} clock={clock} />
      <MeRow me={me} />
    </>
  );
}

/** Switches from "slow" to "fast" at the 5-second mark, via one timeout — never an interval. */
function useLastChanceTempo(
  deadline: number | null,
  clock: ServerClock,
): HeartbeatTempo {
  const [fast, setFast] = useState(false);
  const clockRef = useRef(clock);
  useEffect(() => {
    clockRef.current = clock;
  });
  useEffect(() => {
    if (deadline === null) return undefined;
    const msToFast = deadline - LAST_CHANCE_FAST_MS - clockRef.current.now();
    if (msToFast <= 0) {
      setFast(true);
      return undefined;
    }
    const id = window.setTimeout(() => setFast(true), msToFast);
    return () => window.clearTimeout(id);
  }, [deadline]);
  return fast ? "fast" : "slow";
}

/** The crew's screen while the imposter guesses: eyes on the TV, tempo rising near the end. */
export function GuessWaiting(props: SectionProps) {
  const { view, players, deadline, clock } = props;
  const imposter = nameOf(players, view.imposterId);
  const tempo = useLastChanceTempo(deadline, clock);
  return (
    <>
      <PhoneStrip
        gameName="Imposter"
        progress="Last chance"
        right={<Timer deadline={deadline} clock={clock} />}
      />
      <EyesOnTv
        title={`${imposter} is guessing…`}
        detail="Eyes on the TV"
        tempo={tempo}
      />
    </>
  );
}
