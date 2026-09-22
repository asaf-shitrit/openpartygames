// /host/<CODE> — the TV stage. Chooses a screen from phase/lobbyScreen.
import { useEffect, useMemo, useRef } from "react";
import type { HostRoomView, RoomPhase, RoomView } from "@opg/protocol";
import { format, useLocale } from "@opg/i18n";
import type { Dictionary } from "@opg/i18n";
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

function MessageScreen({
  title,
  body,
  t,
}: {
  title: string;
  body: string;
  t: Dictionary;
}) {
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
            {t.status.backToStart}
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
  t,
}: {
  view: HostRoomView;
  gameView: unknown;
  deadline: number | null;
  timerStartedAt: number | null;
  clock: ServerClock;
  t: Dictionary;
}) {
  const Ui = gameUiFor(view.game?.id ?? view.selectedGameId);
  if (!Ui)
    return (
      <MessageScreen
        title={t.status.gameNotFoundTitle}
        body={t.status.gameNotFoundBody}
        t={t}
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

function StartingScreen({ view, t }: { view: HostRoomView; t: Dictionary }) {
  const gameName =
    view.games.find((g) => g.id === view.selectedGameId)?.name ??
    t.status.startingGameFallback;
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
            <Marker size={76}>
              {format(t.status.startingHeading, { game: gameName })}
            </Marker>
          </div>
          <div style={{ fontSize: 38, lineHeight: 1.35 }}>
            {t.status.startingBody}
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
  t,
}: {
  view: HostRoomView;
  clock: ServerClock;
  t: Dictionary;
}) {
  if (view.phase !== "lobby") {
    if (!view.game) return <StartingScreen view={view} t={t} />;
    return (
      <GameStage
        view={view}
        gameView={view.game.view}
        deadline={view.game.deadline}
        timerStartedAt={view.game.timerStartedAt}
        clock={clock}
        t={t}
      />
    );
  }
  return <LobbyStage view={view} clock={clock} />;
}

function HostStage({
  view,
  clock,
  t,
}: {
  view: HostRoomView;
  clock: ServerClock;
  t: Dictionary;
}) {
  useMusic(screenMusic(view));
  useStartStinger(view.phase);
  const key = screenKey(view);
  useScreenTransitionCue(key);
  return (
    <PhaseEnter phaseKey={key}>
      <HostScreen view={view} clock={clock} t={t} />
    </PhaseEnter>
  );
}

function connectingBody(status: RoomSocketStatus, t: Dictionary): string {
  return status === "reconnecting"
    ? t.status.connectingReconnecting
    : t.status.connectingFinding;
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
  const { t } = useLocale();
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
          title={t.status.otherHostTitle}
          body={t.status.otherHostBody}
          t={t}
        />
      </Stage>
    );
  }

  if (!view) {
    return (
      <Stage>
        <MessageScreen
          title={t.status.connectingTitle}
          body={connectingBody(socket.status, t)}
          t={t}
        />
      </Stage>
    );
  }

  return (
    <Stage>
      <HostStage view={view} clock={clock} t={t} />
      {isReconnecting(socket.status, view) ? <TvReconnecting /> : null}
    </Stage>
  );
}
