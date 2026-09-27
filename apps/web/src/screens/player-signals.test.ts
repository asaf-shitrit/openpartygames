import { describe, expect, it } from "vitest";
import type { ErrorCode, PlayerRoomView } from "@opg/protocol";
import { makeGame, makePlayer, makePlayerView } from "./fixtures/room";
import { errorOutlived, readyPlayerCount, settledKeyOf } from "./player-signals";

/** A lobby with `count` connected players, against a game that needs three. */
function roomOf(count: number, patch: Partial<PlayerRoomView> = {}) {
  return makePlayerView({
    players: Array.from({ length: count }, (_, i) =>
      makePlayer({ id: `p${i + 1}`, name: `P${i + 1}` }),
    ),
    games: [makeGame({ minPlayers: 3 })],
    ...patch,
  });
}

describe("readyPlayerCount", () => {
  it("counts only the phones the room can deal into a game", () => {
    const view = makePlayerView({
      players: [
        makePlayer({ id: "p1" }),
        makePlayer({ id: "p2", connected: false }),
        makePlayer({ id: "p3", waitingForNextGame: true }),
      ],
    });
    expect(readyPlayerCount(view)).toBe(1);
  });
});

describe("errorOutlived", () => {
  const joinCodes: ErrorCode[] = [
    "room-not-found",
    "room-full",
    "room-locked",
    "name-taken",
    "name-invalid",
    "not-joined",
  ];

  it.each(joinCodes)("drops '%s' once this phone holds a seat", (code) => {
    expect(errorOutlived(code, roomOf(1))).toBe(true);
  });

  it("holds 'not enough players' until enough of them are here", () => {
    expect(errorOutlived("not-enough-players", roomOf(2))).toBe(false);
    expect(errorOutlived("not-enough-players", roomOf(3))).toBe(true);
  });

  it("holds 'players away' until the dead phones come back", () => {
    const away = makePlayerView({
      players: [
        makePlayer({ id: "p1" }),
        makePlayer({ id: "p2" }),
        makePlayer({ id: "p3", connected: false }),
      ],
      games: [makeGame({ minPlayers: 3 })],
    });
    expect(errorOutlived("players-away", away)).toBe(false);
  });

  it("falls back to the platform minimum when the game is unknown", () => {
    expect(
      errorOutlived("not-enough-players", roomOf(3, { selectedGameId: "gone" })),
    ).toBe(true);
    expect(
      errorOutlived("not-enough-players", roomOf(2, { selectedGameId: "gone" })),
    ).toBe(false);
  });

  it("drops 'game in progress' when the room is back in the lobby", () => {
    expect(errorOutlived("game-in-progress", roomOf(3))).toBe(true);
    expect(
      errorOutlived("game-in-progress", roomOf(3, { phase: "in-game" })),
    ).toBe(false);
  });

  it.each<ErrorCode>(["invalid-action", "no-language-packs", "start-failed"])(
    "drops '%s' once a game actually starts",
    (code) => {
      expect(errorOutlived(code, roomOf(3, { phase: "starting" }))).toBe(true);
      expect(errorOutlived(code, roomOf(3))).toBe(false);
    },
  );

  it("keeps a code no view can disprove", () => {
    expect(errorOutlived("rate-limited", roomOf(3))).toBe(false);
    expect(errorOutlived("avatar-taken", roomOf(3))).toBe(false);
  });
});

/** A game's player view as the games write it, plus the shape of one that does not. */
type FakeGameView = { phase: string; roundNumber?: number } | { totally: string };

function inGame(gameView: FakeGameView, timerStartedAt: number | null = 1_700) {
  return makePlayerView({
    phase: "in-game",
    game: {
      id: "imposter",
      view: gameView,
      stage: null,
      deadline: null,
      timerStartedAt,
    },
  });
}

describe("settledKeyOf", () => {
  it("changes when the game moves to another phase", () => {
    const clues = settledKeyOf(inGame({ phase: "clues" }), null);
    const vote = settledKeyOf(inGame({ phase: "vote" }), null);
    expect(clues).not.toBe(vote);
  });

  it("changes when the same phase comes round again", () => {
    const first = settledKeyOf(inGame({ phase: "vote", roundNumber: 1 }), null);
    const second = settledKeyOf(inGame({ phase: "vote", roundNumber: 2 }), null);
    expect(first).not.toBe(second);
  });

  it("holds steady while nothing about the round has changed", () => {
    const view = { phase: "clues", roundNumber: 1 };
    expect(settledKeyOf(inGame(view), null)).toBe(settledKeyOf(inGame(view), null));
  });

  it("changes when the server refuses the send, so nothing sticks disabled", () => {
    const quiet = settledKeyOf(inGame({ phase: "clues" }), null);
    const refused = settledKeyOf(inGame({ phase: "clues" }), "rate-limited");
    expect(quiet).not.toBe(refused);
  });

  it("falls back to the deadline when a game view names no phase", () => {
    const early = settledKeyOf(inGame({ totally: "unexpected" }, 1_700), null);
    const later = settledKeyOf(inGame({ totally: "unexpected" }, 9_900), null);
    expect(early).not.toBe(later);
  });

  it("falls back to the room's own phase with no game at all", () => {
    expect(settledKeyOf(makePlayerView(), null)).toContain("lobby");
  });
});
