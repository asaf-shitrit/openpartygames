// /<CODE> — phone join flow, then the screen for the current phase.
import { useEffect, useRef, useState } from "react";
import type {
  ActiveGameView,
  AvatarId,
  ErrorCode,
  PlayerRoomView,
  PlayerSummary,
} from "@opg/protocol";
import type { ServerClock } from "@opg/ui";
import { PhaseEnter, useScreenWakeLock } from "@opg/ui";
import { useLocale } from "@opg/i18n";
import type { Dictionary } from "@opg/i18n";
import type { z } from "zod";
import { gameUiFor } from "../games";
import { VipGameBar } from "./VipGameBar";
import { takeJoin } from "../join-handoff";
import { navigate } from "../router";
import { useRoomGamePreload } from "../useGamePreload";
import { useRoomSocket } from "../useRoomSocket";
import { errorOutlived, settledKeyOf } from "./player-signals";
import type { RoomSocket, RoomSocketError, RoomSocketStatus } from "../useRoomSocket";
import { PhoneAvatarPicker } from "./PhoneAvatarPicker";
import { PhoneJoin } from "./PhoneJoin";
import { PhoneKicked } from "./PhoneKicked";
import { PhoneLobby } from "./PhoneLobby";
import { PhoneNextRoundBar } from "./PhoneNextRoundBar";
import { PhoneReconnecting, PhoneReconnectingBanner } from "./PhoneReconnecting";
import { PhoneResults } from "./PhoneResults";
import { PhoneStarting } from "./PhoneStarting";
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
 * Every code the server can send, in the player's own language. The seven `common` keys came
 * first; the eight `status` ones are the codes that used to fall through to `message` — server
 * prose, always English, which a Hebrew player could not read. The `satisfies` is the point of
 * the map: a code added to the protocol cannot reach a phone without copy of its own. `message`
 * is now only ever a debugging aid on the wire.
 */
function errorCopy(t: Dictionary) {
  return {
    "room-full": t.common.errorRoomFull,
    "room-locked": t.common.errorRoomLocked,
    "name-taken": t.common.errorNameTaken,
    "name-invalid": t.common.errorNameInvalid,
    "not-enough-players": t.common.errorNotEnoughPlayers,
    "players-away": t.status.errorPlayersAway,
    "start-failed": t.status.errorStartFailed,
    "invalid-action": t.common.errorInvalidAction,
    "no-language-packs": t.common.errorNoLanguagePacks,
    "room-not-found": t.status.errorRoomNotFound,
    "not-joined": t.status.errorNotJoined,
    "not-vip": t.status.errorNotVip,
    "avatar-taken": t.status.errorAvatarTaken,
    "game-in-progress": t.status.errorGameInProgress,
    "bad-message": t.status.errorBadMessage,
    "host-token-invalid": t.status.errorHostTokenInvalid,
    "rate-limited": t.status.errorRateLimited,
  } satisfies Record<ErrorCode, string>;
}

/** Drops the standing error the moment a view disproves it. */
function useOutlivedError(
  socket: RoomSocket,
  view: PlayerRoomView | null,
): void {
  const { lastError, clearError } = socket;
  useEffect(() => {
    if (!lastError || !view) return;
    if (errorOutlived(lastError.code, view)) clearError();
  }, [lastError, view, clearError]);
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
  return errorCopy(t)[error.code];
}

/** A phone with no view yet still owns a seat when it has a saved token or a join in flight. */
function showReconnect(
  socket: RoomSocket,
  hadToken: boolean,
  joinedName: string,
): boolean {
  if (socket.status !== "reconnecting") return false;
  return hadToken || joinedName.length > 0;
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
  showResults: boolean;
  onDonePicker: () => void;
  onChangeAvatar: () => void;
  onNextRound: () => void;
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

/**
 * The finale, and for the VIP the tap that ends it. The results and the VIP's picker used to
 * render as siblings: two phone columns, a document past 200dvh, and the Start button a whole
 * viewport below a screen that shows no scroll cue. The VIP who just played gets the ceremony
 * like everyone else, with the way on pinned to the bottom of it.
 */
function ResultsStage({
  view,
  clock,
  isVip,
  onNextRound,
}: {
  view: PlayerRoomView;
  clock: ServerClock;
  isVip: boolean;
  onNextRound: () => void;
}) {
  // One element, not two siblings. `PhoneResults` is a `PhoneScreen fit` — a full 100dvh box —
  // so a sibling can only ever sit on top of it; handing the bar to its `footer` slot puts it
  // inside the column, where it reserves its own space and the standings end above it.
  return (
    <PhoneResults
      view={view}
      clock={clock}
      footer={isVip ? <PhoneNextRoundBar onNextRound={onNextRound} /> : null}
    />
  );
}

/**
 * Whether the finale still owns the screen. It holds until the room moves on — or, for the VIP,
 * until they tap through to the picker, keyed by the result's own timestamp so the next game's
 * finale comes back on its own.
 */
function showsResults(
  view: PlayerRoomView,
  dismissedAt: number | null,
): boolean {
  const result = view.lastResult;
  if (view.lobbyScreen !== "results" || result === null) return false;
  return result.finishedAt !== dismissedAt;
}

function finishedAtOf(view: PlayerRoomView): number | null {
  return view.lastResult?.finishedAt ?? null;
}

function LobbyStage({
  view,
  socket,
  clock,
  error,
  showPicker,
  showResults,
  onDonePicker,
  onChangeAvatar,
  onNextRound,
}: LobbyStageProps) {
  // The ceremony comes first. Anyone who joined mid-game reaches the lobby with no doodle
  // picked, and the picker used to win this race — landing on top of the crown.
  if (showResults) {
    return (
      <ResultsStage
        view={view}
        clock={clock}
        isVip={view.you === view.vipId}
        onNextRound={onNextRound}
      />
    );
  }
  if (showPicker) {
    return (
      <PhoneAvatarPicker
        view={view}
        onPick={(avatar: AvatarId) => socket.send({ t: "set-avatar", avatar })}
        onDone={onDonePicker}
      />
    );
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
function vipBar(
  me: PlayerSummary | null,
  socket: RoomSocket,
  view: PlayerRoomView,
) {
  if (!me?.isVip) return null;
  return (
    <VipGameBar
      settledBy={settledKeyOf(view, socket.lastError?.code ?? null)}
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
      {vipBar(me, socket, view)}
    </>
  );
}

interface GameStageProps {
  view: PlayerRoomView;
  socket: RoomSocket;
  clock: ServerClock;
}

function GameStage({ view, socket, clock }: GameStageProps) {
  const me = findMe(view);
  // The one phone that really is sitting this one out: it joined after the deal.
  if (waitingForNextGame(me)) return <PhoneWaiting view={view} />;
  // `starting` carries no game payload for anyone, so every phone used to fall through to
  // "A game is already running. You'll join when the next one starts." — at the exact moment
  // their own game was starting, and with nothing on a TV to contradict it in a no-TV room.
  if (view.phase === "starting") return <PhoneStarting view={view} />;
  const game = activeGame(view);
  if (!game) return <PhoneWaiting view={view} />;
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

function PlayerStage(props: LobbyStageProps) {
  if (props.view.phase !== "lobby") {
    return (
      <GameStage view={props.view} socket={props.socket} clock={props.clock} />
    );
  }
  return <LobbyStage {...props} />;
}

/**
 * The top-level screen this phone is on right now, mirroring the branches `GameStage` and
 * `LobbyStage` pick between. Round-by-round detail inside a running game is not repeated here —
 * each game's own `Phone` component already keys its own `PhaseEnter` by round and phase — this
 * key only needs to change when the phone swaps to a different *screen* (waiting room, starting
 * card, a game, results, the avatar picker, the VIP controls, the plain lobby), the same move
 * `HostApp` already makes for the TV.
 */
/** The screen a phone shows once the room has left the lobby. */
function playingScreenKey(view: PlayerRoomView): string {
  const me = findMe(view);
  if (waitingForNextGame(me)) return "waiting";
  if (view.phase === "starting") return "starting";
  if (activeGame(view) === null) return "waiting";
  return `game:${view.game?.id ?? ""}`;
}

/** The screen a phone shows while the room is in the lobby. */
function lobbyScreenKey(
  view: PlayerRoomView,
  showPicker: boolean,
  showResults: boolean,
): string {
  if (showResults) return "results";
  if (showPicker) return "picker";
  if (view.you === view.vipId) return "vip";
  return "lobby";
}

function playerScreenKey(
  view: PlayerRoomView,
  showPicker: boolean,
  showResults: boolean,
): string {
  return view.phase === "lobby"
    ? lobbyScreenKey(view, showPicker, showResults)
    : playingScreenKey(view);
}

function ReconnectOverlay({ status }: { status: RoomSocketStatus }) {
  if (status !== "reconnecting") return null;
  return <PhoneReconnectingBanner />;
}

/**
 * The name the join form handed over for this room, joined with once the socket exists. A
 * player with a seat here already is reconnecting, so the stale hand-off is discarded.
 */
function useHandoffJoin(code: string, hadToken: boolean, socket: RoomSocket): string | null {
  const [name] = useState(() => {
    const handed = takeJoin(code);
    return hadToken ? null : handed;
  });
  const sent = useRef(false);
  useEffect(() => {
    if (name === null || sent.current) return;
    sent.current = true;
    socket.join(name);
  }, [name, socket]);
  return name;
}

export function PlayerApp({ code }: { code: string }) {
  const { t } = useLocale();
  const socket = useRoomSocket({ code, role: "player" });
  const view = playerViewFrom(socket);
  const clock = socket.clock;

  const playerId = playerIdFor(view, socket);
  const [hadToken] = useState(() => Boolean(playerToken(code)));
  const handoffName = useHandoffJoin(code, hadToken, socket);
  const [joinedName, setJoinedName] = useState(handoffName ?? "");
  const [joinRequested, setJoinRequested] = useState(handoffName !== null);
  const [pickerOverride, setPickerOverride] = useState<
    "open" | "closed" | null
  >(null);
  const [dismissedResultAt, setDismissedResultAt] = useState<number | null>(
    null,
  );

  const me = meFor(view);

  useRoomGamePreload(view);
  useScreenWakeLock(me !== null);
  useOutlivedError(socket, view);
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
    // A retry is a fresh attempt, so the complaint about the last one stops standing: the
    // button says "Joining…" instead of showing "That name is taken" over a join in flight.
    socket.clearError();
    setJoinedName(name);
    setJoinRequested(true);
    socket.join(name);
  };

  const kickedName = myName === "" ? undefined : myName;
  const reconnectName = myName === "" ? t.lobby.you : myName;

  if (socket.kicked) {
    return <PhoneKicked name={kickedName} avatar={myAvatar} />;
  }

  if (!view) {
    if (showReconnect(socket, hadToken, joinedName)) {
      return <PhoneReconnecting name={reconnectName} avatar={myAvatar} />;
    }
    return (
      <JoinStage
        code={code}
        busy={busyFor(joinRequested, socket.lastError)}
        error={error}
        onJoin={handleJoin}
      />
    );
  }

  // Once there is a view there is a screen worth keeping: the reconnect state rides above it
  // rather than replacing it, so a backgrounded tab costs nobody their half-typed answer.
  const showPicker = showPickerFor(playerId, code, pickerOverride);
  const showResults = showsResults(view, dismissedResultAt);
  return (
    <>
      <ReconnectOverlay status={socket.status} />
      <PhaseEnter phaseKey={playerScreenKey(view, showPicker, showResults)}>
        <PlayerStage
          view={view}
          socket={socket}
          clock={clock}
          error={error}
          showPicker={showPicker}
          showResults={showResults}
          onDonePicker={donePicker}
          onChangeAvatar={() => setPickerOverride("open")}
          onNextRound={() => setDismissedResultAt(finishedAtOf(view))}
        />
      </PhaseEnter>
    </>
  );
}
