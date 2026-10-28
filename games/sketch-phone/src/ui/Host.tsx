// TV host screens for Sketch Phone. One body per phase, all data from SketchHostView: the round
// with its roster, the replay of one chain, its vote and its favourite.
import type { CSSProperties, ReactNode } from "react";
import type { HostRoomView, PlayerId, PlayerSummary } from "@opg/protocol";
import type { ServerClock } from "@opg/ui";
import { Avatar, Card, DoodleView, Icon, Marker, PhaseEnter, Timer, TvHeader } from "@opg/ui";
import { format, pickPluralByCount, useLocale } from "@opg/i18n";
import type { Dictionary } from "@opg/i18n";
import { POINTS_PER_VOTE, type SketchHostView, type SketchLinkView, type SketchPhase } from "../state";
import { avatarOf, linkLabel, nameOf, sourceOf, statusLabel } from "./common";

const BODY: CSSProperties = {
  flex: "1 1 0",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 32,
  minHeight: 0,
  overflow: "hidden",
};

const CARD: CSSProperties = { padding: "18px 22px", display: "flex", flexDirection: "column", gap: 10 };

interface SectionProps {
  view: SketchHostView;
  players: PlayerSummary[];
  deadline: number | null;
  timerStartedAt: number | null;
  clock: ServerClock;
}

function chainProgress(t: Dictionary, view: SketchHostView, players: PlayerSummary[]): string {
  const name = view.ownerId === null ? "" : nameOf(players, view.ownerId, t.common.someone);
  return format(t.sketchPhone.chainOf, { current: view.chainNumber, count: view.chainCount, name });
}

function progressFor(t: Dictionary, view: SketchHostView, players: PlayerSummary[]): string {
  if (view.phase === "replay" || view.phase === "vote" || view.phase === "favourite") {
    return chainProgress(t, view, players);
  }
  if (view.phase === "write") return t.sketchPhone.progressWrite;
  return format(t.sketchPhone.roundOf, { round: view.roundNumber, count: view.roundCount });
}

// ---------- the round ----------

const STEPS: readonly { phase: SketchPhase; label: (t: Dictionary) => string }[] = [
  { phase: "write", label: (t) => t.sketchPhone.progressWrite },
  { phase: "draw", label: (t) => t.sketchPhone.progressDraw },
  { phase: "describe", label: (t) => t.sketchPhone.progressDescribe },
];

function Step({ label, current }: { label: string; current: boolean }) {
  return (
    <div
      style={{
        padding: "6px 20px",
        fontSize: 32,
        fontWeight: 700,
        borderRadius: 14,
        border: "3px solid var(--opg-ink)",
        background: current ? "var(--opg-highlight)" : "transparent",
        color: current ? "var(--opg-ink)" : "var(--opg-ink-secondary)",
      }}
    >
      {label}
    </div>
  );
}

function Steps({ phase, t }: { phase: SketchPhase; t: Dictionary }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      {STEPS.map((step, index) => (
        <div key={step.phase} style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {index > 0 ? <span style={{ fontSize: 34, fontWeight: 700 }}>→</span> : null}
          <Step label={step.label(t)} current={phase === step.phase} />
        </div>
      ))}
    </div>
  );
}

function roundHeading(t: Dictionary, phase: SketchPhase): string {
  if (phase === "write") return t.sketchPhone.writeOnTv;
  if (phase === "draw") return t.sketchPhone.drawWhatYouGot;
  return t.sketchPhone.describeWhatYouGot;
}

function roundStatus(t: Dictionary, phase: SketchPhase): string {
  if (phase === "write") return t.sketchPhone.everyoneIsWriting;
  if (phase === "draw") return t.sketchPhone.everyoneIsDrawing;
  return t.sketchPhone.everyoneIsDescribing;
}

function StatusTile({
  id,
  players,
  done,
  working,
  t,
}: {
  id: PlayerId;
  players: PlayerSummary[];
  done: boolean;
  working: string | null;
  t: Dictionary;
}) {
  const name = nameOf(players, id, t.common.someone);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, width: 190 }}>
      <Avatar id={avatarOf(players, id)} size={78} alt={format(t.sketchPhone.avatarAlt, { name })} />
      <div style={{ fontSize: 30, fontWeight: 700, textAlign: "center", overflowWrap: "anywhere" }}>{name}</div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 28,
          color: done ? "var(--opg-ink)" : "var(--opg-ink-secondary)",
        }}
      >
        {done ? <Icon name="check" size={24} /> : null}
        {done ? t.sketchPhone.done : working}
      </div>
    </div>
  );
}

function RoundStage({ view, players, deadline, timerStartedAt, clock }: SectionProps) {
  const { t } = useLocale();
  const working = statusLabel(t, view.phase);
  return (
    <div style={{ ...BODY, gap: 26 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 48 }}>
        <Marker size={58} level={1} style={{ maxWidth: 1180 }}>
          {roundHeading(t, view.phase)}
        </Marker>
        <Timer deadline={deadline} clock={clock} size={150} startedAt={timerStartedAt} ticks />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
        <Steps phase={view.phase} t={t} />
        <div style={{ fontSize: 32, fontWeight: 700, color: "var(--opg-ink-secondary)" }}>{roundStatus(t, view.phase)}</div>
      </div>
      <div style={{ fontSize: 30, color: "var(--opg-ink-secondary)" }}>
        {format(t.sketchPhone.doneOfTotal, { done: view.doneIds.length, total: view.playerIds.length })}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 26 }}>
        {view.playerIds.map((id) => (
          <StatusTile
            key={id}
            id={id}
            players={players}
            done={view.doneIds.includes(id)}
            working={working}
            t={t}
          />
        ))}
      </div>
    </div>
  );
}

// ---------- one link ----------

function LinkCard({
  link,
  players,
  clock,
  size,
  t,
  children,
}: {
  link: SketchLinkView;
  players: PlayerSummary[];
  clock: ServerClock;
  size: number;
  t: Dictionary;
  children?: ReactNode;
}) {
  const name = nameOf(players, link.authorId, t.common.someone);
  const label = linkLabel(t, link.kind, name);
  return (
    <Card tilt={0} style={{ ...CARD, width: size + 60, alignItems: "center" }}>
      <div style={{ fontSize: 28, fontWeight: 700, color: "var(--opg-ink-secondary)" }}>{label}</div>
      {link.doodle !== null ? (
        <DoodleView doodle={link.doodle} label={label} clock={clock} size={size} />
      ) : (
        <div style={{ fontSize: 32, fontWeight: 700, textAlign: "center", overflowWrap: "anywhere" }}>{link.text}</div>
      )}
      {children}
    </Card>
  );
}

// ---------- the replay ----------

function ReplayStage({ view, players, deadline, clock, timerStartedAt }: SectionProps) {
  const { t } = useLocale();
  const links = view.links ?? [];
  const presenter = view.presenterId === null ? "" : nameOf(players, view.presenterId, t.common.someone);
  return (
    <div style={{ ...BODY, alignItems: "stretch", gap: 24 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 32 }}>
        <Marker size={54} level={1}>
          {t.sketchPhone.yourChain}
        </Marker>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ fontSize: 30, fontWeight: 700, color: "var(--opg-ink-secondary)" }}>{presenter}</div>
          <Timer deadline={deadline} clock={clock} size={120} startedAt={timerStartedAt} ticks />
        </div>
      </div>
      <div style={{ flex: "1 1 auto", minHeight: 0, display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: 22, overflow: "hidden" }}>
        {links.map((link) => (
          <LinkCard key={link.id} link={link} players={players} clock={clock} size={links.length > 4 ? 150 : 210} t={t} />
        ))}
      </div>
      <div style={{ fontSize: 30, color: "var(--opg-ink-secondary)", textAlign: "center" }}>{t.sketchPhone.movedOneSeat}</div>
    </div>
  );
}

// ---------- the vote ----------

function votesLabel(t: Dictionary, votes: number): string {
  return format(pickPluralByCount(votes, t.sketchPhone.votes), { count: votes });
}

function VoteStage({ view, players, deadline, timerStartedAt, clock }: SectionProps) {
  const { t } = useLocale();
  const links = view.links ?? [];
  const counts = view.voteCounts ?? {};
  return (
    <div style={{ ...BODY, alignItems: "stretch", gap: 26 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 32 }}>
        <Marker size={54} level={1}>
          {t.sketchPhone.pickFavouriteHost}
        </Marker>
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <div style={{ fontSize: 30, fontWeight: 700 }}>
            {format(t.sketchPhone.votedOfTotal, { voted: view.votedIds.length, total: view.playerIds.length })}
          </div>
          <Timer deadline={deadline} clock={clock} size={120} startedAt={timerStartedAt} ticks />
        </div>
      </div>
      <div style={{ flex: "1 1 auto", minHeight: 0, display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: 22, overflow: "hidden" }}>
        {links.map((link) => (
          <LinkCard key={link.id} link={link} players={players} clock={clock} size={170} t={t}>
            <div style={{ fontSize: 28, fontWeight: 700 }}>{votesLabel(t, counts[link.id] ?? 0)}</div>
          </LinkCard>
        ))}
      </div>
      <div style={{ fontSize: 30, color: "var(--opg-ink-secondary)", textAlign: "center" }}>
        {t.sketchPhone.voteOnPhone}
      </div>
    </div>
  );
}

// ---------- the favourite ----------

/** Nobody voted: still a beat of its own, rather than a blank screen. */
function NoFavourite({ t }: { t: Dictionary }) {
  return (
    <div style={BODY}>
      <Marker size={54} level={1}>
        {t.sketchPhone.favourite}
      </Marker>
      <div style={{ fontSize: 32, color: "var(--opg-ink-secondary)" }}>{t.sketchPhone.noFavourite}</div>
    </div>
  );
}

/** The words the favourite came from, and how the rest of the chain did. */
function SourcePanel({ view, players, links, counts, t }: {
  view: SketchHostView;
  players: PlayerSummary[];
  links: SketchLinkView[];
  counts: Record<string, number>;
  t: Dictionary;
}) {
  const favourite = links.find((link) => link.id === view.favouriteId);
  const source = favourite === undefined ? null : sourceOf(links, favourite.id);
  const others = links.filter((link) => link.id !== view.favouriteId);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 760 }}>
      {source !== null ? (
        <div style={{ fontSize: 28, color: "var(--opg-ink-secondary)" }}>
          {format(t.sketchPhone.itCameFrom, {
            label: linkLabel(t, source.kind, nameOf(players, source.authorId, t.common.someone)),
          })}
        </div>
      ) : null}
      {source !== null && source.text !== null ? (
        <div style={{ fontSize: 40, fontWeight: 700, overflowWrap: "anywhere" }}>{source.text}</div>
      ) : null}
      <div style={{ fontSize: 28, fontWeight: 700 }}>{t.sketchPhone.everyoneElse}</div>
      {others.slice(0, 4).map((link) => (
        <div key={link.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 18 }}>
          <span style={{ fontSize: 28 }}>
            {linkLabel(t, link.kind, nameOf(players, link.authorId, t.common.someone))}
          </span>
          <span style={{ fontSize: 28, color: "var(--opg-ink-secondary)" }}>{votesLabel(t, counts[link.id] ?? 0)}</span>
        </div>
      ))}
    </div>
  );
}

function FavouriteStage({ view, players, deadline, timerStartedAt, clock }: SectionProps) {
  const { t } = useLocale();
  const links = view.links ?? [];
  const counts = view.voteCounts ?? {};
  const favourite = links.find((link) => link.id === view.favouriteId) ?? null;
  if (favourite === null) return <NoFavourite t={t} />;
  const votes = counts[favourite.id] ?? 0;
  return (
    <div style={{ ...BODY, alignItems: "stretch", gap: 22 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 32 }}>
        <Marker size={54} level={1}>
          {t.sketchPhone.favourite}
        </Marker>
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <div style={{ fontSize: 30, fontWeight: 700 }}>
            {format(t.sketchPhone.chainOfShort, { current: view.chainNumber, count: view.chainCount })}
          </div>
          <Timer deadline={deadline} clock={clock} size={120} startedAt={timerStartedAt} ticks />
        </div>
      </div>
      <div style={{ flex: "1 1 auto", minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 40, overflow: "hidden" }}>
        <LinkCard link={favourite} players={players} clock={clock} size={260} t={t}>
          <div style={{ fontSize: 34, fontWeight: 700 }}>{format(t.sketchPhone.pointsAwarded, { points: votes * POINTS_PER_VOTE })}</div>
          <div style={{ fontSize: 28, color: "var(--opg-ink-secondary)" }}>{votesLabel(t, votes)}</div>
        </LinkCard>
        <SourcePanel view={view} players={players} links={links} counts={counts} t={t} />
      </div>
    </div>
  );
}

const PHASES = {
  write: RoundStage,
  draw: RoundStage,
  describe: RoundStage,
  replay: ReplayStage,
  vote: VoteStage,
  favourite: FavouriteStage,
} satisfies Record<SketchPhase, (props: SectionProps) => ReactNode>;

export interface HostProps {
  view: SketchHostView;
  room: HostRoomView;
  deadline: number | null;
  timerStartedAt: number | null;
  clock: ServerClock;
}

export function Host({ view, room, deadline, timerStartedAt, clock }: HostProps) {
  const { t } = useLocale();
  const Phase = PHASES[view.phase];
  return (
    <div style={{ height: "100%", padding: "44px 72px 40px", display: "flex", flexDirection: "column", gap: 24, overflow: "hidden" }}>
      <TvHeader
        variant="game"
        gameName={t.sketchPhone.title}
        progress={progressFor(t, view, room.players)}
        roomCode={room.code}
      />
      <PhaseEnter phaseKey={`${view.phase}:${view.chainNumber}:${view.revealed}`}>
        <Phase view={view} players={room.players} deadline={deadline} timerStartedAt={timerStartedAt} clock={clock} />
      </PhaseEnter>
    </div>
  );
}
