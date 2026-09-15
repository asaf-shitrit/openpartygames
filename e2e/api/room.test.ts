// API-level end-to-end suite. Runs against the real Worker, Room Durable
// Object and local D1 started by global-setup.ts; every socket speaks the real
// wire protocol and each phone is driven only by its own player view.

import { describe, expect, it } from "vitest";
import type {
  HostRoomView,
  PlayerRoomView,
  RoomView,
} from "../../packages/protocol/src/index";
import {
  imposterHostViewSchema,
  imposterPlayerViewSchema,
  type ImposterHostView,
  type ImposterPlayerView,
} from "../../games/imposter/src/state";
import {
  ronHostViewSchema,
  ronPlayerViewSchema,
  type RonHostView,
  type RonPlayerView,
} from "../../games/real-or-nah/src/types";
import {
  createRoom,
  health,
  hostClient,
  playerClient,
  roomInfo,
  type SocketClient,
} from "./client";

const PLAYER_NAMES = ["Ada", "Bo", "Cy", "Dee", "Eve", "Fay", "Gus", "Hal"];
const WAIT_MS = 15_000;
const MAX_STEPS = 400;

interface Lobby {
  code: string;
  host: SocketClient;
  players: SocketClient[];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hostViewOf(client: SocketClient): HostRoomView {
  const view: RoomView | null = client.latest;
  if (view === null || view.role !== "host") {
    throw new Error("expected a host view");
  }
  return view;
}

function playerViewOf(client: SocketClient): PlayerRoomView {
  const view: RoomView | null = client.latest;
  if (view === null || view.role !== "player") {
    throw new Error("expected a player view");
  }
  return view;
}

/** The imposter host view for the room's active game. */
function imposterHostView(client: SocketClient): ImposterHostView {
  const game = hostViewOf(client).game;
  if (game === null) throw new Error("no active game");
  return imposterHostViewSchema.parse(game.view);
}

/** The imposter player view for the room's active game. */
function imposterPlayerView(client: SocketClient): ImposterPlayerView {
  const game = playerViewOf(client).game;
  if (game === null) throw new Error("player has no active game");
  return imposterPlayerViewSchema.parse(game.view);
}

/** The real-or-nah host view for the room's active game. */
function ronHostView(client: SocketClient): RonHostView {
  const game = hostViewOf(client).game;
  if (game === null) throw new Error("no active game");
  return ronHostViewSchema.parse(game.view);
}

/** The real-or-nah player view for the room's active game. */
function ronPlayerView(client: SocketClient): RonPlayerView {
  const game = playerViewOf(client).game;
  if (game === null) throw new Error("player has no active game");
  return ronPlayerViewSchema.parse(game.view);
}

/** True when this client's own view has reached the given real-or-nah phase. */
function isRonPhase(client: SocketClient, phase: "write" | "vote"): boolean {
  const view: RoomView | null = client.latest;
  if (view === null || view.role !== "player" || view.game === null) {
    return false;
  }
  const parsed = ronPlayerViewSchema.safeParse(view.game.view);
  return parsed.success && parsed.data.phase === phase;
}

function vipOf(lobby: Lobby): SocketClient {
  const vipId = hostViewOf(lobby.host).vipId;
  const vip = lobby.players.find((player) => player.playerId === vipId);
  if (!vip) throw new Error("VIP client not found");
  return vip;
}

function playerIndex(lobby: Lobby, player: SocketClient): number {
  return lobby.players.indexOf(player);
}

function imposterSignature(view: ImposterHostView): string {
  return JSON.stringify({
    phase: view.phase,
    wordNumber: view.wordNumber,
    speaker: view.currentSpeakerId,
    done: view.doneSpeakerIds,
    voted: view.votedIds,
  });
}

function imposterSignatureOf(client: SocketClient): string {
  const view: RoomView | null = client.latest;
  if (view === null || view.role !== "host") return "no-view";
  if (view.game === null) return `lobby:${view.lobbyScreen}`;
  return imposterSignature(imposterHostView(client));
}

function ronSignature(view: RonHostView): string {
  return JSON.stringify({
    phase: view.phase,
    factNumber: view.factNumber,
    submitted: view.submittedIds,
    voted: view.votedIds,
  });
}

function ronSignatureOf(client: SocketClient): string {
  const view: RoomView | null = client.latest;
  if (view === null || view.role !== "host") return "no-view";
  if (view.game === null) return `lobby:${view.lobbyScreen}`;
  return ronSignature(ronHostView(client));
}

async function newRoom(): Promise<{ code: string; hostToken: string }> {
  const created = await createRoom();
  return { code: created.code, hostToken: created.hostToken };
}

async function makeLobby(playerCount = 3): Promise<Lobby> {
  const { code, hostToken } = await newRoom();
  const host = await hostClient(code, hostToken);
  await host.waitFor(
    (client) => client.welcomes.some((welcome) => welcome.role === "host"),
    WAIT_MS,
    "host welcome",
  );
  const players = await Promise.all(
    PLAYER_NAMES.slice(0, playerCount).map((name) => playerClient(code, name)),
  );
  await host.waitFor(
    (client) => hostViewOf(client).players.length === playerCount,
    WAIT_MS,
    "all players joined",
  );
  return { code, host, players };
}

/** Picks `gameId` (when needed) and starts the game as the VIP. */
async function startGame(lobby: Lobby, gameId: string): Promise<void> {
  const vip = vipOf(lobby);
  if (hostViewOf(lobby.host).selectedGameId !== gameId) {
    vip.send({ t: "pick-game", gameId });
    await lobby.host.waitFor(
      (client) => hostViewOf(client).selectedGameId === gameId,
      WAIT_MS,
      `pick ${gameId}`,
    );
  }
  vip.send({ t: "start-game" });
  await lobby.host.waitFor(
    (client) =>
      hostViewOf(client).phase !== "lobby" || client.errors.length > 0,
    WAIT_MS,
    `start ${gameId}`,
  );
}

/** One imposter action for the current phase, driven by the host's view. */
function sendImposterDone(view: ImposterHostView, lobby: Lobby): void {
  const speaker = lobby.players.find(
    (player) => player.playerId === view.currentSpeakerId,
  );
  if (!speaker) {
    vipOf(lobby).send({ t: "skip-phase" });
    return;
  }
  speaker.send({ t: "game-action", action: { type: "done" } });
}

function sendImposterVote(view: ImposterHostView, lobby: Lobby): void {
  const voterId = view.playerIds.find((id) => !view.votedIds.includes(id));
  const voter = lobby.players.find((player) => player.playerId === voterId);
  if (!voter) {
    vipOf(lobby).send({ t: "skip-phase" });
    return;
  }
  const target = view.playerIds.find((id) => id !== voterId) ?? "";
  voter.send({ t: "game-action", action: { type: "vote", target } });
}

function sendImposterGuess(view: ImposterHostView, lobby: Lobby): void {
  const imposter = lobby.players.find(
    (player) => player.playerId === view.imposterId,
  );
  if (!imposter) {
    vipOf(lobby).send({ t: "skip-phase" });
    return;
  }
  imposter.send({
    t: "game-action",
    action: { type: "guess", text: view.decoyWord ?? "" },
  });
}

function actImposter(view: ImposterHostView, lobby: Lobby): void {
  switch (view.phase) {
    case "word-check":
    case "reveal":
    case "result":
      vipOf(lobby).send({ t: "skip-phase" });
      return;
    case "clues":
      sendImposterDone(view, lobby);
      return;
    case "vote":
      sendImposterVote(view, lobby);
      return;
    case "last-chance":
      sendImposterGuess(view, lobby);
      return;
  }
}

/** Drives an imposter game to its results screen, one state change per step. */
async function playImposter(lobby: Lobby, step = 0): Promise<void> {
  if (step > MAX_STEPS)
    throw new Error("imposter game exceeded its step budget");
  const view = hostViewOf(lobby.host);
  if (view.lobbyScreen === "results" && view.game === null) return;
  if (view.phase === "lobby" && view.game === null) {
    await startGame(lobby, "imposter");
    await playImposter(lobby, step + 1);
    return;
  }
  if (view.game === null) {
    await sleep(20);
    await playImposter(lobby, step + 1);
    return;
  }
  const gameView = imposterHostView(lobby.host);
  actImposter(gameView, lobby);
  await lobby.host.waitFor(
    (client) => imposterSignatureOf(client) !== imposterSignature(gameView),
    WAIT_MS,
    `imposter phase ${gameView.phase}`,
  );
  await playImposter(lobby, step + 1);
}

/** One real-or-nah action for the current phase. */
async function actRon(view: RonHostView, lobby: Lobby): Promise<void> {
  const vip = vipOf(lobby);
  switch (view.phase) {
    case "reveal":
      vip.send({ t: "skip-phase" });
      return;
    case "write": {
      const writerId = view.playerIds.find(
        (id) => !view.submittedIds.includes(id),
      );
      const writer = lobby.players.find(
        (player) => player.playerId === writerId,
      );
      if (!writer) {
        vip.send({ t: "skip-phase" });
        return;
      }
      await writer.waitFor(
        (client) => isRonPhase(client, "write"),
        WAIT_MS,
        "writer ready",
      );
      const text = `lie p${String(playerIndex(lobby, writer))} f${String(view.factNumber)}`;
      writer.send({ t: "game-action", action: { type: "lie", text } });
      return;
    }
    case "vote": {
      const voterId = view.playerIds.find((id) => !view.votedIds.includes(id));
      const voter = lobby.players.find((player) => player.playerId === voterId);
      if (!voter) {
        vip.send({ t: "skip-phase" });
        return;
      }
      await voter.waitFor(
        (client) => isRonPhase(client, "vote"),
        WAIT_MS,
        "voter ready",
      );
      const options = ronPlayerView(voter).options ?? [];
      const pick = options.find((option) => !option.mine) ?? options[0];
      voter.send({
        t: "game-action",
        action: { type: "pick", optionId: pick?.id ?? "" },
      });
      return;
    }
  }
}

/** Drives a real-or-nah game to its results screen, one state change per step. */
async function playRealOrNah(lobby: Lobby, step = 0): Promise<void> {
  if (step > MAX_STEPS) {
    throw new Error("real-or-nah game exceeded its step budget");
  }
  const view = hostViewOf(lobby.host);
  if (view.lobbyScreen === "results" && view.game === null) return;
  if (view.phase === "lobby" && view.game === null) {
    await startGame(lobby, "real-or-nah");
    await playRealOrNah(lobby, step + 1);
    return;
  }
  if (view.game === null) {
    await sleep(20);
    await playRealOrNah(lobby, step + 1);
    return;
  }
  const gameView = ronHostView(lobby.host);
  await actRon(gameView, lobby);
  await lobby.host.waitFor(
    (client) => ronSignatureOf(client) !== ronSignature(gameView),
    WAIT_MS,
    `real-or-nah phase ${gameView.phase}`,
  );
  await playRealOrNah(lobby, step + 1);
}

async function closeAll(
  lobby: Lobby,
  extra: SocketClient[] = [],
): Promise<void> {
  await Promise.all(
    [...lobby.players, ...extra].map((client) => client.close()),
  );
  await lobby.host.close();
}

describe("api e2e", () => {
  it("serves a health check", async () => {
    const result = await health();
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ ok: true });
  });

  it("404s an unknown room code", async () => {
    const result = await roomInfo("ZZZZ");
    expect(result.status).toBe(404);
    expect(result.body).toEqual({ error: "not-found" });
  });

  it("404s an invalid room code", async () => {
    const result = await roomInfo("AAAA");
    expect(result.status).toBe(404);
  });

  it("creates a room and reports it over HTTP", async () => {
    const created = await newRoom();
    expect(created.code).toMatch(/^[BCDFGHJKLMNPQRSTVWXZ]{4}$/u);
    expect(created.hostToken.length).toBeGreaterThan(0);

    const info = await roomInfo(created.code);
    expect(info.status).toBe(200);
    if (!("exists" in info.body)) throw new Error("expected room info");
    expect(info.body.exists).toBe(true);
    expect(info.body.playerCount).toBe(0);
    expect(info.body.joinable).toBe(true);
  });

  it("rejects a wrong host token", async () => {
    const { code } = await newRoom();
    const host = await hostClient(code, "not-the-real-token");
    await host.waitFor(
      (client) =>
        client.errors.some((error) => error.code === "host-token-invalid"),
      WAIT_MS,
      "host-token-invalid",
    );
    expect(host.errors.map((error) => error.code)).toContain(
      "host-token-invalid",
    );
    await host.close();
  });

  it("answers a malformed frame with bad-message", async () => {
    const { code, hostToken } = await newRoom();
    const host = await hostClient(code, hostToken);
    host.sendRaw("{not json");
    await host.waitFor(
      (client) => client.errors.some((error) => error.code === "bad-message"),
      WAIT_MS,
      "bad-message",
    );
    expect(host.errors.map((error) => error.code)).toContain("bad-message");
    await host.close();
  });

  it("joins three players and refuses non-VIP lobby controls", async () => {
    const lobby = await makeLobby(3);
    const view = hostViewOf(lobby.host);
    expect(view.players).toHaveLength(3);
    expect(view.vipId).not.toBeNull();
    expect(view.players.every((player) => player.connected)).toBe(true);
    expect(view.players.every((player) => player.avatar !== null)).toBe(true);
    const avatars = view.players.map((player) => player.avatar);
    expect(new Set(avatars).size).toBe(avatars.length);

    const vip = vipOf(lobby);
    const other = lobby.players.find((player) => player !== vip);
    if (!other) throw new Error("expected a non-VIP player");
    other.send({ t: "start-game" });
    await other.waitFor(
      (client) => client.errors.some((error) => error.code === "not-vip"),
      WAIT_MS,
      "non-VIP start-game",
    );
    other.send({ t: "pick-game", gameId: "real-or-nah" });
    await other.waitFor(
      (client) =>
        client.errors.filter((error) => error.code === "not-vip").length >= 2,
      WAIT_MS,
      "non-VIP pick-game",
    );

    await closeAll(lobby);
  });

  it("plays a full imposter game to the results screen and awards crowns", async () => {
    const lobby = await makeLobby(3);
    await playImposter(lobby);

    const view = hostViewOf(lobby.host);
    expect(view.lobbyScreen).toBe("results");
    expect(view.game).toBeNull();
    expect(view.lastResult?.gameId).toBe("imposter");
    const winners = view.lastResult?.winnerIds ?? [];
    expect(winners.length).toBeGreaterThan(0);
    for (const id of winners) {
      expect(view.players.find((player) => player.id === id)?.crowns).toBe(1);
    }

    await closeAll(lobby);
  });

  it("plays a full real-or-nah game to the results screen", async () => {
    const lobby = await makeLobby(3);
    await playRealOrNah(lobby);

    const view = hostViewOf(lobby.host);
    expect(view.lobbyScreen).toBe("results");
    expect(view.lastResult?.gameId).toBe("real-or-nah");
    expect((view.lastResult?.winnerIds ?? []).length).toBeGreaterThan(0);

    await closeAll(lobby);
  });

  it("lets a player rejoin mid-game with the same seat and score", async () => {
    const lobby = await makeLobby(3);
    vipOf(lobby).send({ t: "start-game" });
    await lobby.host.waitFor(
      (client) => hostViewOf(client).game !== null,
      WAIT_MS,
      "imposter started",
    );

    // Players join in parallel, so any index can be the VIP; the VIP must stay connected to end the game.
    const vipId = hostViewOf(lobby.host).vipId;
    const player = lobby.players.find((entry) => entry.playerId !== vipId);
    if (!player) throw new Error("expected a non-VIP player");
    const playerId = player.playerId;
    const token = player.token;
    if (playerId === null || token === null) {
      throw new Error("player has no id or token");
    }
    const scoreBefore = imposterHostView(lobby.host).totals[playerId] ?? 0;

    await player.close();
    await lobby.host.waitFor(
      (client) =>
        hostViewOf(client).players.find((entry) => entry.id === playerId)
          ?.connected === false,
      WAIT_MS,
      "player marked disconnected",
    );

    const rejoined = await playerClient(lobby.code, "Bo", token);
    expect(rejoined.playerId).toBe(playerId);
    expect(rejoined.token).toBe(token);
    await rejoined.waitFor(
      (client) => {
        const view: RoomView | null = client.latest;
        return view !== null && view.role === "player" && view.game !== null;
      },
      WAIT_MS,
      "rejoined player view",
    );
    expect(imposterPlayerView(rejoined).totals[playerId]).toBe(scoreBefore);

    await lobby.host.waitFor(
      (client) =>
        hostViewOf(client).players.find((entry) => entry.id === playerId)
          ?.connected === true,
      WAIT_MS,
      "player marked connected again",
    );
    expect(imposterHostView(lobby.host).totals[playerId]).toBe(scoreBefore);

    vipOf(lobby).send({ t: "end-game" });
    await lobby.host.waitFor(
      (client) => hostViewOf(client).game === null,
      WAIT_MS,
      "game ended",
    );
    await closeAll(lobby, [rejoined]);
  });
});
