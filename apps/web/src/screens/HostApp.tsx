// /host/<CODE> — the TV stage. Chooses a screen from phase/lobbyScreen.
import { useMemo } from "react";
import type { HostRoomView, RoomView } from "@opg/protocol";
import {
  Card,
  Marker,
  Stage,
  TvHeader,
  useScreenWakeLock,
  useServerClock,
} from "@opg/ui";
import type { ServerClock } from "@opg/ui";
import { gameUiFor } from "../games";
import { Link } from "../router";
import { useRoomSocket } from "../useRoomSocket";
import type { RoomSocketError, RoomSocketStatus } from "../useRoomSocket";
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
  clock,
}: {
  view: HostRoomView;
  gameView: unknown;
  deadline: number | null;
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
    <Ui.Host view={gameView} room={view} deadline={deadline} clock={clock} />
  );
}

function StartingScreen({ view }: { view: HostRoomView }) {
  const gameName =
    view.games.find((g) => g.id === view.selectedGameId)?.name ?? "the game";
  return (
    <MessageScreen
      title={`Starting ${gameName}…`}
      body="Get ready. The first round is coming up."
    />
  );
}

function LobbyStage({ view }: { view: HostRoomView }) {
  if (view.lobbyScreen === "pick") {
    return <TvGamePicker view={view} />;
  }
  if (view.lobbyScreen === "results" && view.lastResult) {
    return <TvFinalScores view={view} />;
  }
  return <TvLobby view={view} />;
}

function HostStage({
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
        clock={clock}
      />
    );
  }
  return <LobbyStage view={view} />;
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
  const clock = useServerClock(view?.serverNow ?? 0);

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
