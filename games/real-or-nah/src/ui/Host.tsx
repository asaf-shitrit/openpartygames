// Real or Nah — TV host stage. One phase component per screen.
import type { CSSProperties } from "react";
import type { HostRoomView, PlayerId } from "@opg/protocol";
import type { ServerClock } from "@opg/ui";
import {
  Avatar,
  Card,
  Highlight,
  Icon,
  LinedCard,
  Marker,
  PhaseEnter,
  Stamp,
  Tape,
  Timer,
  TvHeader,
} from "@opg/ui";
import { POINTS_TRUTH, type RonFooledLie, type RonHostView } from "../types";
import {
  Person,
  PersonTag,
  PromptText,
  playerAvatar,
  playerFor,
  playerName,
} from "./common";

export interface HostProps {
  view: RonHostView;
  room: HostRoomView;
  deadline: number | null;
  clock: ServerClock;
}

export function Host({ view, room, deadline, clock }: HostProps) {
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
        gameName="Real or Nah"
        progress={`Fact ${view.factNumber} of ${view.factCount}`}
        roomCode={room.code}
      />
      <PhaseEnter phaseKey={`${view.factNumber}:${view.phase}`}>
        <HostBody view={view} room={room} deadline={deadline} clock={clock} />
      </PhaseEnter>
    </div>
  );
}

function HostBody({ view, room, deadline, clock }: HostProps) {
  if (view.phase === "write") {
    return (
      <WritePhase view={view} room={room} deadline={deadline} clock={clock} />
    );
  }
  if (view.phase === "vote") {
    return <VotePhase view={view} deadline={deadline} clock={clock} />;
  }
  return <RevealPhase view={view} room={room} />;
}

interface PhaseProps {
  view: RonHostView;
  room: HostRoomView;
  deadline: number | null;
  clock: ServerClock;
}

function WritePhase({ view, room, deadline, clock }: PhaseProps) {
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
          <Marker size={64}>Write a believable lie on your phone</Marker>
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
          clock={clock}
          size={190}
          note="left to write"
        />
      </div>
      <WriteProgress view={view} room={room} />
    </>
  );
}

function TimerSide({
  deadline,
  clock,
  size,
  note,
}: {
  deadline: number | null;
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
      <Timer deadline={deadline} clock={clock} size={size} />
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

function WriteProgress({
  view,
  room,
}: {
  view: RonHostView;
  room: HostRoomView;
}) {
  const count = Math.max(1, view.playerIds.length);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 18 }}>
        <Marker size={44}>Lies in</Marker>
        <div style={{ fontSize: 36, fontWeight: 700 }}>
          {view.submittedIds.length} of {view.playerIds.length}
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
function LieStatus({ done }: { done: boolean }) {
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
      <div>{done ? "Done" : "Writing…"}</div>
    </div>
  );
}

function LieTile({
  room,
  id,
  done,
}: {
  room: HostRoomView;
  id: PlayerId;
  done: boolean;
}) {
  const player = playerFor(room, id);
  return (
    <div style={lieTileStyle(done)}>
      <Avatar
        id={playerAvatar(player)}
        size={72}
        alt={`${playerName(player)}'s avatar`}
      />
      <div
        style={{
          fontSize: 34,
          fontWeight: 700,
          lineHeight: 1.1,
          textAlign: "center",
        }}
      >
        {playerName(player)}
      </div>
      <LieStatus done={done} />
    </div>
  );
}

function VotePhase({ view, deadline, clock }: Omit<PhaseProps, "room">) {
  const options = view.options ?? [];
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
        <VotedSide view={view} deadline={deadline} clock={clock} />
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 28 }}>
        <Marker size={68}>Which one is real?</Marker>
        <div
          style={{
            fontSize: 38,
            fontWeight: 700,
            color: "var(--opg-ink-secondary)",
          }}
        >
          Vote on your phone.
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
  clock,
}: Pick<PhaseProps, "view" | "deadline" | "clock">) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 10,
      }}
    >
      <Timer deadline={deadline} clock={clock} size={170} />
      <div
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
          {view.votedIds.length} of {view.playerIds.length} voted
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

function RevealPhase({
  view,
  room,
}: {
  view: RonHostView;
  room: HostRoomView;
}) {
  if (!view.reveal) return null;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "640px minmax(0, 1fr)",
        gap: 56,
        flexGrow: 1,
        alignItems: "start",
      }}
    >
      <TruthCard view={view} room={room} />
      <LiesList lies={view.reveal.lies} room={room} />
    </div>
  );
}

const LABEL = {
  fontSize: 28,
  fontWeight: 700,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: "var(--opg-ink-secondary)",
} as const;

function TruthCard({ view, room }: { view: RonHostView; room: HostRoomView }) {
  const reveal = view.reveal;
  if (!reveal) return null;
  return (
    <Card
      variant="L"
      tilt={-1.5}
      style={{
        position: "relative",
        marginTop: 18,
        padding: "48px 48px 40px",
        display: "flex",
        flexDirection: "column",
        gap: 20,
      }}
    >
      <Tape left={220} top={-24} width={190} height={48} rotate={-3} />
      <div style={LABEL}>The truth</div>
      <PromptText
        prompt={view.prompt}
        answer={reveal.answer}
        style={{ fontSize: 34, lineHeight: 1.35 }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
        <Highlight style={{ padding: "0 16px" }}>
          <span style={{ fontSize: 108, fontWeight: 700 }}>
            {reveal.answer}
          </span>
        </Highlight>
        <Stamp size={56} tilt={-8}>
          REAL
        </Stamp>
      </div>
      <FoundBy room={room} ids={reveal.foundByIds} />
      <div style={{ fontSize: 28, color: "var(--opg-ink-secondary)" }}>
        Source: Wikipedia, “{reveal.source.title}”
      </div>
    </Card>
  );
}

function FoundBy({ room, ids }: { room: HostRoomView; ids: PlayerId[] }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        marginTop: 6,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 20,
        }}
      >
        <div style={{ fontSize: 32, fontWeight: 700 }}>Found by</div>
        {ids.length > 0 ? (
          <Marker
            size={40}
            color="var(--opg-marker)"
            style={{ transform: "rotate(-3deg)" }}
          >
            +{POINTS_TRUTH.toLocaleString("en-US")} each
          </Marker>
        ) : null}
      </div>
      {ids.length > 0 ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 36,
            flexWrap: "wrap",
          }}
        >
          {ids.map((id) => (
            <Person
              key={id}
              room={room}
              id={id}
              avatarSize={72}
              fontSize={34}
            />
          ))}
        </div>
      ) : (
        <div
          style={{
            fontSize: 32,
            fontWeight: 700,
            color: "var(--opg-ink-secondary)",
          }}
        >
          Nobody found it
        </div>
      )}
    </div>
  );
}

const LIE_GRID = {
  display: "grid",
  gridTemplateColumns: "290px 96px 196px minmax(0, 1fr) 130px",
  gap: 20,
  alignItems: "center",
} as const;

/** Highest scoring lie first. ES2022 has no Array#toSorted, so sort by hand. */
function sortByPoints(lies: readonly RonFooledLie[]): RonFooledLie[] {
  const remaining = [...lies];
  const sorted: RonFooledLie[] = [];
  while (remaining.length > 0) {
    const best = Math.max(...remaining.map((lie) => lie.points));
    const at = remaining.findIndex((lie) => lie.points === best);
    sorted.push(...remaining.splice(at, 1));
  }
  return sorted;
}

function LiesList({
  lies,
  room,
}: {
  lies: RonFooledLie[];
  room: HostRoomView;
}) {
  const sorted = sortByPoints(lies);
  const rowHeight = sorted.length > 6 ? 68 : 92;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Marker size={60}>The lies</Marker>
      <div
        style={{
          ...LIE_GRID,
          padding: "0 28px",
          fontSize: 28,
          fontWeight: 700,
          color: "var(--opg-ink-secondary)",
        }}
      >
        <div>Lie</div>
        <div />
        <div>Written by</div>
        <div>Fooled</div>
        <div style={{ textAlign: "right" }}>Points</div>
      </div>
      {sorted.map((lie, index) => (
        <LieRow
          key={lie.optionId}
          lie={lie}
          room={room}
          alt={index % 2 === 1}
          minHeight={rowHeight}
        />
      ))}
    </div>
  );
}

function lieRowStyle(alt: boolean, fooled: boolean, minHeight: number) {
  return {
    ...LIE_GRID,
    minHeight,
    padding: "12px 24px",
    background: fooled ? "var(--opg-card)" : "rgba(255, 255, 255, 0.6)",
    border: fooled ? "4px solid var(--opg-ink)" : "4px dashed var(--opg-muted)",
    borderRadius: alt ? "var(--opg-radius-m-alt)" : "var(--opg-radius-m)",
  };
}

function FooledCell({ lie, room }: { lie: RonFooledLie; room: HostRoomView }) {
  if (lie.fooledIds.length === 0) {
    return (
      <div
        style={{
          fontSize: 28,
          fontWeight: 700,
          color: "var(--opg-ink-secondary)",
        }}
      >
        Fooled nobody
      </div>
    );
  }
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        flexWrap: "wrap",
      }}
    >
      {lie.fooledIds.map((id) => (
        <Person key={id} room={room} id={id} avatarSize={44} fontSize={28} />
      ))}
    </div>
  );
}

function LieRow({
  lie,
  room,
  alt,
  minHeight,
}: {
  lie: RonFooledLie;
  room: HostRoomView;
  alt: boolean;
  minHeight: number;
}) {
  const author = lie.authorId ? playerFor(room, lie.authorId) : undefined;
  const fooled = lie.fooledIds.length > 0;
  return (
    <div style={lieRowStyle(alt, fooled, minHeight)}>
      <div style={{ fontSize: 36, fontWeight: 700, lineHeight: 1.2 }}>
        {lie.text}
      </div>
      <div style={{ justifySelf: "start" }}>
        <Stamp size={30} tilt={-6}>
          NAH
        </Stamp>
      </div>
      <PersonTag
        name={author?.name ?? "House lie"}
        avatar={author?.avatar ?? null}
        avatarSize={52}
        fontSize={30}
      />
      <FooledCell lie={lie} room={room} />
      <div
        className="opg-marker"
        style={{
          textAlign: "right",
          fontSize: 40,
          color: fooled ? "var(--opg-ink)" : "var(--opg-ink-secondary)",
        }}
      >
        +{lie.points.toLocaleString("en-US")}
      </div>
    </div>
  );
}
