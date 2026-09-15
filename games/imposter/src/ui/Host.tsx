// TV Host screens for Imposter. One body per phase, all data from ImposterHostView.
import { useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import type { HostRoomView, PlayerId, PlayerSummary } from "@opg/protocol";
import type { ServerClock } from "@opg/ui";
import {
  Avatar,
  Card,
  Highlight,
  Icon,
  Marker,
  Stamp,
  StickyNote,
  Tape,
  Timer,
  TvHeader,
} from "@opg/ui";
import {
  LAST_CHANCE_MS,
  POINTS_PER_WORD,
  type ImposterHostView,
  type ImposterPhase,
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

function avatarLabel(players: PlayerSummary[], id: PlayerId | null): string {
  return `${nameOf(players, id)}'s avatar`;
}

function money(value: number): string {
  return value.toLocaleString("en-US");
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
  clock: ServerClock;
}

/** Live mm:ss text for the result sticky note (Timer is a circle). */
function Countdown({
  deadline,
  clock,
}: {
  deadline: number | null;
  clock: ServerClock;
}) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (deadline === null) return undefined;
    const id = window.setInterval(() => tick((t) => t + 1), 250);
    return () => window.clearInterval(id);
  }, [deadline]);
  if (deadline === null) return null;
  const total = Math.max(0, Math.ceil((deadline - clock.now()) / 1000));
  return (
    <>
      {Math.floor(total / 60)}:{String(total % 60).padStart(2, "0")}
    </>
  );
}

/** Marker tally strokes, one per vote. */
function TallyMarks({ count, size = 56 }: { count: number; size?: number }) {
  if (count <= 0) return null;
  const gap = 20;
  const marks: string[] = [];
  for (let i = 0; i < count; i += 1) {
    marks.push(`M${8 + i * gap} 6 l-3 ${size - 12}`);
  }
  return (
    <svg
      width={count * gap}
      height={size}
      viewBox={`0 0 ${count * gap} ${size}`}
      fill="none"
      stroke="#2B2B2B"
      strokeWidth={5}
      strokeLinecap="round"
      aria-hidden="true"
    >
      {marks.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

// ---------- word-check ----------

function WordCheckHeading({ deadline, clock }: SectionProps) {
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
        <Timer deadline={deadline} clock={clock} size={170} />
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

function SpeakerCard({ view, players, deadline, clock }: SectionProps) {
  const speaker = nameOf(players, view.currentSpeakerId);
  return (
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
          <Timer deadline={deadline} clock={clock} size={170} />
          <div style={{ fontSize: 30, ...SECONDARY }}>Time left</div>
        </div>
      </div>
      <Marker size={104}>{speaker}&apos;s turn</Marker>
      <div style={{ fontSize: 46, fontWeight: 700, lineHeight: 1.2 }}>
        Say one clue out loud
      </div>
    </Card>
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

function VoteHeading({ view, deadline, clock }: SectionProps) {
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
        <Timer deadline={deadline} clock={clock} size={170} />
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
  players,
}: {
  id: PlayerId;
  index: number;
  hasVoted: boolean;
  players: PlayerSummary[];
}) {
  return (
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
  );
}

function Vote(props: SectionProps) {
  const { view, players } = props;
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

// ---------- reveal ----------

function VoterStack({
  voters,
  players,
  size,
}: {
  voters: PlayerId[];
  players: PlayerSummary[];
  size: number;
}) {
  return (
    <div
      style={{
        minHeight: 48,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexWrap: "wrap",
        gap: 8,
      }}
    >
      {voters.map((voterId) => (
        <Avatar
          key={voterId}
          id={avatarOf(players, voterId)}
          size={size}
          alt={avatarLabel(players, voterId)}
        />
      ))}
    </div>
  );
}

function ImposterTile({
  id,
  voters,
  players,
  compact,
}: {
  id: PlayerId;
  voters: PlayerId[];
  players: PlayerSummary[];
  compact: boolean;
}) {
  const label = `${voters.length} ${voters.length === 1 ? "vote" : "votes"}`;
  return (
    <Card
      variant="L"
      background="var(--opg-highlight-soft)"
      tilt={-1}
      style={{
        flex: "1.4 1 0",
        minWidth: 0,
        marginBottom: 40,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 12,
        padding: "60px 16px 26px",
        border: "5px solid var(--opg-ink)",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: -38,
          display: "flex",
          justifyContent: "center",
        }}
      >
        <Stamp size={52} tilt={-6}>
          Imposter!
        </Stamp>
      </div>
      <Avatar
        id={avatarOf(players, id)}
        size={compact ? 120 : 170}
        alt={avatarLabel(players, id)}
      />
      <div style={{ fontSize: 48, fontWeight: 700, lineHeight: 1.1 }}>
        {nameOf(players, id)}
      </div>
      <div
        style={{ height: 60, display: "flex", alignItems: "center", gap: 14 }}
      >
        <TallyMarks count={voters.length} />
        <div style={{ fontSize: 44, fontWeight: 700, lineHeight: 1 }}>
          {label}
        </div>
      </div>
      <VoterStack voters={voters} players={players} size={48} />
      <div style={{ fontSize: 28, ...SECONDARY }}>
        {voters.map((voterId) => nameOf(players, voterId)).join(", ")}
      </div>
    </Card>
  );
}

function RevealTile({
  id,
  index,
  voters,
  players,
  compact,
}: {
  id: PlayerId;
  index: number;
  voters: PlayerId[];
  players: PlayerSummary[];
  compact: boolean;
}) {
  const label = `${voters.length} ${voters.length === 1 ? "vote" : "votes"}`;
  return (
    <Card
      variant={index % 2 === 0 ? "M" : "Malt"}
      tilt={TILTS[index % TILTS.length]}
      style={{
        flex: "1 1 0",
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 10,
        padding: "22px 12px 20px",
      }}
    >
      <Avatar
        id={avatarOf(players, id)}
        size={compact ? 88 : 110}
        alt={avatarLabel(players, id)}
      />
      <div style={{ fontSize: 36, fontWeight: 700, lineHeight: 1.1 }}>
        {nameOf(players, id)}
      </div>
      <div
        style={{ height: 60, display: "flex", alignItems: "center", gap: 12 }}
      >
        <TallyMarks count={voters.length} size={50} />
        <div style={{ fontSize: 36, fontWeight: 700, lineHeight: 1 }}>
          {label}
        </div>
      </div>
      <div
        style={{ height: 44, display: "flex", alignItems: "center", gap: 6 }}
      >
        {voters.slice(0, 4).map((voterId) => (
          <Avatar
            key={voterId}
            id={avatarOf(players, voterId)}
            size={40}
            alt={avatarLabel(players, voterId)}
          />
        ))}
        {voters.length > 4 ? (
          <div style={{ fontSize: 28, fontWeight: 700 }}>
            +{voters.length - 4}
          </div>
        ) : null}
      </div>
    </Card>
  );
}

function RevealTiles({ view, players }: SectionProps) {
  const tally = view.tally ?? {};
  const compact = view.playerIds.length > 6;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "space-between",
        gap: 24,
      }}
    >
      {view.playerIds.map((id, index) => {
        const voters = tally[id] ?? [];
        if (id === view.imposterId) {
          return (
            <ImposterTile
              key={id}
              id={id}
              voters={voters}
              players={players}
              compact={compact}
            />
          );
        }
        return (
          <RevealTile
            key={id}
            id={id}
            index={index}
            voters={voters}
            players={players}
            compact={compact}
          />
        );
      })}
    </div>
  );
}

function RevealFooter({ view, players }: SectionProps) {
  const imposter = nameOf(players, view.imposterId);
  const note = view.caught
    ? `${imposter} gets one last chance…`
    : `Not caught! ${imposter} keeps the word.`;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 48,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <div style={{ fontSize: 44, fontWeight: 700 }}>
          {imposter}&apos;s decoy word was
        </div>
        <Highlight style={{ padding: "0 14px" }}>
          <Marker size={88}>{view.decoyWord ?? "—"}</Marker>
        </Highlight>
      </div>
      <StickyNote
        tilt={-2}
        style={{
          padding: "22px 32px",
          fontSize: 40,
          fontWeight: 700,
          lineHeight: 1.2,
        }}
      >
        {note}
      </StickyNote>
    </div>
  );
}

function Reveal(props: SectionProps) {
  return (
    <div
      style={{
        flexGrow: 1,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: 44,
      }}
    >
      <Marker size={96}>The votes are in</Marker>
      <RevealTiles {...props} />
      <RevealFooter {...props} />
    </div>
  );
}

// ---------- last-chance ----------

function TypingCard({ view, players }: SectionProps) {
  const imposter = nameOf(players, view.imposterId);
  return (
    <Card
      variant="L"
      tilt={-1.5}
      style={{
        padding: "44px 64px 40px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 20,
      }}
    >
      <Tape
        left="50%"
        top={-24}
        width={200}
        height={46}
        rotate={-3}
        style={{ marginLeft: -100 }}
      />
      <Avatar
        id={avatarOf(players, view.imposterId)}
        size={320}
        alt={avatarLabel(players, view.imposterId)}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <Icon name="pencil" size={72} />
        <div style={{ fontSize: 46, fontWeight: 700 }}>
          {imposter} is typing…
        </div>
      </div>
    </Card>
  );
}

function LastChance(props: SectionProps) {
  const { view, players, deadline, clock } = props;
  const imposter = nameOf(players, view.imposterId);
  const seconds = Math.round(LAST_CHANCE_MS / 1000);
  return (
    <div
      style={{
        flexGrow: 1,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: 48,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 14,
          textAlign: "center",
        }}
      >
        <Marker size={112}>Last chance, {imposter}!</Marker>
        <div
          style={{
            maxWidth: 1500,
            fontSize: 44,
            fontWeight: 700,
            lineHeight: 1.25,
          }}
        >
          {seconds} seconds to guess the crew&apos;s word. A right guess steals{" "}
          {money(POINTS_PER_WORD)} points.
        </div>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 140,
        }}
      >
        <TypingCard {...props} />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 16,
          }}
        >
          <Timer deadline={deadline} clock={clock} size={260} />
          <div style={{ fontSize: 34, ...SECONDARY }}>Seconds left</div>
        </div>
      </div>
    </div>
  );
}

// ---------- result ----------

interface PointRow {
  key: string;
  points: number;
  ids: PlayerId[];
  reason: string;
}

function imposterReason(view: ImposterHostView): string {
  if (!view.caught) return "not caught";
  return view.guessCorrect ? "guessed right" : "caught, wrong guess";
}

function votedFor(
  id: PlayerId,
  tally: Record<PlayerId, PlayerId[]> | null,
): PlayerId | null {
  let target: PlayerId | null = null;
  for (const [candidate, voters] of Object.entries(tally ?? {})) {
    if (voters.includes(id)) target = candidate;
  }
  return target;
}

function reasonFor(
  id: PlayerId,
  view: ImposterHostView,
  players: PlayerSummary[],
): string {
  if (id === view.imposterId) return imposterReason(view);
  const target = votedFor(id, view.tally);
  if (target === null) return "no vote";
  if (target === view.imposterId) return `spotted ${nameOf(players, target)}`;
  return `voted ${nameOf(players, target)}`;
}

function pointRows(
  view: ImposterHostView,
  players: PlayerSummary[],
): PointRow[] {
  const points = view.pointsThisWord ?? {};
  const rows: PointRow[] = [];
  for (const id of view.playerIds) {
    const value = points[id] ?? 0;
    const reason = reasonFor(id, view, players);
    const key = `${value}|${reason}`;
    const existing = rows.find((row) => row.key === key);
    if (existing) {
      existing.ids.push(id);
      continue;
    }
    const row: PointRow = { key, points: value, ids: [id], reason };
    const at = rows.findIndex((other) => other.points < value);
    if (at === -1) rows.push(row);
    else rows.splice(at, 0, row);
  }
  return rows;
}

function PointRowView({
  row,
  players,
}: {
  row: PointRow;
  players: PlayerSummary[];
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 20,
        minHeight: 76,
      }}
    >
      <div
        style={{ display: "flex", alignItems: "center", gap: 4, width: 264 }}
      >
        {row.ids.slice(0, 4).map((id) => (
          <Avatar
            key={id}
            id={avatarOf(players, id)}
            size={62}
            alt={avatarLabel(players, id)}
          />
        ))}
        {row.ids.length > 4 ? (
          <div style={{ fontSize: 28, fontWeight: 700 }}>
            +{row.ids.length - 4}
          </div>
        ) : null}
      </div>
      <div style={{ flexGrow: 1, display: "flex", flexDirection: "column" }}>
        <div style={{ fontSize: 34, fontWeight: 700, lineHeight: 1.2 }}>
          {row.ids.map((id) => nameOf(players, id)).join(", ")}
        </div>
        <div
          style={{
            fontSize: 30,
            lineHeight: 1.2,
            color: "var(--opg-ink-secondary)",
          }}
        >
          {row.reason}
        </div>
      </div>
      <Marker size={46} style={{ lineHeight: 1 }}>
        +{money(row.points)}
        {row.ids.length > 1 ? " each" : ""}
      </Marker>
    </div>
  );
}

function PointsCard({
  view,
  players,
}: {
  view: ImposterHostView;
  players: PlayerSummary[];
}) {
  const rows = pointRows(view, players);
  return (
    <Card
      variant="M"
      style={{
        marginTop: 10,
        padding: "30px 40px 32px",
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <Marker size={48}>Points this word</Marker>
      {rows.map((row) => (
        <PointRowView key={row.key} row={row} players={players} />
      ))}
    </Card>
  );
}

interface ResultLeftProps {
  view: ImposterHostView;
  players: PlayerSummary[];
}

function ResultLeft({ view, players }: ResultLeftProps) {
  const imposter = nameOf(players, view.imposterId);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <Marker size={64}>The word was</Marker>
      <Highlight style={{ alignSelf: "flex-start", padding: "0 20px" }}>
        <Marker size={150} style={{ letterSpacing: "0.02em" }}>
          {view.crewWord ?? "—"}
        </Marker>
      </Highlight>
      <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
        <div style={{ fontSize: 44, fontWeight: 700 }}>{imposter} guessed</div>
        <Marker size={56}>{view.guess ?? "nothing"}</Marker>
        <Stamp size={46} tilt={-6}>
          {view.guessCorrect ? "Got it" : "Nope"}
        </Stamp>
      </div>
      <PointsCard view={view} players={players} />
    </div>
  );
}

function standings(ids: PlayerId[], totals: Record<PlayerId, number>) {
  const sorted: PlayerId[] = [];
  for (const id of ids) {
    const at = sorted.findIndex(
      (other) => (totals[other] ?? 0) < (totals[id] ?? 0),
    );
    if (at === -1) sorted.push(id);
    else sorted.splice(at, 0, id);
  }
  const rankOf: Record<PlayerId, number> = {};
  sorted.forEach((id, index) => {
    const previous = index > 0 ? sorted[index - 1] : undefined;
    const tied =
      previous !== undefined && (totals[previous] ?? 0) === (totals[id] ?? 0);
    rankOf[id] = tied ? (rankOf[previous] ?? index) : index + 1;
  });
  return { sorted, rankOf };
}

function StandingsCard({ view, players }: SectionProps) {
  const { sorted, rankOf } = standings(view.playerIds, view.totals);
  return (
    <Card
      variant="Malt"
      tilt={1}
      style={{
        marginTop: 18,
        padding: "36px 40px 34px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <Tape left={220} top={-24} width={190} height={46} rotate={-3} />
      <Marker size={56} style={{ marginBottom: 8 }}>
        Standings
      </Marker>
      {sorted.map((id) => (
        <div
          key={id}
          style={{ display: "flex", alignItems: "center", gap: 18, height: 80 }}
        >
          <div style={{ width: 36, fontSize: 32, ...SECONDARY }}>
            {rankOf[id]}
          </div>
          <Avatar
            id={avatarOf(players, id)}
            size={64}
            alt={avatarLabel(players, id)}
          />
          <div style={{ flexGrow: 1, fontSize: 36, fontWeight: 700 }}>
            {nameOf(players, id)}
          </div>
          <div
            style={{
              fontSize: 38,
              fontWeight: 700,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {money(view.totals[id] ?? 0)}
          </div>
        </div>
      ))}
    </Card>
  );
}

function ResultRight({ view, players, deadline, clock }: SectionProps) {
  const nextLabel =
    view.wordNumber < view.wordCount
      ? `Word ${view.wordNumber + 1} starts in`
      : "Wrapping up in";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      <StandingsCard
        view={view}
        players={players}
        deadline={deadline}
        clock={clock}
      />
      <StickyNote
        tilt={-1.5}
        style={{
          alignSelf: "flex-end",
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: "18px 28px",
        }}
      >
        <div style={{ fontSize: 36, fontWeight: 700 }}>{nextLabel}</div>
        <Marker size={48} style={{ lineHeight: 1 }}>
          <Countdown deadline={deadline} clock={clock} />
        </Marker>
      </StickyNote>
    </div>
  );
}

function Result(props: SectionProps) {
  return (
    <div
      style={{
        flexGrow: 1,
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) 640px",
        gap: 64,
        alignItems: "start",
      }}
    >
      <ResultLeft {...props} />
      <ResultRight {...props} />
    </div>
  );
}

type PhaseComponent = (props: SectionProps) => ReactNode;

const PHASES = {
  "word-check": WordCheck,
  clues: Clues,
  vote: Vote,
  reveal: Reveal,
  "last-chance": LastChance,
  result: Result,
} satisfies Record<ImposterPhase, PhaseComponent>;

function PhaseBody(props: SectionProps): ReactNode {
  const Phase = PHASES[props.view.phase];
  return <Phase {...props} />;
}

export interface HostProps {
  view: ImposterHostView;
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
        gameName="Imposter"
        progress={`Word ${view.wordNumber} of ${view.wordCount}`}
        roomCode={room.code}
      />
      <PhaseBody
        view={view}
        players={room.players}
        deadline={deadline}
        clock={clock}
      />
    </div>
  );
}
