// /<CODE> — phone join flow, then the screen for the current phase.
import { useState } from "react";
import type {
  ActiveGameView,
  AvatarId,
  ErrorCode,
  PlayerRoomView,
  PlayerSummary,
} from "@opg/protocol";
import type { ServerClock } from "@opg/ui";
import { useScreenWakeLock } from "@opg/ui";
import { useLocale } from "@opg/i18n";
import type { Dictionary } from "@opg/i18n";
import type { z } from "zod";
import { gameUiFor } from "../games";
import { VipGameBar } from "./VipGameBar";
import { navigate } from "../router";
import { useRoomSocket } from "../useRoomSocket";
import type { RoomSocket, RoomSocketError } from "../useRoomSocket";
import { PhoneAvatarPicker } from "./PhoneAvatarPicker";
import { PhoneJoin } from "./PhoneJoin";
import { PhoneKicked } from "./PhoneKicked";
import { PhoneLobby } from "./PhoneLobby";
import { PhoneReconnecting } from "./PhoneReconnecting";
import { PhoneResults } from "./PhoneResults";
import { PhoneVipControls } from "./PhoneVipControls";
import { PhoneWaiting } from "./PhoneWaiting";

function playerToken(code: string): string | null {
  try {
    return localStorage.getItem(`opg:player:${code}`);
  } catch {
    return null;
  }
}

function avatarPickedKey(code: string, playerId: string): string {
  return `opg:avatarPicked:${code}:${playerId}`;
}

function hasPickedAvatar(code: string, playerId: string): boolean {
  try {
    return sessionStorage.getItem(avatarPickedKey(code, playerId)) === "1";
  } catch {
    return false;
  }
}

function markAvatarPicked(code: string, playerId: string | null): void {
  if (!playerId) return;
  try {
    sessionStorage.setItem(avatarPickedKey(code, playerId), "1");
  } catch {
    /* storage unavailable; picker reappears next load */
  }
}

function readSavedName(): string {
  try {
    return sessionStorage.getItem("opg:name") ?? "";
  } catch {
    return "";
  }
}

/**
 * Every code the server can send has a client-owned, localized message here; `message`
 * (server prose, always English) is only a fallback for a code this map doesn't cover.
 */
function errorCopy(t: Dictionary): Map<ErrorCode, string> {
  return new Map([
    ["room-full", t.common.errorRoomFull],
    ["room-locked", t.common.errorRoomLocked],
    ["name-taken", t.common.errorNameTaken],
    ["name-invalid", t.common.errorNameInvalid],
    ["not-enough-players", t.common.errorNotEnoughPlayers],
    ["invalid-action", t.common.errorInvalidAction],
    ["no-language-packs", t.common.errorNoLanguagePacks],
  ]);
}

function errorText(t: Dictionary, code: ErrorCode, message: string): string {
  return errorCopy(t).get(code) ?? (message || t.common.errorGeneric);
}

function playerViewFrom(socket: RoomSocket): PlayerRoomView | null {
  const view = socket.view;
  if (!view) return null;
  if (view.role !== "player") return null;
  return view;
}

function playerIdFor(
  view: PlayerRoomView | null,
  socket: RoomSocket,
): string | null {
  if (view) return view.you;
  return socket.playerId;
}

function findMe(view: PlayerRoomView): PlayerSummary | null {
  return view.players.find((p) => p.id === view.you) ?? null;
}

function meFor(view: PlayerRoomView | null): PlayerSummary | null {
  if (!view) return null;
  return findMe(view);
}

function avatarFor(me: PlayerSummary | null): AvatarId | null {
  if (me) return me.avatar;
  return null;
}

function nameFor(me: PlayerSummary | null, fallback: string): string {
  if (me) return me.name;
  return fallback;
}

function busyFor(
  joinRequested: boolean,
  error: RoomSocketError | null,
): boolean {
  return joinRequested && !error;
}

function errorFor(t: Dictionary, error: RoomSocketError | null): string | null {
  if (!error) return null;
  return errorText(t, error.code, error.message);
}

function showReconnect(
  socket: RoomSocket,
  view: PlayerRoomView | null,
  hadToken: boolean,
  joinedName: string,
): boolean {
  if (socket.status !== "reconnecting") return false;
  return Boolean(view) || hadToken || joinedName.length > 0;
}

function showPickerFor(
  playerId: string | null,
  code: string,
  override: "open" | "closed" | null,
): boolean {
  if (!playerId) return false;
  if (override === "open") return true;
  if (override === "closed") return false;
  return !hasPickedAvatar(code, playerId);
}

interface JoinStageProps {
  code: string;
  busy: boolean;
  error: string | null;
  onJoin: (code: string, name: string) => void;
}

function JoinStage({ code, busy, error, onJoin }: JoinStageProps) {
  return (
    <PhoneJoin
      initialCode={code}
      initialName={readSavedName()}
      busy={busy}
      error={error}
      onJoin={onJoin}
    />
  );
}

interface LobbyStageProps {
  view: PlayerRoomView;
  socket: RoomSocket;
  clock: ServerClock;
  error: string | null;
  showPicker: boolean;
  onDonePicker: () => void;
  onChangeAvatar: () => void;
}

function VipControls({ view, socket, error }: {
  view: PlayerRoomView;
  socket: RoomSocket;
  error: string | null;
}) {
  return (
    <PhoneVipControls
      view={view}
      error={error}
      onPickGame={(gameId) => socket.send({ t: "pick-game", gameId })}
      onSetPack={(packId, enabled) =>
        socket.send({ t: "set-pack", packId, enabled })
      }
      onSetLocked={(locked) => socket.send({ t: "set-locked", locked })}
      onSetSharedScreen={(sharedScreen) =>
        socket.send({ t: "set-shared-screen", sharedScreen })
      }
      onKick={(playerIdToKick) =>
        socket.send({ t: "kick", playerId: playerIdToKick })
      }
      onStartGame={() => socket.send({ t: "start-game" })}
    />
  );
}

/** Results stay up until the VIP picks, toggles a pack or starts; the VIP keeps their controls above it. */
function ResultsStage({
  view,
  socket,
  clock,
  error,
}: {
  view: PlayerRoomView;
  socket: RoomSocket;
  clock: ServerClock;
  error: string | null;
}) {
  const isVip = view.you === view.vipId;
  return (
    <>
      <PhoneResults view={view} clock={clock} />
      {isVip ? <VipControls view={view} socket={socket} error={error} /> : null}
    </>
  );
}

function showsResults(view: PlayerRoomView): boolean {
  return view.lobbyScreen === "results" && view.lastResult !== null;
}

function LobbyStage({
  view,
  socket,
  clock,
  error,
  showPicker,
  onDonePicker,
  onChangeAvatar,
}: LobbyStageProps) {
  if (showPicker) {
    return (
      <PhoneAvatarPicker
        view={view}
        onPick={(avatar: AvatarId) => socket.send({ t: "set-avatar", avatar })}
        onDone={onDonePicker}
      />
    );
  }
  if (showsResults(view)) {
    return <ResultsStage view={view} socket={socket} clock={clock} error={error} />;
  }
  if (view.you === view.vipId) {
    return <VipControls view={view} socket={socket} error={error} />;
  }
  return (
    <PhoneLobby
      view={view}
      onChangeAvatar={onChangeAvatar}
      onLeave={() => navigate("/")}
    />
  );
}

/** The active game once the room has published a payload this phone can render. */
function activeGame(view: PlayerRoomView): ActiveGameView | null {
  const game = view.game;
  if (!game) return null;
  if (game.view === null) return null;
  return game;
}

function waitingForNextGame(me: PlayerSummary | null): boolean {
  if (!me) return false;
  return me.waitingForNextGame;
}

/** In-game controls only the VIP sees. */
function vipBar(me: PlayerSummary | null, socket: RoomSocket) {
  if (!me?.isVip) return null;
  return (
    <VipGameBar
      onSkip={() => socket.send({ t: "skip-phase" })}
      onEnd={() => socket.send({ t: "end-game" })}
    />
  );
}

interface RunningGameProps {
  view: PlayerRoomView;
  game: ActiveGameView;
  me: PlayerSummary | null;
  socket: RoomSocket;
  clock: ServerClock;
}

function RunningGame({ view, game, me, socket, clock }: RunningGameProps) {
  const Ui = gameUiFor(game.id);
  if (!Ui) return <PhoneWaiting view={view} />;
  return (
    <>
      <Ui.Phone
        view={game.view}
        room={view}
        deadline={game.deadline}
        timerStartedAt={game.timerStartedAt}
        clock={clock}
        send={(action: z.core.util.JSONType) =>
          socket.send({ t: "game-action", action })
        }
        stage={game.stage}
      />
      {vipBar(me, socket)}
    </>
  );
}

interface GameStageProps {
  view: PlayerRoomView;
  socket: RoomSocket;
  clock: ServerClock;
}

function GameStage({ view, socket, clock }: GameStageProps) {
  const game = activeGame(view);
  const me = findMe(view);
  if (!game || waitingForNextGame(me)) return <PhoneWaiting view={view} />;
  return (
    <RunningGame
      view={view}
      game={game}
      me={me}
      socket={socket}
      clock={clock}
    />
  );
}

export function PlayerApp({ code }: { code: string }) {
  const { t } = useLocale();
  const socket = useRoomSocket({ code, role: "player" });
  const view = playerViewFrom(socket);
  const clock = socket.clock;

  const playerId = playerIdFor(view, socket);
  const [joinedName, setJoinedName] = useState("");
  const [joinRequested, setJoinRequested] = useState(false);
  const [pickerOverride, setPickerOverride] = useState<
    "open" | "closed" | null
  >(null);
  const [hadToken] = useState(() => Boolean(playerToken(code)));

  const me = meFor(view);

  useScreenWakeLock(me !== null);
  const myAvatar = avatarFor(me);
  const myName = nameFor(me, joinedName);
  const error = errorFor(t, socket.lastError);

  const donePicker = () => {
    markAvatarPicked(code, playerId);
    setPickerOverride("closed");
  };

  const handleJoin = (joinCode: string, name: string) => {
    if (joinCode !== code) {
      navigate(`/${joinCode}`);
      return;
    }
    setJoinedName(name);
    setJoinRequested(true);
    socket.join(name);
  };

  const kickedName = myName === "" ? undefined : myName;
  const reconnectName = myName === "" ? t.lobby.you : myName;

  if (socket.kicked) {
    return <PhoneKicked name={kickedName} avatar={myAvatar} />;
  }

  if (showReconnect(socket, view, hadToken, joinedName)) {
    return <PhoneReconnecting name={reconnectName} avatar={myAvatar} />;
  }

  if (!view) {
    return (
      <JoinStage
        code={code}
        busy={busyFor(joinRequested, socket.lastError)}
        error={error}
        onJoin={handleJoin}
      />
    );
  }

  if (view.phase !== "lobby") {
    return <GameStage view={view} socket={socket} clock={clock} />;
  }

  return (
    <LobbyStage
      view={view}
      socket={socket}
      clock={clock}
      error={error}
      showPicker={showPickerFor(playerId, code, pickerOverride)}
      onDonePicker={donePicker}
      onChangeAvatar={() => setPickerOverride("open")}
    />
  );
}
