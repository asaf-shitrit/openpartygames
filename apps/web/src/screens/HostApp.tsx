// /host/<CODE> — the TV stage. Chooses a screen from phase/lobbyScreen.
import { useEffect, useMemo, useRef } from "react";
import type { HostRoomView, RoomPhase, RoomView } from "@opg/protocol";
import {
  Card,
  Marker,
  PhaseEnter,
  Stage,
  TvHeader,
  playFx,
  useCue,
  useMusic,
  useReducedMotion,
  useScreenWakeLock,
} from "@opg/ui";
import type { ServerClock } from "@opg/ui";
import { gameUiFor } from "../games";
import { Link } from "../router";
import { useRoomSocket } from "../useRoomSocket";
import type { RoomSocketError, RoomSocketStatus } from "../useRoomSocket";
import { screenKey } from "./screen-key";
import { screenMusic } from "./screen-music";
import { TvFinalScores } from "./TvFinalScores";
import { TvGamePicker } from "./TvGamePicker";
import { TvLobby } from "./TvLobby";
import { TvReconnecting } from "./TvReconnecting";
import { TvPage } from "./shared";

function MessageScreen({ title, body }: { title: string; body: string }) {
  return (
    <TvPage>
      <TvHeader variant="brand" />
      <div
        style={{
          flexGrow: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Card
          variant="L"
          tilt={-1}
          style={{
            padding: "60px 68px",
            display: "flex",
            flexDirection: "column",
            gap: 20,
            maxWidth: 1100,
          }}
        >
          <Marker size={76}>{title}</Marker>
          <div style={{ fontSize: 38, lineHeight: 1.35 }}>{body}</div>
          <Link to="/" style={{ fontSize: 30, fontWeight: 700 }}>
            Back to the start screen
          </Link>
        </Card>
      </div>
    </TvPage>
  );
}

function GameStage({
  view,
  gameView,
  deadline,
  timerStartedAt,
  clock,
}: {
  view: HostRoomView;
  gameView: unknown;
  deadline: number | null;
  timerStartedAt: number | null;
  clock: ServerClock;
}) {
  const Ui = gameUiFor(view.game?.id ?? view.selectedGameId);
  if (!Ui)
    return (
      <MessageScreen
        title="Game not found"
        body="This room picked a game this screen does not know how to show."
      />
    );
  return (
    <Ui.Host
      view={gameView}
      room={view}
      deadline={deadline}
      timerStartedAt={timerStartedAt}
      clock={clock}
    />
  );
}

function StartingScreen({ view }: { view: HostRoomView }) {
  const gameName =
    view.games.find((g) => g.id === view.selectedGameId)?.name ?? "the game";
  const reduced = useReducedMotion();
  const titleRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    playFx(titleRef.current, "tapeOn", reduced);
  }, [reduced]);
  return (
    <TvPage>
      <TvHeader variant="brand" />
      <div
        style={{
          flexGrow: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Card
          variant="L"
          tilt={-1}
          style={{
            padding: "60px 68px",
            display: "flex",
            flexDirection: "column",
            gap: 20,
            maxWidth: 1100,
          }}
        >
          <div ref={titleRef}>
            <Marker size={76}>{`Starting ${gameName}…`}</Marker>
          </div>
          <div style={{ fontSize: 38, lineHeight: 1.35 }}>
            Get ready. The first round is coming up.
          </div>
        </Card>
      </div>
    </TvPage>
  );
}

function LobbyStage({
  view,
  clock,
}: {
  view: HostRoomView;
  clock: ServerClock;
}) {
  if (view.lobbyScreen === "pick") {
    return <TvGamePicker view={view} />;
  }
  if (view.lobbyScreen === "results" && view.lastResult) {
    return <TvFinalScores view={view} clock={clock} />;
  }
  return <TvLobby view={view} />;
}

/** Plays the start stinger the moment the phase becomes "starting", never on mount. */
function useStartStinger(phase: RoomPhase): void {
  const cue = useCue();
  const previousRef = useRef(phase);
  useEffect(() => {
    const previous = previousRef.current;
    previousRef.current = phase;
    if (phase === "starting" && previous !== "starting") cue("jingle-start");
  }, [phase, cue]);
}

/** Plays a whoosh on every screen change after the first, keyed by the caller's `key`. */
function useScreenTransitionCue(key: string): void {
  const cue = useCue();
  const previousRef = useRef(key);
  useEffect(() => {
    const previous = previousRef.current;
    previousRef.current = key;
    if (previous !== key) cue("whoosh");
  }, [key, cue]);
}

function HostScreen({
  view,
  clock,
}: {
  view: HostRoomView;
  clock: ServerClock;
}) {
  if (view.phase !== "lobby") {
    if (!view.game) return <StartingScreen view={view} />;
    return (
      <GameStage
        view={view}
        gameView={view.game.view}
        deadline={view.game.deadline}
        timerStartedAt={view.game.timerStartedAt}
        clock={clock}
      />
    );
  }
  return <LobbyStage view={view} clock={clock} />;
}

function HostStage({
  view,
  clock,
}: {
  view: HostRoomView;
  clock: ServerClock;
}) {
  useMusic(screenMusic(view));
  useStartStinger(view.phase);
  const key = screenKey(view);
  useScreenTransitionCue(key);
  return (
    <PhaseEnter phaseKey={key}>
      <HostScreen view={view} clock={clock} />
    </PhaseEnter>
  );
}

function connectingBody(status: RoomSocketStatus): string {
  return status === "reconnecting"
    ? "Reconnecting to the room."
    : "Finding the room.";
}

/** True while a live view is on screen and the socket is reconnecting. */
function isReconnecting(
  status: RoomSocketStatus,
  view: HostRoomView | null,
): boolean {
  return status === "reconnecting" && view !== null;
}

function readHostToken(code: string): string | null {
  try {
    return localStorage.getItem(`opg:host:${code}`);
  } catch {
    return null;
  }
}

function hostViewOf(view: RoomView | null): HostRoomView | null {
  if (!view) return null;
  if (view.role !== "host") return null;
  return view;
}

/** A host screen only owns the room while its token is stored and still accepted. */
function ownsRoom(
  hostToken: string | null,
  error: RoomSocketError | null,
): boolean {
  if (!hostToken) return false;
  return error?.code !== "host-token-invalid";
}

export function HostApp({ code }: { code: string }) {
  const hostToken = useMemo(() => readHostToken(code), [code]);

  const socket = useRoomSocket({
    code,
    role: "host",
    hostToken,
    enabled: Boolean(hostToken),
  });
  const view = hostViewOf(socket.view);
  const clock = socket.clock;

  useScreenWakeLock(true);

  if (!ownsRoom(hostToken, socket.lastError)) {
    return (
      <Stage>
        <MessageScreen
          title="This room is hosted on another screen"
          body="Open this room on the screen that created it, or start a new room here."
        />
      </Stage>
    );
  }

  if (!view) {
    return (
      <Stage>
        <MessageScreen
          title="Connecting…"
          body={connectingBody(socket.status)}
        />
      </Stage>
    );
  }

  return (
    <Stage>
      <HostStage view={view} clock={clock} />
      {isReconnecting(socket.status, view) ? <TvReconnecting /> : null}
    </Stage>
  );
}
