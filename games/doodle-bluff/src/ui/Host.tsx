// TV host screens for Doodle Bluff. One body per phase, all data from DoodleHostView.
import type { CSSProperties, ReactNode } from "react";
import type { HostRoomView, PlayerId, PlayerSummary } from "@opg/protocol";
import type { ServerClock } from "@opg/ui";
import { anchorAt, Avatar, DoodleView, Icon, Marker, PhaseEnter, Timer, TvHeader, useMusic } from "@opg/ui";
import { format, useLocale } from "@opg/i18n";
import type { Dictionary } from "@opg/i18n";
import { TITLE_MS, type DoodleHostView, type DoodlePhase } from "../state";
import { avatarOf, drawingLabel, nameOf } from "./common";
import { HostGallery } from "./HostGallery";
import { HostReveal } from "./HostReveal";

const TILTS = [-1.5, 1, -1, 1.5, -1, 2];
// minHeight lets the wrapping rows below shrink instead of growing the column past the
// 1080 stage, which is how the reveal's truth card once ended up off the bottom edge.
const BODY: CSSProperties = {
  // basis 0, not auto: an `auto` basis sizes the column from its content, so it never shrinks
  // and the tall phases grow straight past the bottom of the 1080 stage.
  flex: "1 1 0",
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  gap: 40,
  minHeight: 0,
  overflow: "hidden",
};

/** A row that takes the height left over and clips, rather than pushing the column taller. */
const FILL_ROW: CSSProperties = { flex: "1 1 auto", minHeight: 0, overflow: "hidden" };

interface SectionProps {
  view: DoodleHostView;
  players: PlayerSummary[];
  deadline: number | null;
  timerStartedAt: number | null;
  clock: ServerClock;
}

function PlayerTile({
  id,
  players,
  done,
  doneLabel,
  workingLabel,
  t,
}: {
  id: PlayerId;
  players: PlayerSummary[];
  done: boolean;
  doneLabel: string;
  workingLabel: string;
  t: Dictionary;
}) {
  const name = nameOf(players, id, t.common.someone);
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 10,
        padding: "18px 10px 16px",
        background: done ? "var(--opg-card)" : "rgba(255, 255, 255, 0.6)",
        border: done ? "4px solid var(--opg-ink)" : "4px dashed var(--opg-muted)",
        borderRadius: "var(--opg-radius-m)",
      }}
    >
      <Avatar id={avatarOf(players, id)} size={72} alt={format(t.doodleBluff.avatarAlt, { name })} />
      <div style={{ fontSize: 30, fontWeight: 700, lineHeight: 1.1 }}>{name}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 28, fontWeight: 700, color: done ? undefined : "var(--opg-ink-secondary)" }}>
        <Icon name={done ? "check" : "pencil"} size={26} color={done ? "var(--opg-marker)" : "var(--opg-muted)"} />
        <div>{done ? doneLabel : workingLabel}</div>
      </div>
    </div>
  );
}

/** design/TVDoodleBluffDraw.dc.html: the draw phase is 130s where this is the only thing on the TV. */
function drawingProgressLabel(t: Dictionary, done: number): string {
  return format(t.doodleBluff.drawingOfTotal, { current: done + 1, total: 2 });
}

function TileGrid({ children, count }: { children: ReactNode; count: number }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.max(count, 1)}, minmax(0, 1fr))`, gap: 24, ...FILL_ROW }}>
      {children}
    </div>
  );
}

// ---------- draw ----------

function Draw({ view, players, deadline, timerStartedAt, clock }: SectionProps) {
  const { t } = useLocale();
  return (
    <div style={BODY}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Marker size={52}>{t.doodleBluff.everyoneIsDrawing}</Marker>
        <Timer deadline={deadline} clock={clock} size={150} startedAt={timerStartedAt} ticks />
      </div>
      <TileGrid count={view.playerIds.length}>
        {view.playerIds.map((id) => (
          <PlayerTile
            key={id}
            id={id}
            players={players}
            done={view.drawnIds.includes(id)}
            doneLabel={t.doodleBluff.bothDone}
            workingLabel={drawingProgressLabel(t, view.drawnCounts[id] ?? 0)}
            t={t}
          />
        ))}
      </TileGrid>
    </div>
  );
}

// ---------- title ----------

function TitleHeading({ view, deadline, timerStartedAt, clock, t }: SectionProps & { t: Dictionary }) {
  const eligible = Math.max(0, view.playerIds.length - 1);
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <Marker size={44}>{t.doodleBluff.whosWritten}</Marker>
      <div style={{ fontSize: 30, fontWeight: 700 }}>
        {format(t.doodleBluff.writtenOfEligible, { written: view.writtenIds.length, eligible })}
      </div>
      <Timer deadline={deadline} clock={clock} size={140} startedAt={timerStartedAt} ticks />
    </div>
  );
}

function Title({ view, players, deadline, timerStartedAt, clock }: SectionProps) {
  const { t } = useLocale();
  const replayStart = anchorAt(timerStartedAt, deadline, TITLE_MS);
  return (
    <div style={BODY}>
      {view.doodle !== null ? (
        <DoodleView doodle={view.doodle} label={drawingLabel(t, nameOf(players, view.artistId, t.common.someone))} clock={clock} replay={replayStart === null ? undefined : { startedAt: replayStart }} size={320} style={{ alignSelf: "center", flexShrink: 0 }} />
      ) : null}
      <TitleHeading view={view} players={players} deadline={deadline} timerStartedAt={timerStartedAt} clock={clock} t={t} />
      <TileGrid count={view.playerIds.length}>
        {view.playerIds.map((id) =>
          id === view.artistId ? (
            <PlayerTile key={id} id={id} players={players} done workingLabel="" doneLabel={t.doodleBluff.drewThisOne} t={t} />
          ) : (
            <PlayerTile key={id} id={id} players={players} done={view.writtenIds.includes(id)} doneLabel={t.doodleBluff.written} workingLabel={t.doodleBluff.stillWriting} t={t} />
          ),
        )}
      </TileGrid>
    </div>
  );
}

// ---------- vote ----------

function VoteHeading({ view, deadline, timerStartedAt, clock }: SectionProps) {
  const { t } = useLocale();
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <Marker size={48}>{t.doodleBluff.whichIsReal}</Marker>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
        <Timer deadline={deadline} clock={clock} size={150} startedAt={timerStartedAt} ticks />
        <div style={{ fontSize: 30, fontWeight: 700 }}>
          {format(t.doodleBluff.votedOfTotal, { voted: view.votedIds.length, total: Math.max(0, view.playerIds.length - 1) })}
        </div>
      </div>
    </div>
  );
}

function VoteOption({ text, index }: { text: string; index: number }) {
  return (
    <div
      style={{
        width: 360,
        minHeight: 140,
        padding: "22px 20px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        background: "var(--opg-card)",
        border: "4px solid var(--opg-ink)",
        borderRadius: index % 2 === 1 ? "var(--opg-radius-m-alt)" : "var(--opg-radius-m)",
        transform: `rotate(${TILTS[index % TILTS.length]}deg)`,
        fontSize: 32,
        fontWeight: 700,
        lineHeight: 1.2,
      }}
    >
      {text}
    </div>
  );
}

function Vote(props: SectionProps) {
  const { view, clock } = props;
  const { t } = useLocale();
  useMusic("tension");
  return (
    <div style={BODY}>
      {view.doodle !== null ? <DoodleView doodle={view.doodle} label={drawingLabel(t, nameOf(props.players, view.artistId, t.common.someone))} clock={clock} size={260} style={{ alignSelf: "center", flexShrink: 0 }} /> : null}
      <VoteHeading {...props} />
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 24, alignContent: "flex-start", ...FILL_ROW }}>
        {(view.options ?? []).map((option, index) => (
          <VoteOption key={option.id} text={option.text} index={index} />
        ))}
      </div>
      <div style={{ textAlign: "center", fontSize: 30, fontWeight: 700, color: "var(--opg-ink-secondary)" }}>{t.doodleBluff.voteOnYourPhone}</div>
    </div>
  );
}

// ---------- reveal / gallery ----------

function Reveal(props: SectionProps) {
  return <HostReveal view={props.view} players={props.players} deadline={props.deadline} timerStartedAt={props.timerStartedAt} clock={props.clock} />;
}

function Gallery({ view, players, clock }: SectionProps) {
  return <HostGallery entries={view.gallery ?? []} players={players} clock={clock} />;
}

type PhaseComponent = (props: SectionProps) => ReactNode;

const PHASES = { draw: Draw, title: Title, vote: Vote, reveal: Reveal, gallery: Gallery } satisfies Record<DoodlePhase, PhaseComponent>;

function PhaseBody(props: SectionProps): ReactNode {
  const Phase = PHASES[props.view.phase];
  return <Phase {...props} />;
}

function progressFor(t: Dictionary, view: DoodleHostView): string {
  if (view.phase === "draw") return t.doodleBluff.progressDraw;
  if (view.phase === "gallery") return t.doodleBluff.progressGallery;
  return format(t.doodleBluff.progressRound, { round: view.roundNumber, count: view.roundCount });
}

export interface HostProps {
  view: DoodleHostView;
  room: HostRoomView;
  deadline: number | null;
  timerStartedAt: number | null;
  clock: ServerClock;
}

export function Host({ view, room, deadline, timerStartedAt, clock }: HostProps) {
  const { t } = useLocale();
  return (
    <div style={{ height: "100%", padding: "44px 72px 40px", display: "flex", flexDirection: "column", gap: 28, overflow: "hidden" }}>
      <TvHeader variant="game" gameName={t.doodleBluff.title} progress={progressFor(t, view)} roomCode={room.code} />
      <PhaseEnter phaseKey={`${view.roundNumber}:${view.phase}`}>
        <PhaseBody view={view} players={room.players} deadline={deadline} timerStartedAt={timerStartedAt} clock={clock} />
      </PhaseEnter>
    </div>
  );
}
