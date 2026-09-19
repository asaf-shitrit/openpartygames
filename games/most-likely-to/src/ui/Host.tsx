// TV Host screens for Most Likely To. One body per phase, all data from MltHostView.
import { useEffect, useRef } from "react";
import type { CSSProperties, ReactNode } from "react";
import type { HostRoomView, PlayerId, PlayerSummary } from "@opg/protocol";
import type { ServerClock } from "@opg/ui";
import {
  Avatar,
  Card,
  Icon,
  PhaseEnter,
  Timer,
  TvHeader,
  playFx,
  useArrivals,
  useCue,
  useMusic,
  useReducedMotion,
} from "@opg/ui";
import { format, useLocale } from "@opg/i18n";
import type { Dictionary } from "@opg/i18n";
import type { MltHostView, MltPhase } from "../state";
import { avatarOf, nameOf, PromptLine } from "./common";
import { HostReveal } from "./HostReveal";

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
  view: MltHostView;
  players: PlayerSummary[];
  deadline: number | null;
  timerStartedAt: number | null;
  clock: ServerClock;
}

function avatarLabel(t: Dictionary, players: PlayerSummary[], id: PlayerId): string {
  return format(t.mostLikelyTo.avatarAlt, { name: nameOf(players, id, t.common.someone) });
}

// ---------- vote ----------

function VoteHeading({ view, deadline, timerStartedAt, clock }: SectionProps) {
  const { t } = useLocale();
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 48,
      }}
    >
      <PromptLine prompt={view.prompt} size={46} />
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
          {format(t.mostLikelyTo.votedOfTotalTv, {
            voted: view.votedIds.length,
            total: view.playerIds.length,
          })}
        </div>
      </div>
    </div>
  );
}

function VoteStatus({ hasVoted, t }: { hasVoted: boolean; t: Dictionary }) {
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
      <div>{hasVoted ? t.mostLikelyTo.voted : t.mostLikelyTo.thinking}</div>
    </div>
  );
}

function VoteTile({
  id,
  index,
  hasVoted,
  justArrived,
  players,
  t,
}: {
  id: PlayerId;
  index: number;
  hasVoted: boolean;
  justArrived: boolean;
  players: PlayerSummary[];
  t: Dictionary;
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
          alt={avatarLabel(t, players, id)}
        />
        <div style={{ fontSize: 38, fontWeight: 700, lineHeight: 1.1 }}>
          {nameOf(players, id, t.common.someone)}
        </div>
        <VoteStatus hasVoted={hasVoted} t={t} />
      </Card>
    </div>
  );
}

function Vote(props: SectionProps) {
  const { view, players } = props;
  const { t } = useLocale();
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
            t={t}
          />
        ))}
      </div>
      <div style={{ textAlign: "center", fontSize: 32, ...SECONDARY }}>
        {t.mostLikelyTo.voteForAnyone}
      </div>
    </div>
  );
}

// ---------- reveal ----------

function Reveal(props: SectionProps) {
  return (
    <HostReveal
      view={props.view}
      players={props.players}
      deadline={props.deadline}
      timerStartedAt={props.timerStartedAt}
      clock={props.clock}
    />
  );
}

type PhaseComponent = (props: SectionProps) => ReactNode;

const PHASES = {
  vote: Vote,
  reveal: Reveal,
} satisfies Record<MltPhase, PhaseComponent>;

function PhaseBody(props: SectionProps): ReactNode {
  const Phase = PHASES[props.view.phase];
  return <Phase {...props} />;
}

export interface HostProps {
  view: MltHostView;
  room: HostRoomView;
  deadline: number | null;
  timerStartedAt: number | null;
  clock: ServerClock;
}

export function Host({ view, room, deadline, timerStartedAt, clock }: HostProps) {
  const { t } = useLocale();
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
        gameName={t.mostLikelyTo.title}
        progress={format(t.mostLikelyTo.promptOf, {
          round: view.roundNumber,
          count: view.roundCount,
        })}
        roomCode={room.code}
      />
      <PhaseEnter phaseKey={`${view.roundNumber}:${view.phase}`}>
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
