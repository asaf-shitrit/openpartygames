// Phone screens for Imposter. Renders only the player's own view — never anyone's secret.
import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode, RefObject } from "react";
import type { PlayerId, PlayerRoomView, PlayerSummary } from "@opg/protocol";
import type { ServerClock } from "@opg/ui";
import {
  Avatar,
  Button,
  Card,
  FlipCard,
  Highlight,
  Icon,
  Marker,
  PhaseEnter,
  PhoneScreen,
  PhoneStrip,
  PRESSABLE_CLASS,
  StickyNote,
  Timer,
  useBuzz,
} from "@opg/ui";
import type {
  ImposterAction,
  ImposterHostView,
  ImposterPhase,
  ImposterPlayerView,
} from "../state";
import { GuessView, GuessWaiting } from "./PhoneLastChance";
import { PhoneReveal } from "./PhoneReveal";
import { PhoneResult } from "./PhoneResult";
import { StageClues } from "./stage/Clues";
import { StageVote } from "./stage/Vote";
import { StageWordCheck } from "./stage/WordCheck";

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

function avatarOf(players: PlayerSummary[], id: PlayerId | null) {
  return findPlayer(players, id)?.avatar ?? null;
}

function displayName(me: PlayerSummary | null): string {
  return me?.name ?? "?";
}

function avatarAlt(me: PlayerSummary | null): string | undefined {
  return me === null ? undefined : `${me.name}'s avatar`;
}

/** The result phase's own progress label: "Word N of M", or a heads-up on the last word. */
function resultProgress(view: ImposterPlayerView): string {
  if (view.wordNumber >= view.wordCount) return "Final scores next";
  return `Word ${view.wordNumber} of ${view.wordCount}`;
}

function progressFor(view: ImposterPlayerView): string {
  const byPhase = {
    "word-check": `Word ${view.wordNumber} of ${view.wordCount}`,
    clues: `Word ${view.wordNumber} of ${view.wordCount}`,
    vote: "Vote",
    reveal: "The votes are in",
    "last-chance": "Last chance",
    result: resultProgress(view),
  } satisfies Record<ImposterPhase, string>;
  return byPhase[view.phase];
}

interface SectionProps {
  view: ImposterPlayerView;
  players: PlayerSummary[];
  me: PlayerSummary | null;
  deadline: number | null;
  timerStartedAt: number | null;
  clock: ServerClock;
  send: (action: ImposterAction) => void;
  /** The host view, in a no-TV room only; null in a room with a shared screen. */
  stage: ImposterHostView | null;
}

export type { SectionProps };

function Strip({ progress, right }: { progress: string; right?: ReactNode }) {
  return <PhoneStrip gameName="Imposter" progress={progress} right={right} />;
}

/** Position of the current speaker in the clue order, 1-based; 0 when nobody is speaking. */
function speakerTurnNumber(view: ImposterPlayerView): number {
  const speaker = view.currentSpeakerId;
  if (speaker === null) return 0;
  const index = view.clueOrder.indexOf(speaker);
  return index === -1 ? 0 : index + 1;
}

/** Replaces the countdown in the clue phase's timer slot: there is no deadline any more, so
 * this shows whose turn it is in the order instead of time left. */
function TurnPill({ view }: { view: ImposterPlayerView }) {
  return (
    <div
      style={{
        fontSize: 16,
        fontWeight: 700,
        padding: "6px 14px",
        border: "3px solid var(--opg-ink)",
        borderRadius: 999,
        background: "var(--opg-card)",
      }}
    >
      {speakerTurnNumber(view)} of {view.clueOrder.length}
    </div>
  );
}

/** The word-card strip's right slot: the clue phase has no deadline, so it shows the turn
 * position instead of the word-check countdown. */
function WordCardTimerSlot({
  view,
  deadline,
  clock,
}: {
  view: ImposterPlayerView;
  deadline: number | null;
  clock: ServerClock;
}) {
  if (view.phase === "clues") return <TurnPill view={view} />;
  return <Timer deadline={deadline} clock={clock} />;
}

/** The speaking player's own timer slot: same circular shape as the Timer it replaces, but
 * showing their position in the order instead of a countdown. */
function YourTurnBadge({ view }: { view: ImposterPlayerView }) {
  return (
    <div
      style={{
        width: 120,
        height: 120,
        marginTop: 8,
        borderRadius: "50%",
        border: "4px solid var(--opg-ink)",
        background: "var(--opg-highlight-soft)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 2,
      }}
    >
      <div style={{ fontSize: 44, fontWeight: 700, lineHeight: 1 }}>
        {speakerTurnNumber(view)}
      </div>
      <div style={{ fontSize: 16, fontWeight: 700 }}>
        of {view.clueOrder.length}
      </div>
    </div>
  );
}

const HIDE_LABELS = {
  full: { shown: "Hide word", hidden: "Show word" },
  compact: { shown: "Hide", hidden: "Show" },
};

function hideLabel(hidden: boolean, compact: boolean): string {
  const labels = compact ? HIDE_LABELS.compact : HIDE_LABELS.full;
  return hidden ? labels.hidden : labels.shown;
}

function hideDims(compact: boolean) {
  if (compact) {
    return { height: 44, padding: "0 14px", fontSize: 17, iconSize: 20 };
  }
  return { height: 56, padding: "0 22px", fontSize: 19, iconSize: 22 };
}

function HideButton({
  hidden,
  onToggle,
  compact = false,
}: {
  hidden: boolean;
  onToggle: () => void;
  compact?: boolean;
}) {
  const dims = hideDims(compact);
  return (
    <button
      type="button"
      className={`opg-reset ${PRESSABLE_CLASS}`}
      onClick={onToggle}
      style={{
        height: dims.height,
        padding: dims.padding,
        display: "flex",
        alignItems: "center",
        gap: 8,
        background: "var(--opg-ink)",
        color: "var(--opg-paper)",
        borderRadius: "var(--opg-radius-button)",
        fontSize: dims.fontSize,
        fontWeight: 700,
      }}
    >
      <Icon name="eye-off" size={dims.iconSize} color="var(--opg-paper)" />
      <span>{hideLabel(hidden, compact)}</span>
    </button>
  );
}

function MeTag({ me }: { me: PlayerSummary | null }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <Avatar id={me?.avatar ?? null} size={44} alt={avatarAlt(me)} />
      <div style={{ fontSize: 20, fontWeight: 700 }}>{displayName(me)}</div>
    </div>
  );
}

function meName(me: PlayerSummary | null): string {
  return me?.name ?? "You";
}

function meAvatarId(me: PlayerSummary | null) {
  return me?.avatar ?? null;
}

/** Avatar + name footer shared by the word and guess screens. */
function MeRow({ me }: { me: PlayerSummary | null }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <Avatar id={meAvatarId(me)} size={50} alt={avatarAlt(me)} />
      <div style={{ fontSize: 21, fontWeight: 700 }}>{meName(me)}</div>
    </div>
  );
}

function clueSubtitle(args: {
  view: ImposterPlayerView;
  players: PlayerSummary[];
  meId: PlayerId | null;
  myIndex: number;
  speakerIndex: number;
}): string {
  const { view, players, meId, myIndex, speakerIndex } = args;
  if (view.nextSpeakerId === meId) return "You're up next!";
  if (myIndex > speakerIndex && myIndex > 0) {
    const before = nameOf(players, view.clueOrder[myIndex - 1] ?? null);
    return `You're up after ${before}`;
  }
  return "Your clue is in";
}

interface ClueBannerCopy {
  title: string;
  sub: string;
}

function clueBannerCopy(args: {
  view: ImposterPlayerView;
  players: PlayerSummary[];
  meId: PlayerId | null;
}): ClueBannerCopy {
  const { view, players, meId } = args;
  const speakerId = view.currentSpeakerId;
  const speaker = findPlayer(players, speakerId);
  if (speaker === null || speakerId === null) {
    return {
      title: "Read your word on your phone",
      sub: "Clues start in a moment",
    };
  }
  const myIndex = meId === null ? -1 : view.clueOrder.indexOf(meId);
  return {
    title: `${speaker.name} is giving a clue`,
    sub: clueSubtitle({
      view,
      players,
      meId,
      myIndex,
      speakerIndex: view.clueOrder.indexOf(speakerId),
    }),
  };
}

function ClueBanner({
  view,
  players,
  me,
}: {
  view: ImposterPlayerView;
  players: PlayerSummary[];
  me: PlayerSummary | null;
}) {
  const { title, sub } = clueBannerCopy({
    view,
    players,
    meId: me?.id ?? null,
  });
  return (
    <StickyNote
      tilt={-1.5}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 14px",
      }}
    >
      <Avatar id={avatarOf(players, view.currentSpeakerId)} size={48} />
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.25 }}>
          {title}
        </div>
        <div style={{ fontSize: 17, fontWeight: 400, lineHeight: 1.25 }}>
          {sub}
        </div>
      </div>
    </StickyNote>
  );
}

interface WordPanelCopy {
  title: string;
  label: string;
  desc: string;
}

function wordPanelCopy(isImposter: boolean): WordPanelCopy {
  if (isImposter) {
    return {
      title: "Psst… you're the imposter",
      label: "Your decoy word",
      desc: "Everyone else has a word from the same family. Blend in, and don't get caught.",
    };
  }
  return {
    title: "Shh… here's your word",
    label: "Your secret word",
    desc: "Someone has a decoy from the same family. Prove you know yours without giving it away.",
  };
}

/** The word-check card's face-up content. Only mounted once the card is flipped, so the
 * word never touches the DOM before that. */
function WordPanel({ view }: { view: ImposterPlayerView }) {
  const isImposter = view.role === "imposter";
  const { title, label, desc } = wordPanelCopy(isImposter);
  return (
    <div
      style={{
        flexGrow: 1,
        width: "100%",
        padding: "24px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <Marker
        size={27}
        color={isImposter ? "var(--opg-marker)" : undefined}
        style={{ transform: "rotate(-2deg)" }}
      >
        {title}
      </Marker>
      <div style={{ marginTop: "auto", fontSize: 19, fontWeight: 700 }}>
        {label}
      </div>
      <Highlight style={{ alignSelf: "flex-start", padding: "0 10px" }}>
        <Marker size={isImposter ? 72 : 56}>{view.word ?? "—"}</Marker>
      </Highlight>
      <div style={{ marginBottom: "auto", fontSize: 19, lineHeight: 1.4 }}>
        {desc}
      </div>
    </div>
  );
}

/** The card's back: identical for crew and the imposter, so a peek never leaks a role. */
function WordCardBack() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 14,
      }}
    >
      <Icon name="cards" size={56} color="var(--opg-ink-secondary)" />
      <Marker size={26}>Hold to peek</Marker>
    </div>
  );
}

/** The stage region above the card: deliberately empty during word-check (§4), the clue-order
 * strip during clues. Never both a secret and a look-at-me stage at once. */
function WordCardStage({
  phase,
  stage,
  players,
}: {
  phase: ImposterPhase;
  stage: ImposterHostView | null;
  players: PlayerSummary[];
}) {
  if (stage === null) return null;
  if (phase === "word-check") return <StageWordCheck />;
  return <StageClues view={stage} players={players} />;
}

function WordCard(props: SectionProps) {
  const { view, players, me, deadline, clock, stage } = props;
  const [revealed, setRevealed] = useState(false);
  const [everRevealed, setEverRevealed] = useState(false);
  const buzz = useBuzz();
  const wrapRef = useRef<HTMLDivElement>(null);

  const reveal = () => {
    setRevealed(true);
    setEverRevealed(true);
    buzz("flip", wrapRef.current);
  };
  const toggle = () => {
    if (revealed) {
      setRevealed(false);
      return;
    }
    reveal();
  };

  return (
    <>
      <Strip
        progress={progressFor(view)}
        right={
          <WordCardTimerSlot view={view} deadline={deadline} clock={clock} />
        }
      />
      <WordCardStage phase={view.phase} stage={stage} players={players} />
      <ClueBanner view={view} players={players} me={me} />
      <div
        ref={wrapRef}
        style={{ flexGrow: 1, display: "flex", marginTop: 8 }}
      >
        <FlipCard
          label="Your secret card"
          flipped={revealed}
          onFlip={reveal}
          back={<WordCardBack />}
          front={<WordPanel view={view} />}
          style={{ flexGrow: 1 }}
        />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ flexGrow: 1 }}>
          <MeRow me={me} />
        </div>
        {everRevealed ? (
          <HideButton hidden={!revealed} onToggle={toggle} />
        ) : null}
      </div>
    </>
  );
}

/** The speaker's own word, held in the centre of the screen and coverable on demand. */
function WordPeek({
  view,
  hidden,
  onToggle,
}: {
  view: ImposterPlayerView;
  hidden: boolean;
  onToggle: () => void;
}) {
  return (
    <div style={{ flexGrow: 1, display: "flex", flexDirection: "column", gap: 8 }}>
      <Card
        variant="M"
        style={{
          flexGrow: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          padding: "20px 18px",
        }}
      >
        {hidden ? null : <WordPanel view={view} />}
        {hidden ? (
          <div
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: "var(--opg-ink-secondary)",
              textAlign: "center",
            }}
          >
            Covered
          </div>
        ) : null}
      </Card>
      <div style={{ display: "flex", justifyContent: "center" }}>
        <HideButton hidden={hidden} onToggle={onToggle} />
      </div>
    </div>
  );
}

/** Runs `effect` exactly once, right after mount, always reading its latest closure. */
function useOnceOnMount(effect: () => void): void {
  const effectRef = useRef(effect);
  useEffect(() => {
    effectRef.current = effect;
  });
  useEffect(() => {
    effectRef.current();
    // Deliberately empty: this is a mount-only effect; the latest effect body
    // is read through the ref above so it never goes stale.
  }, []);
}

function YourTurn(props: SectionProps) {
  const { view, me, clock, send, players, stage } = props;
  const [hidden, setHidden] = useState(false);
  const toggle = () => setHidden((value) => !value);
  const next = nameOf(players, view.nextSpeakerId);
  const passNote = view.nextSpeakerId
    ? `Passes to ${next}`
    : "Last clue for this word";
  const buzz = useBuzz();
  const noteRef = useRef<HTMLDivElement>(null);

  useOnceOnMount(() => {
    // Keyed on the turn's own timestamp, not the phase deadline: the clue phase has no
    // deadline any more, so timerStartedAt stops changing after the first speaker and
    // every later turn would arrive silently.
    if (clock.now() - view.turnStartedAt < 1500) {
      buzz("turn", noteRef.current);
    }
  });

  return (
    <>
      <Strip progress={progressFor(view)} right={<MeTag me={me} />} />
      {stage === null ? null : <StageClues view={stage} players={players} />}
      <div ref={noteRef}>
        <StickyNote
          tilt={-1.5}
          style={{
            margin: "6px 4px 0",
            padding: "14px 22px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
          }}
        >
          <div>
            <Marker size={34}>Your turn!</Marker>
            <div style={{ fontSize: 19, fontWeight: 700, lineHeight: 1.3 }}>
              Say one clue out loud.
            </div>
          </div>
          <YourTurnBadge view={view} />
        </StickyNote>
      </div>
      {/* Your own word stays the middle of the screen while you speak: it is the thing
          you are looking at, and it has to be coverable with a thumb when someone leans in. */}
      <WordPeek view={view} hidden={hidden} onToggle={toggle} />
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <Button size="xl" fullWidth onClick={() => send({ type: "done" })}>
          <Icon name="check" size={24} color="var(--opg-paper)" />
          <span>I&apos;m done</span>
        </Button>
        <div
          style={{
            fontSize: 17,
            color: "var(--opg-ink-secondary)",
            textAlign: "center",
          }}
        >
          {passNote}
        </div>
      </div>
    </>
  );
}

function voteRowStyle(index: number, selected: boolean): CSSProperties {
  return {
    height: 66,
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
  players,
  onPick,
}: {
  id: PlayerId;
  index: number;
  selected: boolean;
  players: PlayerSummary[];
  onPick: () => void;
}) {
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
        alt={`${nameOf(players, id)}'s avatar`}
      />
      <div style={{ flexGrow: 1, fontSize: 21, fontWeight: 700 }}>
        {nameOf(players, id)}
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
  const { view, players, deadline, clock, pulseRef, stage } = props;
  const votedFor = findPlayer(players, view.myVote);
  return (
    <>
      <Strip
        progress={progressFor(view)}
        right={<Timer deadline={deadline} clock={clock} />}
      />
      {stage === null ? null : <StageVote view={stage} players={players} />}
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
          <Marker size={32}>Vote locked in</Marker>
          <div style={{ fontSize: 18, fontWeight: 700 }}>
            {votedFor ? `You voted for ${votedFor.name}.` : "You voted."}
          </div>
          <div style={{ fontSize: 17, color: "var(--opg-ink-secondary)" }}>
            Waiting for the others to vote.
          </div>
          <div style={{ fontSize: 17, color: "var(--opg-ink-secondary)" }}>
            {view.votedCount} voted so far
          </div>
        </Card>
      </div>
    </>
  );
}

function VoteView(props: SectionProps) {
  const { view } = props;
  const lockRef = useRef<HTMLDivElement>(null);
  useVoteLockBuzz(view.myVote, lockRef);
  if (view.myVote !== null) return <VoteLocked {...props} pulseRef={lockRef} />;
  const formKey = `${view.wordNumber}:${view.voteCandidates.join(",")}`;
  return <VoteForm key={formKey} {...props} />;
}

/**
 * The picking form. It unmounts while a vote is locked and is keyed by word and roster,
 * so a kick that clears `myVote`, a vote the server dropped because its target left,
 * or a new word always starts from a clean pick/sent state.
 */
function VoteForm(props: SectionProps) {
  const { view, players, deadline, clock, send, stage } = props;
  const [pick, setPick] = useState<PlayerId | null>(null);
  const [sent, setSent] = useState(false);
  return (
    <>
      <Strip
        progress={progressFor(view)}
        right={<Timer deadline={deadline} clock={clock} />}
      />
      {stage === null ? null : <StageVote view={stage} players={players} />}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <Marker size={32} style={{ lineHeight: 1.15 }}>
          Who&apos;s the imposter?
        </Marker>
        <div style={{ fontSize: 19, lineHeight: 1.35 }}>
          Pick one. You can&apos;t vote for yourself.
        </div>
      </div>
      <div
        style={{
          flexGrow: 1,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {view.voteCandidates.map((id, index) => (
          <VoteRow
            key={id}
            id={id}
            index={index}
            selected={pick === id}
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

function cluesPhase(props: SectionProps): ReactNode {
  return props.view.isMyTurn ? (
    <YourTurn {...props} />
  ) : (
    <WordCard {...props} />
  );
}

function lastChancePhase(props: SectionProps): ReactNode {
  return props.view.isMyLastChance ? (
    <GuessView {...props} />
  ) : (
    <GuessWaiting {...props} />
  );
}

function resultPhase(props: SectionProps): ReactNode {
  return <PhoneResult {...props} progress={progressFor(props.view)} />;
}

type PhaseComponent = (props: SectionProps) => ReactNode;

const PHONE_PHASES = {
  "word-check": WordCard,
  clues: cluesPhase,
  vote: VoteView,
  reveal: PhoneReveal,
  "last-chance": lastChancePhase,
  result: resultPhase,
} satisfies Record<ImposterPhase, PhaseComponent>;

function renderPhase(props: SectionProps): ReactNode {
  const Phase = PHONE_PHASES[props.view.phase];
  return <Phase {...props} />;
}

export interface PhoneProps {
  view: ImposterPlayerView;
  room: PlayerRoomView;
  deadline: number | null;
  timerStartedAt: number | null;
  clock: ServerClock;
  send: (action: ImposterAction) => void;
  /** The host view, in a no-TV room only; null in a room with a shared screen. */
  stage: ImposterHostView | null;
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
    <PhoneScreen>
      <PhaseEnter phaseKey={`${view.wordNumber}:${view.phase}`}>
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
