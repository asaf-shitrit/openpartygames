// API-level end-to-end suite. Runs against the real Worker, Room Durable
// Object and local D1 started by global-setup.ts; every socket speaks the real
// wire protocol and each phone is driven only by its own player view.

import { describe, expect, it } from "vitest";
import type {
  CreateRoomResponse,
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
  mltHostViewSchema,
  mltPlayerViewSchema,
  type MltHostView,
  type MltPlayerView,
} from "../../games/most-likely-to/src/state";
import {
  doodleHostViewSchema,
  doodlePlayerViewSchema,
  drawingIdOf,
  type DoodleHostView,
  type DoodlePlayerView,
  type Stroke,
} from "../../games/doodle-bluff/src/state";
import {
  BASE_URL,
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

/** The doodle-bluff host view for the room's active game. */
function doodleHostView(client: SocketClient): DoodleHostView {
  const game = hostViewOf(client).game;
  if (game === null) throw new Error("no active game");
  return doodleHostViewSchema.parse(game.view);
}

/** The doodle-bluff player view for the room's active game. */
function doodlePlayerView(client: SocketClient): DoodlePlayerView {
  const game = playerViewOf(client).game;
  if (game === null) throw new Error("player has no active game");
  return doodlePlayerViewSchema.parse(game.view);
}

/** True when this client's own view has reached the given doodle-bluff phase. */
function isDoodlePhase(
  client: SocketClient,
  phase: "draw" | "title" | "vote",
): boolean {
  const view: RoomView | null = client.latest;
  if (view === null || view.role !== "player" || view.game === null) {
    return false;
  }
  const parsed = doodlePlayerViewSchema.safeParse(view.game.view);
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

function doodleSignature(view: DoodleHostView): string {
  return JSON.stringify({
    phase: view.phase,
    round: view.roundNumber,
    written: view.writtenIds,
    voted: view.votedIds,
  });
}

function doodleSignatureOf(client: SocketClient): string {
  const view: RoomView | null = client.latest;
  if (view === null || view.role !== "host") return "no-view";
  if (view.game === null) return `lobby:${view.lobbyScreen}`;
  return doodleSignature(doodleHostView(client));
}

async function newRoom(): Promise<{ code: string; hostToken: string }> {
  const created = await createRoom();
  return { code: created.code, hostToken: created.hostToken };
}

async function newHebrewRoom(): Promise<{ code: string; hostToken: string }> {
  const response = await fetch(`${BASE_URL}/api/rooms`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ contentLanguage: "he" }),
  });
  if (!response.ok) {
    throw new Error(
      `POST /api/rooms -> ${response.status}: ${await response.text()}`,
    );
  }
  const body: CreateRoomResponse = await response.json();
  return { code: body.code, hostToken: body.hostToken };
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

async function makeHebrewLobby(playerCount = 3): Promise<Lobby> {
  const { code, hostToken } = await newHebrewRoom();
  const host = await hostClient(code, hostToken);
  await host.waitFor(
    (client) => client.welcomes.some((welcome) => welcome.role === "host"),
    WAIT_MS,
    "host welcome (hebrew)",
  );
  const players = await Promise.all(
    PLAYER_NAMES.slice(0, playerCount).map((name) => playerClient(code, name)),
  );
  await host.waitFor(
    (client) => hostViewOf(client).players.length === playerCount,
    WAIT_MS,
    "all players joined (hebrew)",
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

// ---------- Doodle Bluff ----------

/** A stroke with `pointCount` points, well inside every per-stroke and per-chunk cap. */
function makeStroke(pointCount: number, ink = 0): Stroke {
  const p: number[] = [500, 500];
  for (let i = 1; i < pointCount; i += 1) p.push(3, -2);
  return { c: ink, d: 100, g: 0, p };
}

function sendStrokes(
  player: SocketClient,
  drawingId: string,
  from: number,
  strokes: Stroke[],
): void {
  player.send({
    t: "game-action",
    action: { type: "strokes", drawingId, from, strokes },
  });
}

function sendDoodleDone(player: SocketClient, drawingId: string): void {
  player.send({ t: "game-action", action: { type: "doodle-done", drawingId } });
}

/** Draws one drawing in a single chunk and marks it done. */
async function drawSimple(player: SocketClient, drawingId: string): Promise<void> {
  await player.waitFor(
    safe((client) => isDoodlePhase(client, "draw")),
    WAIT_MS,
    "drawer ready",
  );
  sendStrokes(player, drawingId, 0, [makeStroke(3)]);
  await player.waitFor(
    safe((client) => doodlePlayerView(client).myStrokeCounts[drawingId] === 1),
    WAIT_MS,
    `strokes applied ${drawingId}`,
  );
  sendDoodleDone(player, drawingId);
  await player.waitFor(
    safe((client) => doodlePlayerView(client).myDone[drawingId] ?? false),
    WAIT_MS,
    `drawing done ${drawingId}`,
  );
}

/**
 * Draws one drawing across two chunks using the `from` cursor from `myStrokeCounts`, the
 * chunked-upload path that exists nowhere else in the product. Then replays the first,
 * already-applied chunk with its stale `from` — the idempotency guarantee a reconnecting
 * phone depends on — and asserts the replay added nothing.
 */
async function drawChunkedWithReplay(
  player: SocketClient,
  drawingId: string,
): Promise<void> {
  await player.waitFor(
    safe((client) => isDoodlePhase(client, "draw")),
    WAIT_MS,
    "drawer ready",
  );
  const chunk1 = [makeStroke(4), makeStroke(3)];
  sendStrokes(player, drawingId, 0, chunk1);
  await player.waitFor(
    safe(
      (client) =>
        doodlePlayerView(client).myStrokeCounts[drawingId] === chunk1.length,
    ),
    WAIT_MS,
    "first chunk applied",
  );

  const chunk2 = [makeStroke(5)];
  sendStrokes(player, drawingId, chunk1.length, chunk2);
  const total = chunk1.length + chunk2.length;
  await player.waitFor(
    safe((client) => doodlePlayerView(client).myStrokeCounts[drawingId] === total),
    WAIT_MS,
    "second chunk applied",
  );

  // Stale replay: `from` no longer matches the drawing's current stroke count, so the
  // rules reject it as a no-op rather than appending the strokes a second time.
  sendStrokes(player, drawingId, 0, chunk1);
  sendDoodleDone(player, drawingId);
  await player.waitFor(
    safe((client) => doodlePlayerView(client).myDone[drawingId] ?? false),
    WAIT_MS,
    "chunked drawing done",
  );
  expect(doodlePlayerView(player).myStrokeCounts[drawingId]).toBe(total);
}

/** One title submission for the current drawing, or a skip when nobody can title it. */
async function actDoodleTitle(view: DoodleHostView, lobby: Lobby): Promise<void> {
  const writerId = view.playerIds.find(
    (id) => id !== view.artistId && !view.writtenIds.includes(id),
  );
  const writer = lobby.players.find((player) => player.playerId === writerId);
  if (!writer) {
    vipOf(lobby).send({ t: "skip-phase" });
    return;
  }
  await writer.waitFor(
    safe((client) => isDoodlePhase(client, "title")),
    WAIT_MS,
    "titler ready",
  );
  const text = `title p${String(playerIndex(lobby, writer))} r${String(view.roundNumber)}`;
  writer.send({ t: "game-action", action: { type: "title", text } });
}

/** One vote for the current ballot, or a skip when nobody can vote on it. */
async function actDoodleVote(view: DoodleHostView, lobby: Lobby): Promise<void> {
  const voterId = view.playerIds.find(
    (id) => id !== view.artistId && !view.votedIds.includes(id),
  );
  const voter = lobby.players.find((player) => player.playerId === voterId);
  if (!voter) {
    vipOf(lobby).send({ t: "skip-phase" });
    return;
  }
  await voter.waitFor(
    safe((client) => isDoodlePhase(client, "vote")),
    WAIT_MS,
    "voter ready",
  );
  const options = doodlePlayerView(voter).options ?? [];
  const pick = options.find((option) => !option.mine) ?? options[0];
  voter.send({
    t: "game-action",
    action: { type: "vote", optionId: pick?.id ?? "" },
  });
}

/** One doodle-bluff action for the current phase, driven by the host's view. */
async function actDoodle(view: DoodleHostView, lobby: Lobby): Promise<void> {
  switch (view.phase) {
    case "draw":
      return;
    case "reveal":
    case "gallery":
      vipOf(lobby).send({ t: "skip-phase" });
      return;
    case "title":
      await actDoodleTitle(view, lobby);
      return;
    case "vote":
      await actDoodleVote(view, lobby);
      return;
  }
}

/** Drives a started doodle-bluff game (past `draw`) to its results screen. */
async function playDoodleBluff(lobby: Lobby, step = 0): Promise<void> {
  if (step > MAX_STEPS) {
    throw new Error("doodle-bluff game exceeded its step budget");
  }
  const view = hostViewOf(lobby.host);
  if (view.lobbyScreen === "results" && view.game === null) return;
  if (view.game === null) {
    await sleep(20);
    await playDoodleBluff(lobby, step + 1);
    return;
  }
  const gameView = doodleHostView(lobby.host);
  await actDoodle(gameView, lobby);
  await lobby.host.waitFor(
    (client) => doodleSignatureOf(client) !== doodleSignature(gameView),
    WAIT_MS,
    `doodle-bluff phase ${gameView.phase}`,
  );
  await playDoodleBluff(lobby, step + 1);
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

// ---------- No-TV lobby: player sockets only, never a host-hello ----------

interface NoTvLobby {
  code: string;
  players: SocketClient[];
}

/**
 * Wraps a predicate that reads a view with `playerViewOf`/`mltStageOf` (which throw before
 * any frame has arrived) so it can run inside `waitFor`'s synchronous first check, before
 * this socket's first `state` frame lands.
 */
function safe(
  predicate: (client: SocketClient) => boolean,
): (client: SocketClient) => boolean {
  return (client) => {
    try {
      return predicate(client);
    } catch {
      return false;
    }
  };
}

async function createNoTvRoom(): Promise<CreateRoomResponse> {
  const response = await fetch(`${BASE_URL}/api/rooms`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sharedScreen: false }),
  });
  if (!response.ok) {
    throw new Error(
      `POST /api/rooms -> ${response.status}: ${await response.text()}`,
    );
  }
  const body: CreateRoomResponse = await response.json();
  return body;
}

async function makeNoTvLobby(playerCount = 3): Promise<NoTvLobby> {
  const created = await createNoTvRoom();
  const players = await Promise.all(
    PLAYER_NAMES.slice(0, playerCount).map((name) =>
      playerClient(created.code, name),
    ),
  );
  await Promise.all(
    players.map((player) =>
      player.waitFor(
        safe((client) => playerViewOf(client).players.length === playerCount),
        WAIT_MS,
        "all players joined (no-tv)",
      ),
    ),
  );
  return { code: created.code, players };
}

/** The VIP among a no-TV lobby's players, read off any player's own view. */
function noTvVipOf(lobby: NoTvLobby): SocketClient {
  const withView = lobby.players.find((client) => client.latest !== null);
  if (!withView) throw new Error("no player view yet");
  const vipId = playerViewOf(withView).vipId;
  const vip = lobby.players.find((client) => client.playerId === vipId);
  if (!vip) throw new Error("VIP client not found");
  return vip;
}

/** The stage a no-TV room's active game carries: literally the host view, on every player. */
function mltStageOf(client: SocketClient): MltHostView {
  const view = playerViewOf(client);
  if (view.game === null) throw new Error("player has no active game");
  return mltHostViewSchema.parse(view.game.stage);
}

function mltPlayerGameViewOf(client: SocketClient): MltPlayerView {
  const view = playerViewOf(client);
  if (view.game === null) throw new Error("player has no active game");
  return mltPlayerViewSchema.parse(view.game.view);
}

async function startMostLikelyToNoTv(lobby: NoTvLobby): Promise<void> {
  const vip = noTvVipOf(lobby);
  vip.send({ t: "pick-game", gameId: "most-likely-to" });
  await Promise.all(
    lobby.players.map((player) =>
      player.waitFor(
        safe(
          (client) => playerViewOf(client).selectedGameId === "most-likely-to",
        ),
        WAIT_MS,
        "pick most-likely-to (no-tv)",
      ),
    ),
  );
  vip.send({ t: "start-game" });
  await Promise.all(
    lobby.players.map((player) =>
      player.waitFor(
        safe((client) => playerViewOf(client).game !== null),
        WAIT_MS,
        "start most-likely-to (no-tv)",
      ),
    ),
  );
}

function mltSignature(stage: MltHostView): string {
  return JSON.stringify({
    phase: stage.phase,
    round: stage.roundNumber,
    voted: stage.votedIds,
  });
}

/** One no-TV Most Likely To action for the current phase, driven off the shared stage. */
function actMostLikelyToNoTv(stage: MltHostView, lobby: NoTvLobby): void {
  const vip = noTvVipOf(lobby);
  if (stage.phase === "reveal") {
    vip.send({ t: "skip-phase" });
    return;
  }
  const voterId = stage.playerIds.find((id) => !stage.votedIds.includes(id));
  const voter = lobby.players.find((player) => player.playerId === voterId);
  if (!voter) {
    vip.send({ t: "skip-phase" });
    return;
  }
  const target = mltPlayerGameViewOf(voter).voteCandidates[0] ?? voterId;
  voter.send({ t: "game-action", action: { type: "vote", target } });
}

/** Drives a no-TV Most Likely To game to its results screen, one state change per step. */
async function playMostLikelyToNoTv(
  lobby: NoTvLobby,
  step = 0,
): Promise<void> {
  if (step > MAX_STEPS) {
    throw new Error("most-likely-to (no-tv) game exceeded its step budget");
  }
  const reference = lobby.players[0];
  if (!reference) throw new Error("expected at least one player");
  const view = playerViewOf(reference);
  if (view.lobbyScreen === "results" && view.game === null) return;
  if (view.game === null) {
    await sleep(20);
    await playMostLikelyToNoTv(lobby, step + 1);
    return;
  }
  const stage = mltStageOf(reference);
  const before = mltSignature(stage);
  actMostLikelyToNoTv(stage, lobby);
  await reference.waitFor((client) => {
    const nextView = playerViewOf(client);
    if (nextView.game === null) return nextView.lobbyScreen === "results";
    return mltSignature(mltHostViewSchema.parse(nextView.game.stage)) !== before;
  }, WAIT_MS, `most-likely-to (no-tv) phase ${stage.phase}`);
  await playMostLikelyToNoTv(lobby, step + 1);
}

async function closeAllPlayers(lobby: NoTvLobby): Promise<void> {
  await Promise.all(lobby.players.map((client) => client.close()));
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

  it("drives Doodle Bluff's chunked upload with an idempotent replay, then plays a full game to awards", async () => {
    const lobby = await makeLobby(3);
    await startGame(lobby, "doodle-bluff");
    await lobby.host.waitFor(
      safe((client) => doodleHostView(client).phase === "draw"),
      WAIT_MS,
      "doodle-bluff draw phase",
    );

    const [artist] = lobby.players;
    if (!artist || artist.playerId === null) {
      throw new Error("expected an artist");
    }
    const chunkedDrawingId = drawingIdOf(artist.playerId, 0);
    await drawChunkedWithReplay(artist, chunkedDrawingId);

    const remainingDrawings = lobby.players.flatMap((player) => {
      if (player.playerId === null) throw new Error("player has no id");
      const playerId = player.playerId;
      return ([0, 1] as const)
        .map((slot) => drawingIdOf(playerId, slot))
        .filter((drawingId) => drawingId !== chunkedDrawingId)
        .map((drawingId) => ({ player, drawingId }));
    });
    await Promise.all(
      remainingDrawings.map(({ player, drawingId }) =>
        drawSimple(player, drawingId),
      ),
    );

    await lobby.host.waitFor(
      safe((client) => doodleHostView(client).phase !== "draw"),
      WAIT_MS,
      "draw phase ended",
    );

    await playDoodleBluff(lobby);

    const view = hostViewOf(lobby.host);
    expect(view.lobbyScreen).toBe("results");
    expect(view.game).toBeNull();
    expect(view.lastResult?.gameId).toBe("doodle-bluff");
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

  it("creates a shared-screen room when POST /api/rooms has no body", async () => {
    const { code, hostToken } = await newRoom();
    const host = await hostClient(code, hostToken);
    await host.waitFor(
      (client) => client.welcomes.some((welcome) => welcome.role === "host"),
      WAIT_MS,
      "host welcome (default room)",
    );
    await host.waitFor(
      (client) => client.latest !== null,
      WAIT_MS,
      "host view (default room)",
    );
    expect(hostViewOf(host).sharedScreen).toBe(true);
    await host.close();
  });

  it("plays a full Most Likely To game with no shared screen and no host socket", async () => {
    const lobby = await makeNoTvLobby(3);
    const [alice] = lobby.players;
    if (!alice) throw new Error("expected at least one player");

    expect(playerViewOf(alice).sharedScreen).toBe(false);

    await startMostLikelyToNoTv(lobby);

    // Every player carries the shared stage; it is literally the host view, so it
    // must be identical across every connection at the same moment.
    await Promise.all(
      lobby.players.map((player) =>
        player.waitFor(
          safe((client) => mltStageOf(client).phase === "vote"),
          WAIT_MS,
          "vote stage (no-tv)",
        ),
      ),
    );
    const stages = lobby.players.map((player) => mltStageOf(player));
    const [firstStage, ...restStages] = stages;
    expect(firstStage).toBeDefined();
    for (const stage of restStages) {
      expect(stage).toEqual(firstStage);
    }
    for (const player of lobby.players) {
      expect(playerViewOf(player).sharedScreen).toBe(false);
    }

    await playMostLikelyToNoTv(lobby);

    const finalView = playerViewOf(alice);
    expect(finalView.lobbyScreen).toBe("results");
    expect(finalView.lastResult?.gameId).toBe("most-likely-to");
    expect((finalView.lastResult?.winnerIds ?? []).length).toBeGreaterThan(0);

    // No host socket ever connected to this room: `hostClient` was never called above.
    await closeAllPlayers(lobby);
  });

  it("keeps a player's stage null when the room has a shared screen", async () => {
    const lobby = await makeLobby(3);
    await startGame(lobby, "most-likely-to");
    const other = lobby.players[0];
    if (!other) throw new Error("expected a player");
    await other.waitFor(
      safe((client) => playerViewOf(client).game !== null),
      WAIT_MS,
      "most-likely-to started (shared screen)",
    );
    const view = playerViewOf(other);
    expect(view.sharedScreen).toBe(true);
    expect(view.game?.stage ?? null).toBeNull();
    await closeAll(lobby);
  });

  it("refuses to start a TV-only game with no shared screen", async () => {
    const lobby = await makeNoTvLobby(3);
    const vip = noTvVipOf(lobby);
    vip.send({ t: "pick-game", gameId: "real-or-nah" });
    await Promise.all(
      lobby.players.map((player) =>
        player.waitFor(
          safe((client) => playerViewOf(client).selectedGameId === "real-or-nah"),
          WAIT_MS,
          "pick real-or-nah (no-tv)",
        ),
      ),
    );
    vip.send({ t: "start-game" });
    await vip.waitFor(
      (client) =>
        client.errors.some((error) => error.code === "invalid-action"),
      WAIT_MS,
      "invalid-action (no-tv start real-or-nah)",
    );
    const refusal = vip.errors.find((error) => error.code === "invalid-action");
    expect(refusal?.message).toBe("This game plays on a shared screen.");
    await closeAllPlayers(lobby);
  });

  it("plays Imposter in Hebrew and refuses Real or Nah with no-language-packs", async () => {
    const lobby = await makeHebrewLobby(3);
    expect(hostViewOf(lobby.host).contentLanguage).toBe("he");

    const games = hostViewOf(lobby.host).games;
    expect(games.find((g) => g.id === "imposter")?.hasContentInLanguage).toBe(
      true,
    );
    expect(
      games.find((g) => g.id === "real-or-nah")?.hasContentInLanguage,
    ).toBe(false);

    // Real or Nah has no Hebrew pack (out of scope: it needs sourced facts), so
    // starting it in a Hebrew room fails with a distinct code, not silent English content.
    const ronVip = vipOf(lobby);
    ronVip.send({ t: "pick-game", gameId: "real-or-nah" });
    await lobby.host.waitFor(
      (client) => hostViewOf(client).selectedGameId === "real-or-nah",
      WAIT_MS,
      "pick real-or-nah (hebrew)",
    );
    ronVip.send({ t: "start-game" });
    await ronVip.waitFor(
      (client) =>
        client.errors.some((error) => error.code === "no-language-packs"),
      WAIT_MS,
      "no-language-packs (hebrew real-or-nah)",
    );
    expect(hostViewOf(lobby.host).phase).toBe("lobby");

    // Imposter does have a Hebrew pack, and it actually plays: the word a player sees
    // is drawn from it, not from the English catalog.
    await startGame(lobby, "imposter");
    await lobby.host.waitFor(
      (client) => hostViewOf(client).phase === "in-game",
      WAIT_MS,
      "imposter started (hebrew)",
    );
    const someone = lobby.players[0];
    if (!someone) throw new Error("expected a player");
    await someone.waitFor(
      safe((client) => playerViewOf(client).game !== null),
      WAIT_MS,
      "imposter player view (hebrew)",
    );
    const word = imposterPlayerView(someone).word;
    expect(word).toBeTruthy();
    expect(/[֐-׿]/u.test(word ?? "")).toBe(true);

    await closeAll(lobby);
  });
});
