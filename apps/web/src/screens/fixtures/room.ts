// Deterministic room-view fixtures shared by the web app tests.
import type {
  GameResultSummary,
  GameSummary,
  HostRoomView,
  PackSummary,
  PlayerRoomView,
  PlayerSummary,
  RoomViewBase,
} from "@opg/protocol";

export function makePlayer(patch: Partial<PlayerSummary> = {}): PlayerSummary {
  return {
    id: "p1",
    name: "Priya",
    avatar: "drop",
    connected: true,
    isVip: false,
    crowns: 0,
    waitingForNextGame: false,
    ...patch,
  };
}

export function makeGame(patch: Partial<GameSummary> = {}): GameSummary {
  return {
    id: "imposter",
    name: "Imposter",
    blurb: "One of you has a decoy word.",
    minPlayers: 3,
    maxPlayers: 8,
    minutes: 15,
    ...patch,
  };
}

export function makePack(patch: Partial<PackSummary> = {}): PackSummary {
  return {
    id: "animals",
    name: "Animals",
    rating: "family",
    enabled: true,
    itemCount: 12,
    ...patch,
  };
}

export function makeResult(
  patch: Partial<GameResultSummary> = {},
): GameResultSummary {
  return { gameId: "imposter", scores: {}, winnerIds: [], ...patch };
}

const BASE_VIEW: RoomViewBase = {
  code: "BKTZ",
  phase: "lobby",
  lobbyScreen: "join",
  players: [makePlayer()],
  vipId: "p1",
  locked: false,
  games: [makeGame()],
  selectedGameId: "imposter",
  packs: [makePack()],
  lastResult: null,
  game: null,
  serverNow: 1_700_000_000_000,
};

export function makeHostView(
  patch: Partial<HostRoomView> = {},
): HostRoomView {
  return { role: "host", ...BASE_VIEW, ...patch };
}

export function makePlayerView(
  patch: Partial<PlayerRoomView> = {},
): PlayerRoomView {
  return { role: "player", you: "p1", ...BASE_VIEW, ...patch };
}