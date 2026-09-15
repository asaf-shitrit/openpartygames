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
  return {
    gameId: "imposter",
    scores: {},
    winnerIds: [],
    completed: true,
    finishedAt: 0,
    awards: [],
    ...patch,
  };
}

/** A completed game with three awards, ready for the finale ceremony. */
export function makeResultWithAwards(
  patch: Partial<GameResultSummary> = {},
): GameResultSummary {
  return makeResult({
    finishedAt: 1_700_000_000_000,
    scores: { p1: 10, p2: 30, p3: 20 },
    winnerIds: ["p2"],
    awards: [
      { id: "word-thief", playerIds: ["p1"], value: 2 },
      { id: "master-of-disguise", playerIds: ["p2"], value: 1 },
      { id: "sharpest-eye", playerIds: ["p3"], value: 3 },
    ],
    ...patch,
  });
}

/** A completed game where two players tie for the crown. */
export function makeTiedResult(
  patch: Partial<GameResultSummary> = {},
): GameResultSummary {
  return makeResult({
    finishedAt: 1_700_000_000_000,
    scores: { p1: 20, p2: 20, p3: 5 },
    winnerIds: ["p1", "p2"],
    ...patch,
  });
}

/** The VIP ended the game early, or too few players were left. No crown, no awards. */
export function makeEndedEarlyResult(
  patch: Partial<GameResultSummary> = {},
): GameResultSummary {
  return makeResult({
    finishedAt: 1_700_000_000_000,
    completed: false,
    scores: { p1: 6, p2: 2 },
    winnerIds: [],
    awards: [],
    ...patch,
  });
}

/** A result saved before `finishedAt` existed: always settled, straight to the scoreboard. */
export function makeOldSaveResult(
  patch: Partial<GameResultSummary> = {},
): GameResultSummary {
  return makeResult({
    finishedAt: 0,
    scores: { p1: 12, p2: 4, p3: 7 },
    winnerIds: ["p1"],
    ...patch,
  });
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