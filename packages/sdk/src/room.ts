// RoomCore: the pure, deterministic room + game engine. The Durable Object is a thin
// adapter around it. No Date.now(), Math.random(), timers, crypto or I/O live here:
// the adapter feeds in the clock, and ids/tokens come only from options.newToken.

import {
  AVATARS,
  MAX_PLAYERS,
  cleanPlayerName,
  type ActiveGameView,
  type AvatarId,
  type ClientMessage,
  type ErrorCode,
  type GameResultSummary,
  type HostRoomView,
  type LobbyScreen,
  type PackSummary,
  type PlayerId,
  type PlayerRoomView,
  type PlayerSummary,
  type RoomPhase,
  type RoomViewBase,
  type ServerMessage,
} from "@opg/protocol";
import type {
  AnyGame,
  Caller,
  ContentKind,
  CreateRoomOptions,
  GameContent,
  GameContext,
  GamePlayer,
  HandleResult,
  PackMeta,
  RoomCore,
  RoomEffect,
  RoomSnapshot,
} from "./types";
import { createRng, restoreRng } from "./rng";

const VIP_GRACE_MS = 60_000;
const MAX_TICK_ITERATIONS = 50;

interface PlayerRecord {
  id: PlayerId;
  token: string;
  name: string;
  avatar: AvatarId | null;
  crowns: number;
  order: number;
  connected: boolean;
  waitingForNextGame: boolean;
  disconnectedAt: number | null;
}

interface GameRuntime {
  gameId: string;
  state: unknown;
  playerIds: PlayerId[];
  content: GameContent;
  deadline: number | null;
  startedAt: number;
}

interface PendingStart {
  gameId: string;
  playerIds: PlayerId[];
}

interface InternalState {
  code: string;
  hostToken: string;
  rng: number;
  players: PlayerRecord[];
  orderSeq: number;
  vipId: PlayerId | null;
  locked: boolean;
  selectedGameId: string;
  lobbyScreen: LobbyScreen;
  phase: RoomPhase;
  packCatalog: PackMeta[];
  packEnabled: Record<string, boolean>;
  lastResult: GameResultSummary | null;
  game: GameRuntime | null;
  pending: PendingStart | null;
  hostConnected: boolean;
  emptySince: number | null;
}

interface Out {
  reply: ServerMessage[];
  effects: RoomEffect[];
  changed: boolean;
}

type GameActionPayload = Extract<ClientMessage, { t: "game-action" }>["action"];
type GameMessage = Extract<
  ClientMessage,
  { t: "skip-phase" | "end-game" | "game-action" }
>;
type VipMessage = Extract<
  ClientMessage,
  { t: "pick-game" | "set-pack" | "set-locked" | "kick" | "start-game" }
>;
type RoomMessage = Exclude<ClientMessage, GameMessage | VipMessage>;

function isGameMessage(message: ClientMessage): message is GameMessage {
  return (
    message.t === "skip-phase" ||
    message.t === "end-game" ||
    message.t === "game-action"
  );
}

function isVipMessage(message: ClientMessage): message is VipMessage {
  return (
    message.t === "pick-game" ||
    message.t === "set-pack" ||
    message.t === "set-locked" ||
    message.t === "kick" ||
    message.t === "start-game"
  );
}

function result(out: Out): HandleResult {
  return { reply: out.reply, effects: out.effects, changed: out.changed };
}

function newOut(): Out {
  return { reply: [], effects: [], changed: false };
}

class RoomImpl implements RoomCore {
  readonly code: string;

  private hostToken: string;
  private games: AnyGame[];
  private newToken: () => string;
  private rng: ReturnType<typeof createRng>;

  private players: PlayerRecord[];
  private orderSeq: number;
  private vipId: PlayerId | null;
  private locked: boolean;
  private selectedGameId: string;
  private lobbyScreen: LobbyScreen;
  private phase: RoomPhase;
  private packCatalog: PackMeta[];
  private packEnabled: Record<string, boolean>;
  private lastResult: GameResultSummary | null;
  private game: GameRuntime | null;
  private pending: PendingStart | null;
  private hostConnected: boolean;
  private emptySince: number | null;

  constructor(state: InternalState, games: AnyGame[], newToken: () => string) {
    this.code = state.code;
    this.hostToken = state.hostToken;
    this.games = games;
    this.newToken = newToken;
    this.rng = restoreRng(state.rng);
    this.players = state.players.map((p) => ({ ...p }));
    this.orderSeq = state.orderSeq;
    this.vipId = state.vipId;
    this.locked = state.locked;
    this.selectedGameId = state.selectedGameId;
    this.lobbyScreen = state.lobbyScreen;
    this.phase = state.phase;
    this.packCatalog = state.packCatalog.map((p) => ({ ...p }));
    this.packEnabled = { ...state.packEnabled };
    this.lastResult = state.lastResult
      ? {
          ...state.lastResult,
          scores: { ...state.lastResult.scores },
          winnerIds: [...state.lastResult.winnerIds],
        }
      : null;
    this.game = state.game
      ? {
          ...state.game,
          playerIds: [...state.game.playerIds],
          content: state.game.content,
        }
      : null;
    this.pending = state.pending
      ? { ...state.pending, playerIds: [...state.pending.playerIds] }
      : null;
    this.hostConnected = state.hostConnected;
    this.emptySince = state.emptySince;
  }

  // ---------- lookups ----------

  private getPlayer(id: PlayerId): PlayerRecord | undefined {
    return this.players.find((p) => p.id === id);
  }

  private gameDef(id: string): AnyGame | undefined {
    return this.games.find((g) => g.id === id);
  }

  private selectedGame(): AnyGame | undefined {
    return this.gameDef(this.selectedGameId);
  }

  private enabledPackIds(kind: ContentKind): string[] {
    return this.packCatalog
      .filter((p) => p.kind === kind && this.packEnabled[p.id] === true)
      .map((p) => p.id);
  }

  private hasConnection(): boolean {
    return this.hostConnected || this.players.some((p) => p.connected);
  }

  private syncEmpty(now: number): void {
    if (this.hasConnection()) this.emptySince = null;
    else if (this.emptySince === null) this.emptySince = now;
  }

  private fail(out: Out, code: ErrorCode, message: string): void {
    out.reply.push({ t: "error", code, message });
  }

  /** VIP-only gate. Anyone who is not the current VIP gets "not-vip". */
  private requireVip(caller: Caller, out: Out): boolean {
    if (caller.kind !== "player" || caller.playerId !== this.vipId) {
      this.fail(out, "not-vip", "Only the room leader can do that.");
      return false;
    }
    return true;
  }

  /** Reassigns the VIP to the earliest-joined connected player once the current VIP is gone or expired. */
  private ensureVip(now: number, out: Out): void {
    const vip = this.vipId ? this.getPlayer(this.vipId) : undefined;
    if (vip && this.vipWithinGrace(vip, now)) return;
    const next = this.players.find((p) => p.connected);
    const nextId = next ? next.id : null;
    if (nextId !== this.vipId) {
      this.vipId = nextId;
      out.changed = true;
    }
  }

  /** A connected VIP always keeps the crown; a disconnected one keeps it for the grace window. */
  private vipWithinGrace(vip: PlayerRecord, now: number): boolean {
    if (vip.connected) return true;
    if (vip.disconnectedAt === null) return false;
    return now - vip.disconnectedAt < VIP_GRACE_MS;
  }

  private makeCtx(
    game: { playerIds: PlayerId[]; content: GameContent },
    now: number,
  ): GameContext {
    const players: GamePlayer[] = [];
    const connectedIds: PlayerId[] = [];
    for (const id of game.playerIds) {
      const p = this.getPlayer(id);
      if (!p) continue;
      players.push({ id: p.id, name: p.name, avatar: p.avatar });
      if (p.connected) connectedIds.push(p.id);
    }
    return { players, connectedIds, rng: this.rng, now, content: game.content };
  }

  private refreshDeadline(): void {
    if (!this.game) return;
    const def = this.gameDef(this.game.gameId);
    this.game.deadline = def ? def.nextDeadline(this.game.state) : null;
  }

  // ---------- public API ----------

  setPackCatalog(packs: PackMeta[], now: number): HandleResult {
    const out = newOut();
    const beforeCatalog = JSON.stringify(this.packCatalog);
    const nextEnabled: Record<string, boolean> = {};
    for (const p of packs)
      nextEnabled[p.id] = this.enabledAfterCatalogRefresh(p);
    const beforeEnabled = JSON.stringify(this.packEnabled);
    this.packCatalog = packs.map((p) => ({ ...p }));
    this.packEnabled = nextEnabled;
    if (
      JSON.stringify(this.packCatalog) !== beforeCatalog ||
      JSON.stringify(this.packEnabled) !== beforeEnabled
    ) {
      out.changed = true;
    }
    this.syncEmpty(now);
    return result(out);
  }

  /** A pack keeps the room's explicit choice; a newly seen pack defaults on unless it is adult-only. */
  private enabledAfterCatalogRefresh(pack: PackMeta): boolean {
    return Object.hasOwn(this.packEnabled, pack.id)
      ? this.packEnabled[pack.id] === true
      : pack.rating !== "adult";
  }

  handle(caller: Caller, message: ClientMessage, now: number): HandleResult {
    const out = newOut();
    if (isGameMessage(message)) {
      this.applyGameMessage(caller, message, now, out);
    } else if (isVipMessage(message)) {
      this.applyVipMessage(caller, message, now, out);
    } else {
      this.applyLobbyMessage(caller, message, now, out);
    }
    this.syncEmpty(now);
    return result(out);
  }

  private applyLobbyMessage(
    caller: Caller,
    message: RoomMessage,
    now: number,
    out: Out,
  ): void {
    switch (message.t) {
      case "host-hello":
        this.onHostHello(message.hostToken, now, out);
        break;
      case "join":
        this.onJoin(message, now, out);
        break;
      case "set-avatar":
        this.onSetAvatar(caller, message.avatar, out);
        break;
    }
  }

  private applyVipMessage(
    caller: Caller,
    message: VipMessage,
    now: number,
    out: Out,
  ): void {
    switch (message.t) {
      case "pick-game":
        this.onPickGame(caller, message.gameId, out);
        break;
      case "set-pack":
        this.onSetPack(caller, message.packId, message.enabled, out);
        break;
      case "set-locked":
        this.onSetLocked(caller, message.locked, now, out);
        break;
      case "kick":
        this.onKick(caller, message.playerId, now, out);
        break;
      case "start-game":
        this.onStartGame(caller, now, out);
        break;
    }
  }

  private applyGameMessage(
    caller: Caller,
    message: GameMessage,
    now: number,
    out: Out,
  ): void {
    switch (message.t) {
      case "skip-phase":
        this.onSkipPhase(caller, now, out);
        break;
      case "end-game":
        this.onEndGame(caller, now, out);
        break;
      case "game-action":
        this.onGameAction(caller, message.action, now, out);
        break;
    }
  }

  beginGame(content: GameContent, now: number): HandleResult {
    const out = newOut();
    if (this.phase !== "starting" || !this.pending) return result(out);
    const def = this.gameDef(this.pending.gameId);
    if (
      !def ||
      content.kind !== def.contentKind ||
      content.items.length === 0
    ) {
      this.abortStartNow(now, out);
      return result(out);
    }
    const playerIds = this.pending.playerIds.filter(
      (id) => this.getPlayer(id) !== undefined,
    );
    const state = def.setup(this.makeCtx({ playerIds, content }, now));
    this.game = {
      gameId: def.id,
      state,
      playerIds,
      content,
      deadline: def.nextDeadline(state),
      startedAt: now,
    };
    this.pending = null;
    this.phase = "in-game";
    out.changed = true;
    this.checkGameOver(now, out);
    this.syncEmpty(now);
    return result(out);
  }

  abortStart(now: number): HandleResult {
    const out = newOut();
    this.abortStartNow(now, out);
    this.syncEmpty(now);
    return result(out);
  }

  private abortStartNow(now: number, out: Out): void {
    if (this.phase !== "starting") return;
    this.phase = "lobby";
    this.pending = null;
    out.changed = true;
    void now;
  }

  tick(now: number): HandleResult {
    const out = newOut();
    for (let i = 0; i < MAX_TICK_ITERATIONS; i++) {
      if (!this.applyDeadline(now, out)) break;
    }
    // VIP disconnected for more than 60s hands the crown to the earliest connected player.
    this.ensureVip(now, out);
    this.syncEmpty(now);
    return result(out);
  }

  /** Applies one due deadline; returns false once nothing more is due (or the game finished). */
  private applyDeadline(now: number, out: Out): boolean {
    const game = this.game;
    if (this.phase !== "in-game" || !game) return false;
    const def = this.gameDef(game.gameId);
    if (!def) return false;
    const deadline = def.nextDeadline(game.state);
    if (deadline === null || deadline > now) return false;
    const before = game.state;
    game.state = def.onDeadline(game.state, this.makeCtx(game, now));
    this.refreshDeadline();
    out.changed = true;
    this.checkGameOver(now, out);
    return this.deadlineMoved(game, def, before, deadline);
  }

  /** False when the game finished or the deadline handler left state and clock unchanged. */
  private deadlineMoved(
    game: GameRuntime,
    def: AnyGame,
    before: GameRuntime["state"],
    deadline: number,
  ): boolean {
    if (this.game !== game) return false;
    return game.state !== before || def.nextDeadline(game.state) !== deadline;
  }

  setConnected(
    playerId: PlayerId,
    connected: boolean,
    now: number,
  ): HandleResult {
    const out = newOut();
    const p = this.getPlayer(playerId);
    if (!p) return result(out);
    if (p.connected !== connected) {
      p.connected = connected;
      p.disconnectedAt = connected ? null : now;
      out.changed = true;
      this.ensureVip(now, out);
    }
    this.syncEmpty(now);
    return result(out);
  }

  setHostConnected(connected: boolean, now: number): HandleResult {
    const out = newOut();
    // Host presence is not part of any view, so no rebroadcast is needed.
    this.hostConnected = connected;
    this.syncEmpty(now);
    return result(out);
  }

  nextDeadline(): number | null {
    const deadlines: number[] = [];
    this.collectGameDeadline(deadlines);
    this.collectVipDeadline(deadlines);
    return deadlines.length > 0 ? Math.min(...deadlines) : null;
  }

  private collectGameDeadline(deadlines: number[]): void {
    if (this.phase !== "in-game" || !this.game) return;
    const def = this.gameDef(this.game.gameId);
    const deadline = def ? def.nextDeadline(this.game.state) : null;
    if (deadline !== null) deadlines.push(deadline);
  }

  private collectVipDeadline(deadlines: number[]): void {
    const vip = this.vipId ? this.getPlayer(this.vipId) : undefined;
    if (!vip || vip.connected || vip.disconnectedAt === null) return;
    deadlines.push(vip.disconnectedAt + VIP_GRACE_MS);
  }

  hostView(now: number): HostRoomView {
    const base = this.roomBase(now);
    return { ...base, role: "host", game: this.activeGame(now, "host") };
  }

  playerView(playerId: PlayerId, now: number): PlayerRoomView {
    const base = this.roomBase(now);
    return {
      ...base,
      role: "player",
      you: playerId,
      game: this.activeGame(now, "player", playerId),
    };
  }

  playerIds(): PlayerId[] {
    return this.players.map((p) => p.id);
  }

  snapshot(): RoomSnapshot {
    const state: InternalState = {
      code: this.code,
      hostToken: this.hostToken,
      rng: this.rng.state(),
      players: this.players.map((p) => ({ ...p })),
      orderSeq: this.orderSeq,
      vipId: this.vipId,
      locked: this.locked,
      selectedGameId: this.selectedGameId,
      lobbyScreen: this.lobbyScreen,
      phase: this.phase,
      packCatalog: this.packCatalog.map((p) => ({ ...p })),
      packEnabled: { ...this.packEnabled },
      lastResult: this.lastResult,
      game: this.game,
      pending: this.pending,
      hostConnected: this.hostConnected,
      emptySince: this.emptySince,
    };
    return { version: 1, data: JSON.stringify(state) };
  }

  isIdleSince(now: number, idleMs: number): boolean {
    if (this.hasConnection()) return false;
    if (this.phase !== "lobby") return false;
    const since = this.emptySince ?? now;
    return now - since >= idleMs;
  }

  // ---------- message handlers ----------

  private onHostHello(token: string, now: number, out: Out): void {
    if (token !== this.hostToken) {
      this.fail(out, "host-token-invalid", "That host link is not valid.");
      return;
    }
    out.reply.push({ t: "welcome", role: "host" });
    if (!this.hostConnected) {
      this.hostConnected = true;
      this.syncEmpty(now);
    }
  }

  private onJoin(
    message: Extract<ClientMessage, { t: "join" }>,
    now: number,
    out: Out,
  ): void {
    if (
      message.token !== undefined &&
      this.tryRejoin(message.token, now, out)
    ) {
      return;
    }
    this.addPlayer(message.name, now, out);
  }

  /** Reconnects an existing seat; returns false when the token matches nobody. */
  private tryRejoin(token: string, now: number, out: Out): boolean {
    const existing = this.players.find((p) => p.token === token);
    if (!existing) return false;
    if (!existing.connected) {
      existing.connected = true;
      existing.disconnectedAt = null;
      out.changed = true;
      this.ensureVip(now, out);
    }
    out.reply.push({
      t: "welcome",
      role: "player",
      playerId: existing.id,
      token: existing.token,
    });
    this.syncEmpty(now);
    return true;
  }

  private addPlayer(rawName: string, now: number, out: Out): void {
    const name = cleanPlayerName(rawName);
    if (name === null) {
      this.fail(out, "name-invalid", "Pick a name up to 12 characters.");
      return;
    }
    const lower = name.toLowerCase();
    if (this.players.some((p) => p.name.toLowerCase() === lower)) {
      this.fail(out, "name-taken", "That name is taken.");
      return;
    }
    if (this.players.length >= MAX_PLAYERS) {
      this.fail(out, "room-full", "This room is full.");
      return;
    }
    if (this.locked) {
      this.fail(out, "room-locked", "This room is locked.");
      return;
    }

    const record = this.newPlayerRecord(name);
    this.players.push(record);
    out.reply.push({
      t: "welcome",
      role: "player",
      playerId: record.id,
      token: record.token,
    });
    out.changed = true;
    this.ensureVip(now, out);
    this.syncEmpty(now);
  }

  private newPlayerRecord(name: string): PlayerRecord {
    const id = this.newToken();
    const playerToken = this.newToken();
    return {
      id,
      token: playerToken,
      name,
      avatar: this.firstFreeAvatar(),
      crowns: 0,
      order: this.orderSeq++,
      connected: true,
      waitingForNextGame: this.phase !== "lobby",
      disconnectedAt: null,
    };
  }

  private firstFreeAvatar(): AvatarId | null {
    const taken = new Set<string>();
    for (const p of this.players) if (p.avatar) taken.add(p.avatar);
    for (const a of AVATARS) if (!taken.has(a)) return a;
    return null;
  }

  private onSetAvatar(caller: Caller, avatar: AvatarId, out: Out): void {
    const player =
      caller.kind === "player" ? this.getPlayer(caller.playerId) : undefined;
    if (!player) {
      this.fail(out, "not-joined", "Join the room before picking an avatar.");
      return;
    }
    if (this.players.some((p) => p.id !== player.id && p.avatar === avatar)) {
      this.fail(out, "avatar-taken", "That avatar is taken.");
      return;
    }
    if (player.avatar !== avatar) {
      player.avatar = avatar;
      out.changed = true;
    }
  }

  private onPickGame(caller: Caller, gameId: string, out: Out): void {
    if (!this.requireVip(caller, out)) return;
    if (this.phase !== "lobby") {
      this.fail(out, "invalid-action", "That is not available right now.");
      return;
    }
    if (!this.games.some((g) => g.id === gameId)) {
      this.fail(out, "invalid-action", "That game does not exist.");
      return;
    }
    if (this.selectedGameId !== gameId) {
      this.selectedGameId = gameId;
      out.changed = true;
    }
    if (this.lobbyScreen !== "pick") {
      this.lobbyScreen = "pick";
      out.changed = true;
    }
  }

  private onSetPack(
    caller: Caller,
    packId: string,
    enabled: boolean,
    out: Out,
  ): void {
    if (!this.requireVip(caller, out)) return;
    if (this.phase !== "lobby") {
      this.fail(out, "invalid-action", "That is not available right now.");
      return;
    }
    if (!this.packFitsSelectedGame(packId)) {
      this.fail(out, "invalid-action", "That pack does not fit this game.");
      return;
    }
    this.setPackEnabled(packId, enabled, out);
  }

  private packFitsSelectedGame(packId: string): boolean {
    const pack = this.packCatalog.find((p) => p.id === packId);
    if (!pack) return false;
    const kind = this.selectedGame()?.contentKind;
    return kind !== undefined && pack.kind === kind;
  }

  private setPackEnabled(packId: string, enabled: boolean, out: Out): void {
    if (this.packEnabled[packId] !== enabled) {
      this.packEnabled[packId] = enabled;
      out.changed = true;
    }
    if (this.lobbyScreen !== "pick") {
      this.lobbyScreen = "pick";
      out.changed = true;
    }
  }

  private onSetLocked(
    caller: Caller,
    locked: boolean,
    _now: number,
    out: Out,
  ): void {
    if (!this.requireVip(caller, out)) return;
    if (this.locked !== locked) {
      this.locked = locked;
      out.changed = true;
    }
  }

  private onKick(
    caller: Caller,
    targetId: PlayerId,
    now: number,
    out: Out,
  ): void {
    if (!this.requireVip(caller, out)) return;
    if (caller.kind !== "player" || targetId === caller.playerId) {
      this.fail(out, "invalid-action", "You cannot kick yourself.");
      return;
    }
    const target = this.getPlayer(targetId);
    if (!target) {
      this.fail(out, "invalid-action", "That player is not here.");
      return;
    }

    this.players = this.players.filter((p) => p.id !== targetId);
    out.effects.push({ type: "disconnect-player", playerId: targetId });
    out.changed = true;

    this.removeFromRunningGame(targetId, now, out);
    this.ensureVip(now, out);
    this.syncEmpty(now);
  }

  /** Drops a kicked player from the running game and ends it if the room falls below its minimum. */
  private removeFromRunningGame(
    targetId: PlayerId,
    now: number,
    out: Out,
  ): void {
    const game = this.game;
    if (
      this.phase !== "in-game" ||
      !game ||
      !game.playerIds.includes(targetId)
    ) {
      return;
    }
    const def = this.gameDef(game.gameId);
    game.playerIds = game.playerIds.filter((id) => id !== targetId);
    if (!def) return;
    game.state = def.onPlayerRemoved(
      game.state,
      targetId,
      this.makeCtx(game, now),
    );
    this.refreshDeadline();
    if (game.playerIds.length < def.minPlayers) {
      this.finishGame(now, false, out);
    } else {
      this.checkGameOver(now, out);
    }
  }

  private onStartGame(caller: Caller, _now: number, out: Out): void {
    if (!this.requireVip(caller, out)) return;
    if (this.phase !== "lobby") {
      this.fail(out, "invalid-action", "That is not available right now.");
      return;
    }
    const def = this.selectedGame();
    if (!def) {
      this.fail(out, "invalid-action", "Pick a game first.");
      return;
    }
    const ready = this.players.filter(
      (p) => p.connected && !p.waitingForNextGame,
    );
    if (ready.length < def.minPlayers) {
      this.fail(out, "not-enough-players", "You need more players to start.");
      return;
    }
    const packIds = this.enabledPackIds(def.contentKind);
    if (packIds.length === 0) {
      this.fail(out, "invalid-action", "Turn on a pack to start.");
      return;
    }
    // Game players are every non-waiting player at this moment, including one who is
    // briefly disconnected (their seat and reconnect token survive). The connected
    // count above is what gates whether the game may start.
    this.phase = "starting";
    this.pending = {
      gameId: def.id,
      playerIds: this.players
        .filter((p) => !p.waitingForNextGame)
        .map((p) => p.id),
    };
    out.effects.push({ type: "load-content", kind: def.contentKind, packIds });
    out.changed = true;
  }

  private onSkipPhase(caller: Caller, now: number, out: Out): void {
    if (!this.requireVip(caller, out)) return;
    const def =
      this.game && this.phase === "in-game"
        ? this.gameDef(this.game.gameId)
        : undefined;
    if (!def || !this.game) {
      this.fail(out, "invalid-action", "That is not available right now.");
      return;
    }
    this.game.state = def.onDeadline(
      this.game.state,
      this.makeCtx(this.game, now),
    );
    this.refreshDeadline();
    out.changed = true;
    this.checkGameOver(now, out);
  }

  private onEndGame(caller: Caller, now: number, out: Out): void {
    if (!this.requireVip(caller, out)) return;
    if (!this.game || this.phase !== "in-game") {
      this.fail(out, "invalid-action", "That is not available right now.");
      return;
    }
    this.finishGame(now, false, out);
  }

  private onGameAction(
    caller: Caller,
    raw: GameActionPayload,
    now: number,
    out: Out,
  ): void {
    if (caller.kind !== "player") {
      this.fail(out, "not-joined", "Join the room before playing.");
      return;
    }
    const player = this.getPlayer(caller.playerId);
    if (!player) {
      this.fail(out, "not-joined", "Join the room before playing.");
      return;
    }
    if (
      !this.game ||
      this.phase !== "in-game" ||
      !this.game.playerIds.includes(player.id)
    ) {
      this.fail(out, "invalid-action", "You are not in this game.");
      return;
    }
    this.runGameAction(player.id, raw, now, out);
  }

  private runGameAction(
    playerId: PlayerId,
    raw: GameActionPayload,
    now: number,
    out: Out,
  ): void {
    const game = this.game;
    if (!game) return;
    const def = this.gameDef(game.gameId);
    if (!def) {
      this.fail(out, "invalid-action", "That is not available right now.");
      return;
    }
    const parsed = def.actionSchema.safeParse(raw);
    if (!parsed.success) {
      this.fail(out, "invalid-action", "That move is not valid.");
      return;
    }
    const next = def.onAction(
      game.state,
      playerId,
      parsed.data,
      this.makeCtx(game, now),
    );
    if (next === game.state) return;
    game.state = next;
    this.refreshDeadline();
    out.changed = true;
    this.checkGameOver(now, out);
  }

  // ---------- game lifecycle ----------

  private checkGameOver(now: number, out: Out): void {
    if (!this.game || this.phase !== "in-game") return;
    const def = this.gameDef(this.game.gameId);
    if (!def || !def.isOver(this.game.state)) return;
    this.finishGame(now, true, out);
  }

  private finishGame(now: number, completed: boolean, out: Out): void {
    const game = this.game;
    if (!game) return;
    const def = this.gameDef(game.gameId);
    const scores = this.collectScores(game, def);
    const winnerIds = this.awardCrowns(game, scores, completed);

    this.lastResult = { gameId: game.gameId, scores, winnerIds };
    this.phase = "lobby";
    this.lobbyScreen = "results";
    for (const p of this.players) p.waitingForNextGame = false;
    out.effects.push({
      type: "game-finished",
      gameId: game.gameId,
      playerCount: game.playerIds.length,
      durationMs: now - game.startedAt,
      completed,
    });
    this.game = null;
    this.pending = null;
    out.changed = true;
  }

  private collectScores(game: GameRuntime, def: AnyGame | undefined) {
    const raw: Record<PlayerId, number> = def ? def.scores(game.state) : {};
    const scores: Record<PlayerId, number> = {};
    for (const id of game.playerIds) scores[id] = raw[id] ?? 0;
    return scores;
  }

  /** Crowns every top scorer when the game actually completed; a forgotten game awards none. */
  private awardCrowns(
    game: GameRuntime,
    scores: Record<PlayerId, number>,
    completed: boolean,
  ): PlayerId[] {
    if (!completed) return [];
    const top = this.topScore(game, scores);
    if (top <= 0) return [];
    const winnerIds = game.playerIds.filter((id) => (scores[id] ?? 0) === top);
    this.crown(winnerIds);
    return winnerIds;
  }

  private topScore(
    game: GameRuntime,
    scores: Record<PlayerId, number>,
  ): number {
    let top = 0;
    for (const id of game.playerIds) top = Math.max(top, scores[id] ?? 0);
    return top;
  }

  private crown(winnerIds: PlayerId[]): void {
    for (const id of winnerIds) {
      const p = this.getPlayer(id);
      if (p) p.crowns += 1;
    }
  }

  // ---------- views ----------

  private roomBase(now: number): Omit<RoomViewBase, "game"> {
    return {
      code: this.code,
      phase: this.phase,
      lobbyScreen: this.lobbyScreen,
      players: this.players.map((p) => this.summarize(p)),
      vipId: this.vipId,
      locked: this.locked,
      games: this.games.map((g) => ({
        id: g.id,
        name: g.name,
        blurb: g.blurb,
        minPlayers: g.minPlayers,
        maxPlayers: g.maxPlayers,
        minutes: g.minutes,
      })),
      selectedGameId: this.selectedGameId,
      packs: this.packSummaries(),
      lastResult: this.lastResult,
      serverNow: now,
    };
  }

  private summarize(p: PlayerRecord): PlayerSummary {
    return {
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      connected: p.connected,
      isVip: p.id === this.vipId,
      crowns: p.crowns,
      waitingForNextGame: p.waitingForNextGame,
    };
  }

  private packSummaries(): PackSummary[] {
    const kind = this.selectedGame()?.contentKind;
    if (kind === undefined) return [];
    return this.packCatalog
      .filter((p) => p.kind === kind)
      .map((p) => ({
        id: p.id,
        name: p.name,
        rating: p.rating,
        enabled: this.packEnabled[p.id] === true,
        itemCount: p.itemCount,
      }));
  }

  private activeGame(
    now: number,
    role: "host" | "player",
    playerId?: PlayerId,
  ): ActiveGameView | null {
    const game = this.game;
    if (this.phase !== "in-game" || !game) return null;
    const def = this.gameDef(game.gameId);
    if (!def) return null;
    const base = { id: game.gameId, deadline: game.deadline };
    if (role === "host")
      return { ...base, view: def.hostView(game.state, { now }) };
    if (playerId === undefined || !game.playerIds.includes(playerId)) {
      return { ...base, view: null };
    }
    return { ...base, view: def.playerView(game.state, playerId, { now }) };
  }
}

export function createRoom(options: CreateRoomOptions): RoomCore {
  const games = options.games;
  const [firstGame] = games;
  const firstGameId = firstGame ? firstGame.id : "";
  const state: InternalState = {
    code: options.code,
    hostToken: options.hostToken,
    rng: createRng(options.seed).state(),
    players: [],
    orderSeq: 0,
    vipId: null,
    locked: false,
    selectedGameId: firstGameId,
    lobbyScreen: "join",
    phase: "lobby",
    packCatalog: [],
    packEnabled: {},
    lastResult: null,
    game: null,
    pending: null,
    hostConnected: false,
    emptySince: options.now,
  };
  return new RoomImpl(state, games, options.newToken);
}

function blankState(): InternalState {
  return {
    code: "",
    hostToken: "",
    rng: 0,
    players: [],
    orderSeq: 0,
    vipId: null,
    locked: false,
    selectedGameId: "",
    lobbyScreen: "join",
    phase: "lobby",
    packCatalog: [],
    packEnabled: {},
    lastResult: null,
    game: null,
    pending: null,
    hostConnected: false,
    emptySince: null,
  };
}

export function restoreRoom(
  snapshot: RoomSnapshot,
  games: AnyGame[],
  newToken: () => string,
): RoomCore {
  if (snapshot.version !== 1)
    throw new Error(
      `unsupported room snapshot version: ${String(snapshot.version)}`,
    );
  // The data was produced by snapshot() from an InternalState; fields missing from older
  // snapshots fall back to the blank state's defaults.
  const persisted: Partial<InternalState> = JSON.parse(snapshot.data);
  const state = Object.assign(blankState(), persisted);
  return new RoomImpl(state, games, newToken);
}
