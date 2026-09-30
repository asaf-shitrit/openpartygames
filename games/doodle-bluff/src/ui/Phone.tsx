// Phone screens for Doodle Bluff. Renders only the player's own view; the draw pad, title and
// vote forms, the reveal, and — in a no-TV room — the whole storyboard and gallery too.
import type { ReactNode } from "react";
import type { PlayerRoomView } from "@opg/protocol";
import type { ServerClock } from "@opg/ui";
import { Icon, Marker, PhaseEnter, PhoneScreen, phoneRoomCode, PhoneStrip, Timer } from "@opg/ui";
import { format, useLocale } from "@opg/i18n";
import type { Dictionary } from "@opg/i18n";
import type { DoodleAction, DoodleHostView, DoodlePhase, DoodlePlayerView } from "../state";
import { ControlsLevelProvider } from "./common";
import { HostGallery } from "./HostGallery";
import { PhoneDraw } from "./PhoneDraw";
import { PhoneReveal } from "./PhoneReveal";
import { isStagedPhase, PhoneStage } from "./PhoneStage";
import { PhoneTitle } from "./PhoneTitle";
import { PhoneVote } from "./PhoneVote";

export interface PhoneProps {
  view: DoodlePlayerView;
  room: PlayerRoomView;
  deadline: number | null;
  timerStartedAt: number | null;
  clock: ServerClock;
  send: (action: DoodleAction) => void;
  /** The host view, in a no-TV room only; null in a room with a shared screen. */
  stage: DoodleHostView | null;
}

function progressFor(t: Dictionary, view: DoodlePlayerView): string {
  if (view.phase === "draw") return t.doodleBluff.progressDraw;
  if (view.phase === "gallery") return t.doodleBluff.progressGallery;
  return format(t.doodleBluff.progressRound, { round: view.roundNumber, count: view.roundCount });
}

function LookUp() {
  const { t } = useLocale();
  return (
    <div style={{ flexGrow: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, textAlign: "center" }}>
      <Icon name="monitor" size={48} color="var(--opg-ink-secondary)" />
      <Marker size={30} level={1}>{t.doodleBluff.lookUp}</Marker>
      <div style={{ fontSize: 18, fontWeight: 700, color: "var(--opg-ink-secondary)" }}>{t.doodleBluff.galleryOnTv}</div>
    </div>
  );
}

function GalleryPhase({ stage, clock, players }: { stage: DoodleHostView | null; clock: ServerClock; players: PlayerRoomView["players"] }) {
  if (stage === null) return <LookUp />;
  return <HostGallery entries={stage.gallery ?? []} players={players} clock={clock} />;
}

function controlsFor(props: PhoneProps): ReactNode {
  const { view, room, clock, send } = props;
  if (view.phase === "draw") return <PhoneDraw view={view} roomCode={room.code} clock={clock} send={send} />;
  if (view.phase === "title") return <PhoneTitle view={view} clock={clock} send={send} />;
  return <PhoneVote view={view} clock={clock} send={send} />;
}

/** In a no-TV room the phone carries the stage above its own controls; in a room with a shared
 * screen `stage` is null and this is the controls alone, unchanged. */
function StagedPhase(props: PhoneProps & { phase: "draw" | "title" | "vote" }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, flexGrow: 1, minHeight: 0 }}>
      <PhoneStage phase={props.phase} stage={props.stage} players={props.room.players} />
      <ControlsLevelProvider value={props.stage === null ? 1 : 2}>{controlsFor(props)}</ControlsLevelProvider>
    </div>
  );
}

function renderPhase(props: PhoneProps): ReactNode {
  const { view, room, deadline, timerStartedAt, clock, stage } = props;
  const players = room.players;
  if (isStagedPhase(view.phase)) return <StagedPhase {...props} phase={view.phase} />;
  if (view.phase === "reveal") {
    return <PhoneReveal view={view} players={players} me={room.you} deadline={deadline} timerStartedAt={timerStartedAt} clock={clock} stage={stage} />;
  }
  return <GalleryPhase stage={stage} clock={clock} players={players} />;
}

/** The phases where the clock is the player's own: drawing, writing a title, voting. Each ends
 * on a deadline that throws away whatever wasn't sent, and in a no-TV room this strip is the
 * only clock anybody in the room can see. The reveal and the gallery run themselves, so their
 * strip stays quiet. */
function timedPhase(phase: DoodlePhase): boolean {
  return phase === "draw" || phase === "title" || phase === "vote";
}

function Strip({ view, deadline, timerStartedAt, clock }: Omit<PhoneProps, "room" | "send" | "stage">) {
  const { t } = useLocale();
  const timed = timedPhase(view.phase);
  return (
    <PhoneStrip
      gameName={t.doodleBluff.title}
      progress={progressFor(t, view)}
      right={timed ? <Timer deadline={deadline} clock={clock} startedAt={timerStartedAt} haptics /> : undefined}
    />
  );
}

export function Phone(props: PhoneProps) {
  return (
    <PhoneScreen roomCode={phoneRoomCode(props.room)}>
      <Strip view={props.view} deadline={props.deadline} timerStartedAt={props.timerStartedAt} clock={props.clock} />
      <PhaseEnter phaseKey={`${props.view.roundNumber}:${props.view.phase}`}>{renderPhase(props)}</PhaseEnter>
    </PhoneScreen>
  );
}
