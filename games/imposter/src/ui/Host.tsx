// TV Host screens for Imposter. One body per phase, all data from ImposterHostView.
import { useEffect, useRef } from "react";
import type { CSSProperties, ReactNode, RefObject } from "react";
import type { HostRoomView, PlayerId, PlayerSummary } from "@opg/protocol";
import type { ServerClock } from "@opg/ui";
import {
  Avatar,
  Card,
  Icon,
  Marker,
  PhaseEnter,
  StickyNote,
  Tape,
  Timer,
  TvHeader,
  playFx,
  useArrivals,
  useCue,
  useMusic,
  useReducedMotion,
} from "@opg/ui";
import type { ImposterHostView, ImposterPhase } from "../state";
import { HostLastChance } from "./HostLastChance";
import { HostResult } from "./HostResult";
import { HostReveal } from "./HostReveal";

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

function avatarLabel(players: PlayerSummary[], id: PlayerId | null): string {
  return `${nameOf(players, id)}'s avatar`;
}

const TILTS = [-1.5, 1, -1, 1.5, -1, 2];
const BODY: CSSProperties = {
  flexGrow: 1,
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
};
const SECONDARY: CSSProperties = {
  fontWeight: 700,
  color: "var(--opg-ink-secondary)",
};

interface SectionProps {
  view: ImposterHostView;
  players: PlayerSummary[];
  deadline: number | null;
  timerStartedAt: number | null;
  clock: ServerClock;
}

// ---------- word-check ----------

function WordCheckHeading({ deadline, timerStartedAt, clock }: SectionProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 48,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <Marker size={112}>Check your phones!</Marker>
        <div
          style={{
            maxWidth: 1300,
            fontSize: 42,
            fontWeight: 700,
            lineHeight: 1.25,
          }}
        >
          Everyone got a secret word. One of you got a decoy, and knows it.
        </div>
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 12,
        }}
      >
        <div style={{ fontSize: 30, ...SECONDARY }}>Clues start in</div>
        <Timer
          deadline={deadline}
          clock={clock}
          size={170}
          startedAt={timerStartedAt}
          ticks
        />
      </div>
    </div>
  );
}

function ClueOrderCard({ view, players }: SectionProps) {
  const order = view.clueOrder.length > 0 ? view.clueOrder : view.playerIds;
  return (
    <Card
      variant="L"
      tilt={-0.5}
      style={{
        padding: "36px 44px 40px",
        display: "flex",
        flexDirection: "column",
        gap: 24,
      }}
    >
      <Tape left={820} top={-24} width={200} height={46} rotate={-3} />
      <Marker size={56}>Clue order</Marker>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${Math.max(order.length, 1)}, minmax(0, 1fr))`,
          gap: 24,
        }}
      >
        {order.map((id, index) => (
          <div
            key={id}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 8,
            }}
          >
            <div
              style={{
                width: 60,
                height: 60,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: "4px solid var(--opg-ink)",
                borderRadius: "50% 45% 52% 48% / 48% 52% 45% 50%",
                fontSize: 32,
                fontWeight: 700,
              }}
            >
              {index + 1}
            </div>
            <Avatar
              id={avatarOf(players, id)}
              size={150}
              alt={avatarLabel(players, id)}
            />
            <div style={{ fontSize: 38, fontWeight: 700, lineHeight: 1.1 }}>
              {nameOf(players, id)}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function WordCheck(props: SectionProps) {
  return (
    <div style={{ ...BODY, gap: 64 }}>
      <WordCheckHeading {...props} />
      <ClueOrderCard {...props} />
    </div>
  );
}

// ---------- clues ----------

/** Plays whoosh and slides the speaker card in when the current speaker changes live. */
function useSpeakerChangeCue(
  speakerId: PlayerId | null,
  cardRef: RefObject<HTMLElement | null>,
): void {
  const play = useCue();
  const reduced = useReducedMotion();
  const mountedRef = useRef(false);
  const previousRef = useRef<PlayerId | null>(null);
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      previousRef.current = speakerId;
      return;
    }
    if (previousRef.current === speakerId) return;
    previousRef.current = speakerId;
    play("whoosh");
    playFx(cardRef.current, "slideIn", reduced);
  }, [speakerId, play, reduced, cardRef]);
}

function SpeakerCard({
  view,
  players,
  deadline,
  timerStartedAt,
  clock,
}: SectionProps) {
  const speaker = nameOf(players, view.currentSpeakerId);
  const cardRef = useRef<HTMLDivElement>(null);
  useSpeakerChangeCue(view.currentSpeakerId, cardRef);
  return (
    <div ref={cardRef}>
      <Card
        variant="L"
        tilt={-1}
        style={{
          marginTop: 14,
          padding: "48px 56px 52px",
          display: "flex",
          flexDirection: "column",
          gap: 22,
        }}
      >
        <Tape left={400} top={-24} width={200} height={46} rotate={-3} />
        <div style={{ display: "flex", alignItems: "center", gap: 72 }}>
          <Avatar
            id={avatarOf(players, view.currentSpeakerId)}
            size={260}
            alt={avatarLabel(players, view.currentSpeakerId)}
          />
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 12,
            }}
          >
            <Timer
              deadline={deadline}
              clock={clock}
              size={170}
              startedAt={timerStartedAt}
              ticks
            />
            <div style={{ fontSize: 30, ...SECONDARY }}>Time left</div>
          </div>
        </div>
        <Marker size={104}>{speaker}&apos;s turn</Marker>
        <div style={{ fontSize: 46, fontWeight: 700, lineHeight: 1.2 }}>
          Say one clue out loud
        </div>
      </Card>
    </div>
  );
}

function ClueMark({
  done,
  speaking,
  index,
}: {
  done: boolean;
  speaking: boolean;
  index: number;
}) {
  if (done) return <Icon name="check" size={40} color="var(--opg-marker)" />;
  if (speaking)
    return <Icon name="arrow-right" size={42} color="var(--opg-marker)" />;
  return (
    <div
      style={{
        width: 48,
        height: 48,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        border: "3px solid var(--opg-ink)",
        borderRadius: "50% 45% 52% 48% / 48% 52% 45% 50%",
        fontSize: 28,
        fontWeight: 700,
      }}
    >
      {index + 1}
    </div>
  );
}

function ClueStatus({
  done,
  speaking,
  upNext,
}: {
  done: boolean;
  speaking: boolean;
  upNext: boolean;
}) {
  if (done) return <div style={{ fontSize: 30, ...SECONDARY }}>Done</div>;
  if (speaking)
    return (
      <Marker size={34} color="var(--opg-marker)" style={{ lineHeight: 1 }}>
        Speaking
      </Marker>
    );
  if (upNext) return <div style={{ fontSize: 30, ...SECONDARY }}>Up next</div>;
  return null;
}

function ClueRow({
  id,
  index,
  list,
  players,
  speakerId,
  nextId,
}: {
  id: PlayerId;
  index: number;
  list: ImposterHostView;
  players: PlayerSummary[];
  speakerId: PlayerId | null;
  nextId: PlayerId | null;
}) {
  const done = list.doneSpeakerIds.includes(id);
  const speaking = id === speakerId;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 18,
        height: speaking ? 96 : 88,
        padding: "0 18px",
        background: speaking ? "var(--opg-highlight-soft)" : undefined,
        border: speaking ? "4px solid var(--opg-ink)" : undefined,
        borderRadius: speaking ? "var(--opg-radius-button)" : undefined,
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ClueMark done={done} speaking={speaking} index={index} />
      </div>
      <Avatar
        id={avatarOf(players, id)}
        size={68}
        alt={avatarLabel(players, id)}
      />
      <div style={{ flexGrow: 1, fontSize: 38, fontWeight: 700 }}>
        {nameOf(players, id)}
      </div>
      <ClueStatus done={done} speaking={speaking} upNext={id === nextId} />
    </div>
  );
}

function ClueOrderList({ view, players }: SectionProps) {
  const speakerId = view.currentSpeakerId;
  const index = speakerId ? view.clueOrder.indexOf(speakerId) : -1;
  const nextId = index >= 0 ? (view.clueOrder[index + 1] ?? null) : null;
  return (
    <Card
      variant="Malt"
      style={{
        padding: "36px 40px 40px",
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      <Marker size={56} style={{ marginBottom: 4 }}>
        Clue order
      </Marker>
      {view.clueOrder.map((id, rowIndex) => (
        <ClueRow
          key={id}
          id={id}
          index={rowIndex}
          list={view}
          players={players}
          speakerId={speakerId}
          nextId={nextId}
        />
      ))}
    </Card>
  );
}

function Clues(props: SectionProps) {
  return (
    <div
      style={{
        flexGrow: 1,
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) 680px",
        gap: 64,
        alignItems: "center",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 40 }}>
        <SpeakerCard {...props} />
        <StickyNote
          tilt={-1.5}
          style={{
            alignSelf: "flex-start",
            padding: "22px 32px",
            fontSize: 38,
            fontWeight: 700,
            lineHeight: 1.25,
          }}
        >
          Listen closely. The imposter is bluffing.
        </StickyNote>
      </div>
      <ClueOrderList {...props} />
    </div>
  );
}

// ---------- vote ----------

function VoteHeading({ view, deadline, timerStartedAt, clock }: SectionProps) {
  const total = view.playerIds.length;
  const voted = view.playerIds.filter((id) =>
    view.votedIds.includes(id),
  ).length;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 48,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Marker size={108}>Vote on your phones!</Marker>
        <div style={{ fontSize: 46, fontWeight: 700, lineHeight: 1.2 }}>
          Who has the decoy word?
        </div>
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 12,
        }}
      >
        <Timer
          deadline={deadline}
          clock={clock}
          size={170}
          startedAt={timerStartedAt}
          ticks
        />
        <div style={{ fontSize: 36, fontWeight: 700 }}>
          {voted} of {total} voted
        </div>
      </div>
    </div>
  );
}

function VoteStatus({ hasVoted }: { hasVoted: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        height: 44,
        fontSize: 30,
        fontWeight: 700,
        color: hasVoted ? undefined : "var(--opg-ink-secondary)",
      }}
    >
      <Icon
        name={hasVoted ? "check" : "pencil"}
        size={hasVoted ? 36 : 34}
        color={hasVoted ? "var(--opg-marker)" : "var(--opg-muted)"}
      />
      <div>{hasVoted ? "Voted" : "Thinking…"}</div>
    </div>
  );
}

function VoteTile({
  id,
  index,
  hasVoted,
  justArrived,
  players,
}: {
  id: PlayerId;
  index: number;
  hasVoted: boolean;
  justArrived: boolean;
  players: PlayerSummary[];
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const play = useCue();
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!justArrived) return;
    play("pop");
    playFx(cardRef.current, "pop", reduced);
  }, [justArrived, play, reduced]);
  return (
    <div ref={cardRef}>
      <Card
        variant={index % 2 === 0 ? "M" : "Malt"}
        tilt={TILTS[index % TILTS.length]}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 12,
          padding: "26px 12px 24px",
          border: hasVoted
            ? "4px solid var(--opg-ink)"
            : "4px dashed var(--opg-muted)",
        }}
      >
        <Avatar
          id={avatarOf(players, id)}
          size={150}
          alt={avatarLabel(players, id)}
        />
        <div style={{ fontSize: 38, fontWeight: 700, lineHeight: 1.1 }}>
          {nameOf(players, id)}
        </div>
        <VoteStatus hasVoted={hasVoted} />
      </Card>
    </div>
  );
}

function Vote(props: SectionProps) {
  const { view, players } = props;
  const arrivals = useArrivals(view.votedIds);
  useMusic("tension");
  return (
    <div style={{ ...BODY, gap: 64 }}>
      <VoteHeading {...props} />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${Math.max(view.playerIds.length, 1)}, minmax(0, 1fr))`,
          gap: 28,
        }}
      >
        {view.playerIds.map((id, index) => (
          <VoteTile
            key={id}
            id={id}
            index={index}
            hasVoted={view.votedIds.includes(id)}
            justArrived={arrivals.includes(id)}
            players={players}
          />
        ))}
      </div>
      <div
        style={{
          textAlign: "center",
          fontSize: 32,
          ...SECONDARY,
        }}
      >
        You can vote for anyone but yourself
      </div>
    </div>
  );
}

type PhaseComponent = (props: SectionProps) => ReactNode;

const PHASES = {
  "word-check": WordCheck,
  clues: Clues,
  vote: Vote,
  reveal: HostReveal,
  "last-chance": HostLastChance,
  result: HostResult,
} satisfies Record<ImposterPhase, PhaseComponent>;

function PhaseBody(props: SectionProps): ReactNode {
  const Phase = PHASES[props.view.phase];
  return <Phase {...props} />;
}

export interface HostProps {
  view: ImposterHostView;
  room: HostRoomView;
  deadline: number | null;
  timerStartedAt: number | null;
  clock: ServerClock;
}

export function Host({
  view,
  room,
  deadline,
  timerStartedAt,
  clock,
}: HostProps) {
  return (
    <div
      style={{
        height: "100%",
        padding: "44px 72px 40px",
        display: "flex",
        flexDirection: "column",
        gap: 28,
        overflow: "hidden",
      }}
    >
      <TvHeader
        variant="game"
        gameName="Imposter"
        progress={`Word ${view.wordNumber} of ${view.wordCount}`}
        roomCode={room.code}
      />
      <PhaseEnter phaseKey={`${view.wordNumber}:${view.phase}`}>
        <PhaseBody
          view={view}
          players={room.players}
          deadline={deadline}
          timerStartedAt={timerStartedAt}
          clock={clock}
        />
      </PhaseEnter>
    </div>
  );
}
