// Real or Nah — TV host stage. One phase component per screen.
import { useEffect, useRef } from "react";
import type { CSSProperties, RefObject } from "react";
import type { HostRoomView, PlayerId } from "@opg/protocol";
import type { ServerClock } from "@opg/ui";
import {
  Avatar,
  Card,
  Icon,
  LinedCard,
  Marker,
  PhaseEnter,
  playFx,
  Tape,
  Timer,
  TvHeader,
  useArrivals,
  useCue,
  useMusic,
  useReducedMotion,
} from "@opg/ui";
import { format, useLocale } from "@opg/i18n";
import type { Dictionary } from "@opg/i18n";
import type { RonHostView } from "../types";
import { PromptText, playerAvatar, playerFor, playerName } from "./common";
import { HostReveal } from "./HostReveal";

export interface HostProps {
  view: RonHostView;
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
        gameName={t.realOrNah.title}
        progress={format(t.realOrNah.factOf, { number: view.factNumber, count: view.factCount })}
        roomCode={room.code}
      />
      <PhaseEnter phaseKey={`${view.factNumber}:${view.phase}`}>
        <HostBody
          view={view}
          room={room}
          deadline={deadline}
          timerStartedAt={timerStartedAt}
          clock={clock}
        />
      </PhaseEnter>
    </div>
  );
}

function HostBody({ view, room, deadline, timerStartedAt, clock }: HostProps) {
  if (view.phase === "write") {
    return (
      <WritePhase
        view={view}
        room={room}
        deadline={deadline}
        timerStartedAt={timerStartedAt}
        clock={clock}
      />
    );
  }
  if (view.phase === "vote") {
    return (
      <VotePhase
        view={view}
        deadline={deadline}
        timerStartedAt={timerStartedAt}
        clock={clock}
      />
    );
  }
  return (
    <HostReveal
      view={view}
      players={room.players}
      deadline={deadline}
      timerStartedAt={timerStartedAt}
      clock={clock}
    />
  );
}

interface PhaseProps {
  view: RonHostView;
  room: HostRoomView;
  deadline: number | null;
  timerStartedAt: number | null;
  clock: ServerClock;
}

function WritePhase({ view, room, deadline, timerStartedAt, clock }: PhaseProps) {
  const { t } = useLocale();
  return (
    <>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) 280px",
          gap: 56,
          flexGrow: 1,
          alignItems: "start",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 30 }}>
          <Marker size={64}>{t.realOrNah.writeHeading}</Marker>
          <LinedCard
            tilt={-1}
            style={{ marginTop: 12, padding: "62px 64px 62px 92px" }}
          >
            <PromptText
              prompt={view.prompt}
              blank={{ width: 300, height: 28, thickness: 7 }}
              style={{ fontSize: 64, fontWeight: 700, lineHeight: 1.35 }}
            />
          </LinedCard>
        </div>
        <TimerSide
          deadline={deadline}
          timerStartedAt={timerStartedAt}
          clock={clock}
          size={190}
          note={t.realOrNah.leftToWrite}
        />
      </div>
      <WriteProgress view={view} room={room} />
    </>
  );
}

function TimerSide({
  deadline,
  timerStartedAt,
  clock,
  size,
  note,
}: {
  deadline: number | null;
  timerStartedAt: number | null;
  clock: ServerClock;
  size: number;
  note: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 12,
        paddingTop: 6,
      }}
    >
      <Timer
        deadline={deadline}
        clock={clock}
        size={size}
        startedAt={timerStartedAt}
        ticks
      />
      <div
        style={{
          fontSize: 30,
          fontWeight: 700,
          color: "var(--opg-ink-secondary)",
        }}
      >
        {note}
      </div>
    </div>
  );
}

function useTilePops(
  arrivedIds: readonly PlayerId[],
  tileRefs: RefObject<Map<PlayerId, HTMLElement>>,
): void {
  const play = useCue();
  const reduced = useReducedMotion();
  useEffect(() => {
    if (arrivedIds.length > 0) {
      play("pop");
      for (const id of arrivedIds) {
        playFx(tileRefs.current.get(id) ?? null, "pop", reduced);
      }
    }
  }, [arrivedIds, play, reduced, tileRefs]);
}

function WriteProgress({
  view,
  room,
}: {
  view: RonHostView;
  room: HostRoomView;
}) {
  const { t } = useLocale();
  const count = Math.max(1, view.playerIds.length);
  const tileRefs = useRef(new Map<PlayerId, HTMLElement>());
  const arrivals = useArrivals(view.submittedIds);
  useTilePops(arrivals, tileRefs);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 18 }}>
        <Marker size={44}>{t.realOrNah.liesIn}</Marker>
        <div style={{ fontSize: 36, fontWeight: 700 }}>
          {format(t.realOrNah.countOfTotal, {
            count: view.submittedIds.length,
            total: view.playerIds.length,
          })}
        </div>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))`,
          gap: 20,
        }}
      >
        {view.playerIds.map((id) => (
          <LieTile
            key={id}
            room={room}
            id={id}
            done={view.submittedIds.includes(id)}
            registerRef={(el) => {
              if (el) tileRefs.current.set(id, el);
              else tileRefs.current.delete(id);
            }}
          />
        ))}
      </div>
    </div>
  );
}

function lieTileStyle(done: boolean): CSSProperties {
  return {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 6,
    padding: "16px 10px 14px",
    background: done ? "var(--opg-card)" : "rgba(255, 255, 255, 0.6)",
    border: done ? "4px solid var(--opg-ink)" : "4px dashed var(--opg-muted)",
    borderRadius: "var(--opg-radius-m)",
  };
}

/** Done/Writing… with a matching icon, so outcome is never color alone. */
function LieStatus({ done, t }: { done: boolean; t: Dictionary }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        fontSize: 28,
        fontWeight: 700,
        color: done ? "var(--opg-marker)" : "var(--opg-ink-secondary)",
      }}
    >
      <Icon name={done ? "check" : "pencil"} size={28} />
      <div>{done ? t.realOrNah.done : t.realOrNah.writing}</div>
    </div>
  );
}

function LieTile({
  room,
  id,
  done,
  registerRef,
}: {
  room: HostRoomView;
  id: PlayerId;
  done: boolean;
  registerRef: (el: HTMLElement | null) => void;
}) {
  const { t } = useLocale();
  const player = playerFor(room, id);
  const name = playerName(player, t.common.someone);
  return (
    <div ref={registerRef} style={lieTileStyle(done)}>
      <Avatar
        id={playerAvatar(player)}
        size={72}
        alt={format(t.realOrNah.avatarAlt, { name })}
      />
      <div
        style={{
          fontSize: 34,
          fontWeight: 700,
          lineHeight: 1.1,
          textAlign: "center",
        }}
      >
        {name}
      </div>
      <LieStatus done={done} t={t} />
    </div>
  );
}

function VotePhase({ view, deadline, timerStartedAt, clock }: Omit<PhaseProps, "room">) {
  const { t } = useLocale();
  const options = view.options ?? [];
  useMusic("tension");
  return (
    <>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) 260px",
          gap: 48,
          alignItems: "center",
        }}
      >
        <Card
          tilt={-0.8}
          style={{ position: "relative", marginTop: 10, padding: "34px 48px" }}
        >
          <Tape left={640} top={-22} width={180} height={44} rotate={-3} />
          <PromptText
            prompt={view.prompt}
            blank={{
              width: 220,
              height: 24,
              thickness: 8,
              verticalAlign: "-4px",
            }}
            style={{ fontSize: 48, fontWeight: 700, lineHeight: 1.3 }}
          />
        </Card>
        <VotedSide view={view} deadline={deadline} timerStartedAt={timerStartedAt} clock={clock} />
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 28 }}>
        <Marker size={68}>{t.realOrNah.whichIsReal}</Marker>
        <div
          style={{
            fontSize: 38,
            fontWeight: 700,
            color: "var(--opg-ink-secondary)",
          }}
        >
          {t.realOrNah.voteOnPhone}
        </div>
      </div>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: 28,
        }}
      >
        {options.map((option, index) => (
          <VoteOption key={option.id} text={option.text} index={index} />
        ))}
      </div>
    </>
  );
}

function VotedSide({
  view,
  deadline,
  timerStartedAt,
  clock,
}: Pick<PhaseProps, "view" | "deadline" | "timerStartedAt" | "clock">) {
  const { t } = useLocale();
  const play = useCue();
  const reduced = useReducedMotion();
  const countRef = useRef<HTMLDivElement>(null);
  const arrivals = useArrivals(view.votedIds);
  useEffect(() => {
    if (arrivals.length > 0) {
      play("pop");
      playFx(countRef.current, "pop", reduced);
    }
  }, [arrivals, play, reduced]);
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 10,
      }}
    >
      <Timer
        deadline={deadline}
        clock={clock}
        size={170}
        startedAt={timerStartedAt}
        ticks
      />
      <div
        ref={countRef}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 32,
          fontWeight: 700,
        }}
      >
        <Icon name="check" size={30} color="var(--opg-marker)" />
        <div>
          {format(t.realOrNah.votedOfTotalTv, {
            voted: view.votedIds.length,
            total: view.playerIds.length,
          })}
        </div>
      </div>
    </div>
  );
}

const TILTS = [-1.5, 1, -0.5, 1.5];

function VoteOption({ text, index }: { text: string; index: number }) {
  return (
    <div
      style={{
        width: 420,
        minHeight: 176,
        padding: "26px 24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        background: "var(--opg-card)",
        border: "4px solid var(--opg-ink)",
        borderRadius:
          index % 2 === 1 ? "var(--opg-radius-m-alt)" : "var(--opg-radius-m)",
        transform: `rotate(${TILTS[index % TILTS.length]}deg)`,
        fontSize: 44,
        fontWeight: 700,
        lineHeight: 1.2,
      }}
    >
      {text}
    </div>
  );
}
