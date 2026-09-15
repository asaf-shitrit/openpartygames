// Phone screens for Imposter. Renders only the player's own view — never anyone's secret.
import { useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import type { PlayerId, PlayerRoomView, PlayerSummary } from "@opg/protocol";
import type { ServerClock } from "@opg/ui";
import {
  Avatar,
  Button,
  Card,
  Highlight,
  Icon,
  LinedCard,
  Marker,
  PhoneScreen,
  PhoneStrip,
  Stamp,
  StickyNote,
  TextInput,
  Timer,
} from "@opg/ui";
import {
  MAX_GUESS_LENGTH,
  POINTS_PER_WORD,
  type ImposterAction,
  type ImposterPhase,
  type ImposterPlayerView,
} from "../state";

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

function money(value: number): string {
  return value.toLocaleString("en-US");
}

function displayName(me: PlayerSummary | null): string {
  return me?.name ?? "?";
}

function meName(me: PlayerSummary | null): string {
  return me?.name ?? "You";
}

function avatarAlt(me: PlayerSummary | null): string | undefined {
  return me === null ? undefined : `${me.name}'s avatar`;
}

function progressFor(view: ImposterPlayerView): string {
  const byPhase = {
    "word-check": `Word ${view.wordNumber} of ${view.wordCount}`,
    clues: `Word ${view.wordNumber} of ${view.wordCount}`,
    vote: "Vote",
    reveal: "The votes are in",
    "last-chance": "Last chance",
    result: "Final scores",
  } satisfies Record<ImposterPhase, string>;
  return byPhase[view.phase];
}

interface SectionProps {
  view: ImposterPlayerView;
  players: PlayerSummary[];
  me: PlayerSummary | null;
  deadline: number | null;
  clock: ServerClock;
  send: (action: ImposterAction) => void;
}

function Strip({ progress, right }: { progress: string; right?: ReactNode }) {
  return <PhoneStrip gameName="Imposter" progress={progress} right={right} />;
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
      className="opg-reset"
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

/** Avatar + name footer shared by the word and guess screens. */
function MeRow({ me }: { me: PlayerSummary | null }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <Avatar id={me?.avatar ?? null} size={50} alt={avatarAlt(me)} />
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

function WordPanel({
  view,
  hidden,
}: {
  view: ImposterPlayerView;
  hidden: boolean;
}) {
  const isImposter = view.role === "imposter";
  const { title, label, desc } = wordPanelCopy(isImposter);
  return (
    <LinedCard
      tilt={1}
      style={{
        flexGrow: 1,
        marginTop: 8,
        padding: "24px 20px 24px 56px",
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
        <Marker size={isImposter ? 72 : 56}>
          {hidden ? "Tap to show" : (view.word ?? "—")}
        </Marker>
      </Highlight>
      <div style={{ marginBottom: "auto", fontSize: 19, lineHeight: 1.4 }}>
        {desc}
      </div>
    </LinedCard>
  );
}

function WordCard(props: SectionProps) {
  const { view, players, me, deadline, clock } = props;
  const [hidden, setHidden] = useState(false);
  const toggle = () => setHidden((value) => !value);
  return (
    <>
      <Strip
        progress={progressFor(view)}
        right={<Timer deadline={deadline} clock={clock} />}
      />
      <ClueBanner view={view} players={players} me={me} />
      <WordPanel view={view} hidden={hidden} />
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ flexGrow: 1 }}>
          <MeRow me={me} />
        </div>
        <HideButton hidden={hidden} onToggle={toggle} />
      </div>
    </>
  );
}

function WordRow({
  view,
  hidden,
  onToggle,
}: {
  view: ImposterPlayerView;
  hidden: boolean;
  onToggle: () => void;
}) {
  return (
    <Card
      variant="M"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        minHeight: 64,
        padding: "8px 8px 8px 18px",
      }}
    >
      <div
        style={{
          flexGrow: 1,
          display: "flex",
          alignItems: "baseline",
          gap: 8,
          fontSize: 19,
        }}
      >
        <div style={{ fontWeight: 400 }}>Your word:</div>
        <div style={{ fontWeight: 700, letterSpacing: "0.04em" }}>
          {hidden ? "••••" : (view.word ?? "—")}
        </div>
      </div>
      <HideButton hidden={hidden} onToggle={onToggle} compact />
    </Card>
  );
}

function YourTurn(props: SectionProps) {
  const { view, me, deadline, clock, send, players } = props;
  const [hidden, setHidden] = useState(false);
  const toggle = () => setHidden((value) => !value);
  const next = nameOf(players, view.nextSpeakerId);
  const passNote = view.nextSpeakerId
    ? `Passes to ${next}`
    : "Last clue for this word";
  return (
    <>
      <Strip progress={progressFor(view)} right={<MeTag me={me} />} />
      <StickyNote
        tilt={-1.5}
        style={{
          flexGrow: 1,
          margin: "6px 4px 0",
          padding: "28px 22px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
        }}
      >
        <Marker size={48} style={{ textAlign: "center" }}>
          Your turn!
        </Marker>
        <div
          style={{
            fontSize: 22,
            fontWeight: 700,
            lineHeight: 1.3,
            textAlign: "center",
          }}
        >
          Say one clue out loud.
        </div>
        <Timer
          deadline={deadline}
          clock={clock}
          size={150}
          style={{ marginTop: 8 }}
        />
      </StickyNote>
      <WordRow view={view} hidden={hidden} onToggle={toggle} />
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
      className="opg-reset"
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

function VoteView(props: SectionProps) {
  const { view, players, deadline, clock, send } = props;
  const [pick, setPick] = useState<PlayerId | null>(view.myVote);
  return (
    <>
      <Strip
        progress={progressFor(view)}
        right={<Timer deadline={deadline} clock={clock} />}
      />
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
        disabled={pick === null}
        disabledReason="Pick someone first"
        onClick={() => {
          if (pick) send({ type: "vote", target: pick });
        }}
      >
        <Icon name="lock" size={22} color="var(--opg-paper)" />
        <span>Lock in vote</span>
      </Button>
    </>
  );
}

interface RevealCopy {
  headline: string;
  sub: string;
}

function revealCopy(
  view: ImposterPlayerView,
  players: PlayerSummary[],
  me: PlayerSummary | null,
): RevealCopy {
  const imposter = nameOf(players, view.imposterId);
  const caught = view.caught === true;
  const iAmImposter = view.imposterId !== null && view.imposterId === me?.id;
  if (iAmImposter && caught) {
    return {
      headline: "You got caught!",
      sub: "Get ready to guess the crew's word.",
    };
  }
  if (iAmImposter) {
    return { headline: "You slipped away!", sub: "Nobody caught you. Nice." };
  }
  if (caught) {
    return {
      headline: `The imposter was ${imposter}`,
      sub: `Get ready for ${imposter}'s last chance.`,
    };
  }
  return {
    headline: `The imposter was ${imposter}`,
    sub: "The imposter keeps the points.",
  };
}

function RevealView(props: SectionProps) {
  const { view, players, me, deadline, clock } = props;
  const imposter = nameOf(players, view.imposterId);
  const { headline, sub } = revealCopy(view, players, me);
  return (
    <>
      <Strip
        progress={progressFor(view)}
        right={<Timer deadline={deadline} clock={clock} />}
      />
      <Card
        variant="L"
        tilt={-1}
        style={{
          flexGrow: 1,
          padding: "28px 22px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          textAlign: "center",
        }}
      >
        <Marker size={34}>The votes are in</Marker>
        <Avatar
          id={avatarOf(players, view.imposterId)}
          size={120}
          alt={`${imposter}'s avatar`}
        />
        <Marker size={30}>{headline}</Marker>
        <div style={{ fontSize: 19, fontWeight: 700 }}>{sub}</div>
      </Card>
    </>
  );
}

function GuessForm({
  view,
  send,
}: {
  view: ImposterPlayerView;
  send: (action: ImposterAction) => void;
}) {
  const [text, setText] = useState(view.myGuess ?? "");
  const [sent, setSent] = useState(view.myGuess !== null);
  const canSubmit = !sent && text.trim().length > 0;
  let label = "Submit guess";
  if (sent) label = "Guess sent";
  return (
    <>
      <TextInput
        label="Your guess"
        value={text}
        onChange={setText}
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

function GuessView(props: SectionProps) {
  const { view, me, deadline, clock, send } = props;
  return (
    <>
      <Strip
        progress={progressFor(view)}
        right={<Timer deadline={deadline} clock={clock} />}
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
      <GuessForm view={view} send={send} />
      <MeRow me={me} />
    </>
  );
}

function GuessWaiting(props: SectionProps) {
  const { view, players, deadline, clock } = props;
  const imposter = nameOf(players, view.imposterId);
  return (
    <>
      <Strip
        progress={progressFor(view)}
        right={<Timer deadline={deadline} clock={clock} />}
      />
      <Card
        variant="L"
        tilt={-1}
        style={{
          flexGrow: 1,
          padding: "28px 22px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          textAlign: "center",
        }}
      >
        <Avatar
          id={avatarOf(players, view.imposterId)}
          size={120}
          alt={`${imposter}'s avatar`}
        />
        <Marker size={32}>{imposter} is guessing…</Marker>
        <div style={{ fontSize: 19 }}>Watch the TV.</div>
      </Card>
    </>
  );
}

function guesserLabel(
  view: ImposterPlayerView,
  players: PlayerSummary[],
  me: PlayerSummary | null,
): string {
  if (view.imposterId !== null && view.imposterId === me?.id) {
    return "You guessed";
  }
  return `${nameOf(players, view.imposterId)} guessed`;
}

function earnedLabel(points: number): string {
  return points > 0
    ? `You earned +${money(points)} points`
    : "No points this word";
}

function GuessStamp({ correct }: { correct: boolean | null }) {
  return (
    <Stamp size={26} tilt={-6}>
      {correct ? "Got it" : "Nope"}
    </Stamp>
  );
}

function ResultView(props: SectionProps) {
  const { view, players, me, deadline, clock } = props;
  const guesser = guesserLabel(view, players, me);
  const earned = earnedLabel(view.myPoints ?? 0);
  return (
    <>
      <Strip
        progress={progressFor(view)}
        right={<Timer deadline={deadline} clock={clock} />}
      />
      <Card
        variant="L"
        tilt={-1}
        style={{
          flexGrow: 1,
          padding: "28px 22px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 16,
        }}
      >
        <div style={{ fontSize: 19, fontWeight: 700 }}>The word was</div>
        <Highlight style={{ alignSelf: "flex-start", padding: "0 10px" }}>
          <Marker size={56}>{view.crewWord ?? "—"}</Marker>
        </Highlight>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 19 }}>{guesser}</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>
            {view.guess ?? "nothing"}
          </div>
          <GuessStamp correct={view.guessCorrect} />
        </div>
        <div style={{ fontSize: 21, fontWeight: 700 }}>{earned}</div>
      </Card>
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

type PhaseComponent = (props: SectionProps) => ReactNode;

const PHONE_PHASES = {
  "word-check": WordCard,
  clues: cluesPhase,
  vote: VoteView,
  reveal: RevealView,
  "last-chance": lastChancePhase,
  result: ResultView,
} satisfies Record<ImposterPhase, PhaseComponent>;

function renderPhase(props: SectionProps): ReactNode {
  const Phase = PHONE_PHASES[props.view.phase];
  return <Phase {...props} />;
}

export interface PhoneProps {
  view: ImposterPlayerView;
  room: PlayerRoomView;
  deadline: number | null;
  clock: ServerClock;
  send: (action: ImposterAction) => void;
}

export function Phone({ view, room, deadline, clock, send }: PhoneProps) {
  return (
    <PhoneScreen>
      {renderPhase({
        view,
        players: room.players,
        me: findPlayer(room.players, room.you),
        deadline,
        clock,
        send,
      })}
    </PhoneScreen>
  );
}
