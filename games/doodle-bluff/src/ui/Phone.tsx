// Phone screens for Doodle Bluff. Renders only the player's own view; the draw pad, title and
// vote forms, the reveal, and — in a no-TV room — the whole storyboard and gallery too.
import type { ReactNode } from "react";
import type { PlayerRoomView } from "@opg/protocol";
import type { ServerClock } from "@opg/ui";
import { Icon, Marker, PhaseEnter, PhoneScreen, PhoneStrip } from "@opg/ui";
import { format, useLocale } from "@opg/i18n";
import type { Dictionary } from "@opg/i18n";
import type { DoodleAction, DoodleHostView, DoodlePlayerView } from "../state";
import { HostGallery } from "./HostGallery";
import { PhoneDraw } from "./PhoneDraw";
import { PhoneReveal } from "./PhoneReveal";
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
      <Marker size={30}>{t.doodleBluff.lookUp}</Marker>
      <div style={{ fontSize: 18, fontWeight: 700, color: "var(--opg-ink-secondary)" }}>{t.doodleBluff.galleryOnTv}</div>
    </div>
  );
}

function GalleryPhase({ stage, clock, players }: { stage: DoodleHostView | null; clock: ServerClock; players: PlayerRoomView["players"] }) {
  if (stage === null) return <LookUp />;
  return <HostGallery entries={stage.gallery ?? []} players={players} clock={clock} />;
}

function renderPhase(props: PhoneProps): ReactNode {
  const { view, room, deadline, timerStartedAt, clock, send, stage } = props;
  const me = room.you;
  const players = room.players;
  if (view.phase === "draw") return <PhoneDraw view={view} roomCode={room.code} clock={clock} send={send} />;
  if (view.phase === "title") return <PhoneTitle view={view} clock={clock} send={send} />;
  if (view.phase === "vote") return <PhoneVote view={view} clock={clock} send={send} />;
  if (view.phase === "reveal") {
    return <PhoneReveal view={view} players={players} me={me} deadline={deadline} timerStartedAt={timerStartedAt} clock={clock} stage={stage} />;
  }
  return <GalleryPhase stage={stage} clock={clock} players={players} />;
}

function Strip({ view }: { view: DoodlePlayerView }) {
  const { t } = useLocale();
  return <PhoneStrip gameName={t.doodleBluff.title} progress={progressFor(t, view)} />;
}

export function Phone(props: PhoneProps) {
  return (
    <PhoneScreen>
      <Strip view={props.view} />
      <PhaseEnter phaseKey={`${props.view.roundNumber}:${props.view.phase}`}>{renderPhase(props)}</PhaseEnter>
    </PhoneScreen>
  );
}
