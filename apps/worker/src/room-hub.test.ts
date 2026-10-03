import { describe, expect, it, vi } from "vitest";
import type { ServerMessage } from "@opg/protocol";
import { START_TIMEOUT_MS, type RoomSnapshot } from "@opg/sdk";
import {
  accept,
  connectHost,
  connectedIn,
  disconnect,
  FakeSocket,
  joinPlayer,
  makeHub,
  send,
  storedRoom,
  welcomedPlayerId,
  welcomedToken,
  type HubHarness,
} from "./fixtures/hub";
import { BURST, REFILL_PER_SECOND } from "./message-budget";
import { IDLE_MS, RECONNECT_GRACE_MS, type OpenedSocket } from "./room-hub";
import { WORD_CHECK_MS } from "@opg/game-imposter/views";
import { VIP_GRACE_MS } from "@opg/sdk";

interface Lobby extends HubHarness {
  host: FakeSocket;
  ada: FakeSocket;
  bo: FakeSocket;
  cy: FakeSocket;
}

/** A room with the host connected and three players joined; Ada is the VIP. */
async function makeLobby(): Promise<Lobby> {
  const harness = makeHub();
  await harness.hub.init("BCDF", "host-token");
  const host = await connectHost(harness);
  const ada = await joinPlayer(harness, "Ada");
  const bo = await joinPlayer(harness, "Bo");
  const cy = await joinPlayer(harness, "Cy");
  return { ...harness, host, ada, bo, cy };
}

function openedSocket(): OpenedSocket {
  return {
    response: new Response("upgraded", { status: 200 }),
    socket: new FakeSocket(),
  };
}

/** The snapshot as it stands while the content load is still outstanding. */
async function snapshotMidStart(lobby: Lobby): Promise<RoomSnapshot> {
  let captured: RoomSnapshot | undefined;
  lobby.content.onLoad = (): void => {
    captured = lobby.storage.stored;
  };
  await send(lobby.hub, lobby.ada, { t: "start-game" });
  if (!captured) throw new Error("the content load never ran");
  expect(storedRoom(captured)?.phase).toBe("starting");
  return captured;
}

/** The "that game could not start" notices one socket was sent. */
function startFailures(socket: FakeSocket): ServerMessage[] {
  return socket.sent.filter(
    (m) => m.t === "error" && m.code === "start-failed",
  );
}

describe("RoomHub.init", () => {
  it("creates a room, persists the snapshot and arms the idle alarm", async () => {
    const { hub, storage, clock } = makeHub();
    expect(await hub.init("BCDF", "host-token")).toBe(true);

    expect(hub.info()).toEqual({
      code: "BCDF",
      exists: true,
      locked: false,
      inGame: false,
      playerCount: 0,
      joinable: true,
    });
    expect(storedRoom(storage.stored)?.code).toBe("BCDF");
    expect(storage.alarms).toEqual([clock.now() + IDLE_MS]);
  });

  it("refuses a second init while the room is still active", async () => {
    const { hub, clock } = makeHub();
    await hub.init("BCDF", "host-token");

    expect(await hub.init("BCDF", "other-token")).toBe(false);

    clock.advance(IDLE_MS + 1);
    expect(await hub.init("BCDF", "other-token")).toBe(true);
  });

  it("still opens the room when the pack catalog cannot be loaded", async () => {
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const harness = makeHub();
    harness.content.catalogFails = true;

    expect(await harness.hub.init("BCDF", "host-token")).toBe(true);
    const host = await connectHost(harness);
    expect(host.lastHostView()?.packs).toEqual([]);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});

describe("RoomHub sockets", () => {
  it("accepts a socket as anonymous", async () => {
    const harness = makeHub();
    await harness.hub.init("BCDF", "host-token");

    const socket = accept(harness);

    expect(socket.caller()).toEqual({ kind: "anonymous" });
    expect(harness.sockets.all()).toEqual([socket]);
  });

  it("answers an upgrade for its own code and 404s anything else", async () => {
    const { hub } = makeHub();
    await hub.init("BCDF", "host-token");
    const opened = openedSocket();

    expect(hub.upgrade("https://party.test/ws/bcdf", () => opened)).toBe(
      opened.response,
    );
    expect(opened.socket.caller()).toEqual({ kind: "anonymous" });
    expect(hub.accepts("BCDF")).toBe(true);

    expect(hub.upgrade("https://party.test/ws/GHJK", openedSocket).status).toBe(
      404,
    );
    expect(hub.upgrade("definitely-not-a-url", openedSocket).status).toBe(404);
    expect(hub.accepts("GHJK")).toBe(false);
  });

  it("promotes the caller to host on a valid host-hello only", async () => {
    const harness = makeHub();
    await harness.hub.init("BCDF", "host-token");
    const host = accept(harness);

    await send(harness.hub, host, { t: "host-hello", hostToken: "wrong" });
    expect(host.welcome()).toBeUndefined();
    expect(host.caller()).toEqual({ kind: "anonymous" });

    await send(harness.hub, host, { t: "host-hello", hostToken: "host-token" });
    expect(host.welcome()).toEqual({ t: "welcome", role: "host" });
    expect(host.caller()).toEqual({ kind: "host" });
  });

  it("promotes a joining player's socket to its new player id", async () => {
    const harness = makeHub();
    await harness.hub.init("BCDF", "host-token");
    const player = accept(harness);

    await send(harness.hub, player, { t: "join", name: "Ada" });

    const playerId = welcomedPlayerId(player);
    expect(playerId).not.toBeNull();
    expect(player.caller()).toEqual({ kind: "player", playerId });
    expect(player.lastPlayerView()?.you).toBe(playerId);
  });

  it("reconnects a known token to the same seat and socket caller", async () => {
    const lobby = await makeLobby();
    const adaId = welcomedPlayerId(lobby.ada);
    const token = welcomedToken(lobby.ada) ?? "";

    const second = accept(lobby);
    await send(lobby.hub, second, { t: "join", name: "Ada", token });

    expect(welcomedPlayerId(second)).toBe(adaId);
    expect(second.caller()).toEqual({ kind: "player", playerId: adaId });
  });
});

describe("RoomHub.message", () => {
  it("answers a malformed frame with bad-message", async () => {
    const harness = makeHub();
    await harness.hub.init("BCDF", "host-token");
    const socket = accept(harness);

    await harness.hub.message(socket, "{not json");

    expect(socket.sent).toContainEqual({
      t: "error",
      code: "bad-message",
      message: "Malformed message.",
    });
  });

  it("answers room-not-found when the room is gone", async () => {
    const harness = makeHub();
    const socket = accept(harness);

    await send(harness.hub, socket, {
      t: "host-hello",
      hostToken: "host-token",
    });

    expect(socket.sent).toContainEqual({
      t: "error",
      code: "room-not-found",
      message: "This room is gone.",
    });
  });

  it("sends each socket its own view and nothing to anonymous sockets", async () => {
    const lobby = await makeLobby();
    const adaId = welcomedPlayerId(lobby.ada);
    const boId = welcomedPlayerId(lobby.bo);
    const stranger = accept(lobby);
    lobby.ada.clearSent();
    lobby.bo.clearSent();
    stranger.clearSent();
    lobby.host.clearSent();

    await send(lobby.hub, lobby.bo, { t: "set-avatar", avatar: "cat" });

    expect(lobby.ada.lastPlayerView()?.you).toBe(adaId);
    expect(lobby.bo.lastPlayerView()?.you).toBe(boId);
    expect(lobby.bo.lastPlayerView()?.players).toHaveLength(3);
    expect(lobby.host.lastHostView()?.role).toBe("host");
    expect(lobby.host.lastHostView()?.players).toHaveLength(3);
    expect(stranger.sent).toEqual([]);
  });

  it("kicks a player: the phone is told and its socket is closed", async () => {
    const lobby = await makeLobby();
    const cyId = welcomedPlayerId(lobby.cy);

    await send(lobby.hub, lobby.ada, { t: "kick", playerId: cyId ?? "" });

    expect(lobby.cy.wasKicked()).toBe(true);
    expect(lobby.cy.closed).toEqual({ code: 1000, reason: "kicked" });
    expect(lobby.host.lastHostView()?.players).toHaveLength(2);
  });
});

describe("RoomHub.close", () => {
  it("keeps a player connected while another socket carries the same caller", async () => {
    const lobby = await makeLobby();
    const adaId = welcomedPlayerId(lobby.ada) ?? "";
    const token = welcomedToken(lobby.ada) ?? "";
    const second = accept(lobby);
    await send(lobby.hub, second, { t: "join", name: "Ada", token });

    await disconnect(lobby, lobby.ada);

    expect(connectedIn(lobby.host.lastHostView(), adaId)).toBe(true);

    await disconnect(lobby, second);
    expect(connectedIn(lobby.host.lastHostView(), adaId)).toBe(false);
  });

  it("ignores anonymous sockets", async () => {
    const lobby = await makeLobby();
    lobby.host.clearSent();

    await disconnect(lobby, accept(lobby));

    expect(lobby.host.sent).toEqual([]);
  });

  it("disconnects the host once its last socket goes, so the room can go idle", async () => {
    const lobby = await makeLobby();
    await disconnect(lobby, lobby.ada);
    await disconnect(lobby, lobby.bo);
    await disconnect(lobby, lobby.cy);
    await disconnect(lobby, lobby.host);

    lobby.clock.advance(IDLE_MS + 1);
    await lobby.hub.alarm();

    expect(lobby.storage.deletions).toBe(1);
  });
  it("persists the host leaving, so a restarted room can still go idle", async () => {
    const lobby = await makeLobby();
    await disconnect(lobby, lobby.ada);
    await disconnect(lobby, lobby.bo);
    await disconnect(lobby, lobby.cy);
    await disconnect(lobby, lobby.host);

    const stored = storedRoom(lobby.storage.stored);
    expect(stored?.hostConnected).toBe(false);
    expect(stored?.emptySince).not.toBeNull();
  });
});

describe("RoomHub effects", () => {
  it("starts the game once load-content succeeds", async () => {
    const lobby = await makeLobby();

    await send(lobby.hub, lobby.ada, { t: "start-game" });

    expect(lobby.content.loadCalls).toBe(1);
    expect(lobby.host.lastHostView()?.phase).toBe("in-game");
    expect(lobby.ada.lastPlayerView()?.phase).toBe("in-game");
  });

  it("aborts the start when load-content fails", async () => {
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const lobby = await makeLobby();
    lobby.content.contentFails = true;

    await send(lobby.hub, lobby.ada, { t: "start-game" });

    expect(lobby.content.loadCalls).toBe(1);
    expect(lobby.host.lastHostView()?.phase).toBe("lobby");
    expect(storedRoom(lobby.storage.stored)?.phase).toBe("lobby");
    error.mockRestore();
  });

  it("records match stats when the game finishes", async () => {
    const lobby = await makeLobby();
    await send(lobby.hub, lobby.ada, { t: "start-game" });
    lobby.clock.advance(90_000);

    await send(lobby.hub, lobby.ada, { t: "end-game" });

    expect(lobby.stats.recorded).toEqual([
      {
        gameId: "imposter",
        playerCount: 3,
        durationMs: 90_000,
        completed: false,
        finishedAt: lobby.clock.now(),
      },
    ]);
  });

  it("keeps playing when the stats recorder fails", async () => {
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const lobby = await makeLobby();
    await send(lobby.hub, lobby.ada, { t: "start-game" });
    lobby.stats.fails = true;

    await send(lobby.hub, lobby.ada, { t: "end-game" });

    expect(lobby.stats.recorded).toEqual([]);
    expect(lobby.host.lastHostView()?.phase).toBe("lobby");
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});

describe("RoomHub broadcast gating", () => {
  it("sends no state frames when a game action is rejected", async () => {
    const lobby = await makeLobby();
    const cyId = welcomedPlayerId(lobby.cy) ?? "";
    lobby.host.clearSent();
    lobby.ada.clearSent();
    lobby.bo.clearSent();
    lobby.cy.clearSent();

    // Only the VIP (Ada) may kick; Bo's attempt is rejected and changes nothing.
    await send(lobby.hub, lobby.bo, { t: "kick", playerId: cyId });

    expect(lobby.bo.sent).toEqual([
      {
        t: "error",
        code: "not-vip",
        message: "Only the room leader can do that.",
      },
    ]);
    expect(lobby.host.sent).toEqual([]);
    expect(lobby.ada.sent).toEqual([]);
    expect(lobby.cy.sent).toEqual([]);
  });

  it("sends no state frames when an action is a no-op", async () => {
    const lobby = await makeLobby();
    await send(lobby.hub, lobby.bo, { t: "set-avatar", avatar: "cat" });
    lobby.host.clearSent();
    lobby.ada.clearSent();
    lobby.bo.clearSent();
    lobby.cy.clearSent();

    // Setting the same avatar again changes nothing.
    await send(lobby.hub, lobby.bo, { t: "set-avatar", avatar: "cat" });

    expect(lobby.bo.sent).toEqual([]);
    expect(lobby.host.sent).toEqual([]);
    expect(lobby.ada.sent).toEqual([]);
    expect(lobby.cy.sent).toEqual([]);
  });

  it("still broadcasts to every socket when an action changes the room", async () => {
    const lobby = await makeLobby();
    lobby.host.clearSent();
    lobby.ada.clearSent();
    lobby.cy.clearSent();

    await send(lobby.hub, lobby.bo, { t: "set-avatar", avatar: "cat" });

    expect(lobby.host.lastHostView()).toBeDefined();
    expect(lobby.ada.lastPlayerView()).toBeDefined();
    expect(lobby.cy.lastPlayerView()).toBeDefined();
  });

  it("gives a reconnecting host-hello only its own view when nothing changed", async () => {
    const lobby = await makeLobby();
    lobby.ada.clearSent();
    lobby.bo.clearSent();
    lobby.cy.clearSent();
    lobby.host.clearSent();

    await send(lobby.hub, lobby.host, {
      t: "host-hello",
      hostToken: "host-token",
    });

    expect(lobby.host.welcome()).toEqual({ t: "welcome", role: "host" });
    expect(lobby.host.lastHostView()).toBeDefined();
    expect(lobby.ada.sent).toEqual([]);
    expect(lobby.bo.sent).toEqual([]);
    expect(lobby.cy.sent).toEqual([]);
  });

  it("gives a second-tab player rejoin only its own view when nothing changed", async () => {
    const lobby = await makeLobby();
    const token = welcomedToken(lobby.ada) ?? "";
    lobby.host.clearSent();
    lobby.ada.clearSent();
    lobby.bo.clearSent();
    lobby.cy.clearSent();

    const second = accept(lobby);
    await send(lobby.hub, second, { t: "join", name: "Ada", token });

    expect(welcomedPlayerId(second)).not.toBeNull();
    expect(second.lastPlayerView()).toBeDefined();
    expect(lobby.host.sent).toEqual([]);
    expect(lobby.ada.sent).toEqual([]);
    expect(lobby.bo.sent).toEqual([]);
    expect(lobby.cy.sent).toEqual([]);
  });

  it("sends nothing on an alarm tick that changes nothing", async () => {
    const lobby = await makeLobby();
    lobby.host.clearSent();
    lobby.ada.clearSent();
    lobby.bo.clearSent();
    lobby.cy.clearSent();
    lobby.clock.advance(1000);

    await lobby.hub.alarm();

    expect(lobby.host.sent).toEqual([]);
    expect(lobby.ada.sent).toEqual([]);
    expect(lobby.bo.sent).toEqual([]);
    expect(lobby.cy.sent).toEqual([]);
  });
});

describe("RoomHub.alarm", () => {
  it("re-arms the alarm for a room that is still playing", async () => {
    const lobby = await makeLobby();
    lobby.clock.advance(1000);

    await lobby.hub.alarm();

    expect(lobby.storage.deletions).toBe(0);
    expect(lobby.storage.stored).toBeDefined();
    expect(lobby.storage.alarms.length).toBeGreaterThan(1);
  });

  it("closes leftover sockets and deletes storage once the room is idle", async () => {
    const lobby = await makeLobby();
    const stranger = accept(lobby);
    await disconnect(lobby, lobby.ada);
    await disconnect(lobby, lobby.bo);
    await disconnect(lobby, lobby.cy);
    await disconnect(lobby, lobby.host);
    lobby.clock.advance(IDLE_MS + 1);

    await lobby.hub.alarm();

    expect(lobby.storage.deletions).toBe(1);
    expect(lobby.storage.stored).toBeUndefined();
    expect(stranger.closed).toEqual({ code: 1000, reason: "idle" });
  });
});

/**
 * A deploy restarts every Durable Object. If it lands between the snapshot that says
 * "starting" and the content arriving, the load is gone and nothing in the room's own
 * state can finish or cancel the start, so the hub has to pick it up on the way back.
 */
describe("RoomHub interrupted start", () => {
  it("books the wake-up before it waits on the content", async () => {
    const lobby = await makeLobby();
    let armed: number | undefined;
    lobby.content.onLoad = (): void => {
      armed = lobby.storage.alarms.at(-1);
    };

    await send(lobby.hub, lobby.ada, { t: "start-game" });

    expect(armed).toBe(lobby.clock.now() + START_TIMEOUT_MS);
  });

  it("finishes a start the restart interrupted", async () => {
    const midStart = await snapshotMidStart(await makeLobby());
    const restored = makeHub(midStart);

    await restored.hub.alarm();

    expect(restored.content.loadCalls).toBe(1);
    expect(storedRoom(restored.storage.stored)?.phase).toBe("in-game");
  });

  it("resumes only once, however many events wake the room", async () => {
    const midStart = await snapshotMidStart(await makeLobby());
    const restored = makeHub(midStart);
    const socket = accept(restored);

    await send(restored.hub, socket, { t: "join", name: "Di" });
    await restored.hub.alarm();

    expect(restored.content.loadCalls).toBe(1);
  });

  it("returns a room whose start outlived its window to the lobby", async () => {
    const midStart = await snapshotMidStart(await makeLobby());
    const restored = makeHub(midStart);
    restored.clock.advance(START_TIMEOUT_MS + 1);

    await restored.hub.alarm();

    expect(restored.content.loadCalls).toBe(0);
    expect(storedRoom(restored.storage.stored)?.phase).toBe("lobby");
  });

  it("leaves a room that was never starting alone", async () => {
    const lobby = await makeLobby();
    const restored = makeHub(lobby.storage.stored);

    await restored.hub.alarm();

    expect(restored.content.loadCalls).toBe(0);
    expect(storedRoom(restored.storage.stored)?.phase).toBe("lobby");
  });

  it("tells the VIP, and nobody else, when the content fails to load", async () => {
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const lobby = await makeLobby();
    lobby.content.contentFails = true;

    await send(lobby.hub, lobby.ada, { t: "start-game" });

    expect(startFailures(lobby.ada)).toHaveLength(1);
    expect(startFailures(lobby.bo)).toHaveLength(0);
    expect(startFailures(lobby.host)).toHaveLength(0);
    error.mockRestore();
  });
});

describe("RoomHub restore", () => {
  it("restores a persisted snapshot instead of starting empty", async () => {
    const first = await makeLobby();
    const snapshot = first.storage.stored;
    expect(snapshot).toBeDefined();

    const restored = makeHub(snapshot);

    expect(restored.hub.info()).toEqual({
      code: "BCDF",
      exists: true,
      locked: false,
      inGame: false,
      playerCount: 3,
      joinable: true,
    });
    expect(restored.hub.accepts("BCDF")).toBe(true);
    expect(await restored.hub.init("BCDF", "host-token")).toBe(false);
  });
});

/** Who the persisted room says is connected, by player name. */
function connectedNames(harness: HubHarness): string[] {
  const players = storedRoom(harness.storage.stored)?.players ?? [];
  return players.filter((p) => p.connected).map((p) => p.name);
}

/** Past the grace a restored room gives phones to come back before it counts them gone. */
const PAST_GRACE_MS = RECONNECT_GRACE_MS + 1;

/** The Imposter phase the persisted room is in, or null when no game is running. */
function gamePhase(harness: HubHarness): string | null {
  return storedRoom(harness.storage.stored)?.game?.state.phase ?? null;
}

describe("RoomHub restore after a crash or deploy", () => {
  it("leaves every seat as saved until the grace is over", async () => {
    const lobby = await makeLobby();
    const restored = makeHub(lobby.storage.stored);

    await restored.hub.alarm();

    expect(connectedNames(restored)).toEqual(["Ada", "Bo", "Cy"]);
  });

  it("marks every seat offline once the grace is over, so the room can go idle", async () => {
    const lobby = await makeLobby();
    const restored = makeHub(lobby.storage.stored);
    restored.clock.advance(PAST_GRACE_MS);

    await restored.hub.alarm();

    expect(connectedNames(restored)).toEqual([]);
    expect(storedRoom(restored.storage.stored)?.hostConnected).toBe(false);
  });

  it("arms an alarm for the end of the grace", async () => {
    const lobby = await makeLobby();
    const restored = makeHub(lobby.storage.stored);
    const born = restored.clock.now();

    await restored.hub.alarm();

    expect(restored.storage.alarms.at(-1)).toBe(born + RECONNECT_GRACE_MS);
  });

  it("keeps the seats whose sockets survived hibernation", async () => {
    const lobby = await makeLobby();
    const restored = makeHub(lobby.storage.stored);
    const survivor = accept(restored);
    survivor.setCaller({ kind: "player", playerId: welcomedPlayerId(lobby.bo) ?? "" });
    const hostSocket = accept(restored);
    hostSocket.setCaller({ kind: "host" });
    restored.clock.advance(PAST_GRACE_MS);

    await restored.hub.alarm();

    expect(connectedNames(restored)).toEqual(["Bo"]);
    expect(storedRoom(restored.storage.stored)?.hostConnected).toBe(true);
  });

  it("hands the crown on when the VIP never came back", async () => {
    const lobby = await makeLobby();
    const restored = makeHub(lobby.storage.stored);
    const bo = accept(restored);
    bo.setCaller({ kind: "player", playerId: welcomedPlayerId(lobby.bo) ?? "" });
    restored.clock.advance(PAST_GRACE_MS);
    await restored.hub.alarm();
    expect(bo.lastPlayerView()?.vipId).toBe(welcomedPlayerId(lobby.ada));

    restored.clock.advance(VIP_GRACE_MS);
    await restored.hub.alarm();

    expect(bo.lastPlayerView()?.vipId).toBe(welcomedPlayerId(lobby.bo));
  });

  it("does not end an Imposter clue round when the first phone back wakes the room", async () => {
    const lobby = await makeLobby();
    await send(lobby.hub, lobby.ada, { t: "start-game" });
    lobby.clock.advance(WORD_CHECK_MS + 1);
    await lobby.hub.alarm();
    expect(gamePhase(lobby)).toBe("clues");
    const token = welcomedToken(lobby.bo) ?? "";

    const restored = makeHub(lobby.storage.stored);
    const phone = accept(restored);
    await send(restored.hub, phone, { t: "join", name: "Bo", token });

    expect(gamePhase(restored)).toBe("clues");
    expect(connectedNames(restored)).toEqual(["Ada", "Bo", "Cy"]);
  });
});

/** Error codes a socket has been sent, oldest first. */
function errorsIn(socket: FakeSocket): string[] {
  return socket.sent
    .filter((message) => message.t === "error")
    .map((message) => message.code);
}

/** Alternates a player's avatar `count` times: every frame is a real change to the room. */
async function flood(lobby: Lobby, count: number): Promise<void> {
  await Array.from({ length: count }).reduce(
    async (previous, _unused, index) => {
      await previous;
      await send(lobby.hub, lobby.ada, {
        t: "set-avatar",
        avatar: index % 2 === 0 ? "star" : "sun",
      });
    },
    Promise.resolve(),
  );
}

describe("RoomHub message budget", () => {
  it("lets ordinary play through untouched", async () => {
    const lobby = await makeLobby();
    const before = lobby.storage.writes;
    // Well inside the burst: a Doodle Bluff pad sends one frame per finished stroke, so this is
    // already busier than a fast drawer.
    await flood(lobby, 20);

    expect(lobby.storage.writes).toBe(before + 20);
    expect(errorsIn(lobby.ada)).toEqual([]);
  });

  it("stops a flood from writing and broadcasting once per frame", async () => {
    const lobby = await makeLobby();
    const before = lobby.storage.writes;
    const seenByBo = lobby.bo.sent.length;

    await flood(lobby, BURST + 200);

    // The budget, not the flood, decides how much work the room does.
    expect(lobby.storage.writes - before).toBeLessThanOrEqual(BURST);
    expect(lobby.bo.sent.length - seenByBo).toBeLessThanOrEqual(BURST);
    expect(errorsIn(lobby.ada)).toContain("rate-limited");
  });

  it("tells the sender once, not once per refused frame", async () => {
    const lobby = await makeLobby();
    await flood(lobby, BURST + 200);
    // A reply per refused frame would be its own amplification.
    expect(errorsIn(lobby.ada).filter((c) => c === "rate-limited")).toHaveLength(
      1,
    );
  });

  it("lets the socket play on once it has earned frames back", async () => {
    const lobby = await makeLobby();
    await flood(lobby, BURST + 50);
    lobby.ada.sent.length = 0;

    // A second of silence buys exactly a second's worth of frames: all of them land, and the
    // one after them does not. Counted in refusals rather than in writes, because `set-avatar`
    // only writes when the avatar actually changes and a repeated value is a legitimate no-op.
    lobby.clock.advance(1000);
    await flood(lobby, REFILL_PER_SECOND);
    expect(errorsIn(lobby.ada)).toEqual([]);

    await flood(lobby, 1);
    expect(errorsIn(lobby.ada)).toEqual(["rate-limited"]);
  });

  it("charges each socket on its own, so one flooder cannot mute the room", async () => {
    const lobby = await makeLobby();
    await flood(lobby, BURST + 200);
    const before = lobby.storage.writes;

    await send(lobby.hub, lobby.bo, { t: "set-avatar", avatar: "cloud" });

    expect(lobby.storage.writes).toBe(before + 1);
    expect(errorsIn(lobby.bo)).toEqual([]);
  });
});
