// RoomCore: the pure, deterministic room + game engine. The Durable Object is a thin
// adapter around it. No Date.now(), Math.random(), timers, crypto or I/O live here:
// the adapter feeds in the clock, and ids/tokens come only from options.newToken.

import {
  AVATARS,
  MAX_AWARDS,
  MAX_PLAYERS,
  cleanPlayerName,
  type ActiveGameView,
  type Award,
  type AvatarId,
  type ClientMessage,
  type ContentLanguage,
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
  /** Epoch ms the current deadline was set; optional because pre-change snapshots lack it. */
  timerStartedAt?: number | null;
  startedAt: number;
}

interface PendingStart {
  gameId: string;
  playerIds: PlayerId[];
}

/**
 * The result as persisted. Older snapshots only ever wrote `gameId`, `scores` and
 * `winnerIds`, so the fields added later are optional here; `resultSummary` fills
 * in their defaults for the view.
 */
interface StoredResult {
  gameId?: string;
  scores?: Record<PlayerId, number>;
  winnerIds?: PlayerId[];
  completed?: boolean;
  finishedAt?: number;
  awards?: Award[];
}

/** Fields older snapshots never wrote, defaulted once so the view type always holds. */
function storedBase(
  stored: StoredResult,
): Pick<GameResultSummary, "gameId" | "scores" | "winnerIds"> {
  return {
    gameId: stored.gameId ?? "",
    scores: stored.scores ?? {},
    winnerIds: stored.winnerIds ?? [],
  };
}

/** Normalizes a persisted result into the view shape, defaulting fields older snapshots lack. */
export function resultSummary(stored: StoredResult): GameResultSummary {
  const base = storedBase(stored);
  return {
    ...base,
    // Snapshots from before `completed` existed used an empty crown list to mean
    // "ended early", so this heuristic reconstructs the flag rather than guessing true.
    completed: stored.completed ?? base.winnerIds.length > 0,
    finishedAt: stored.finishedAt ?? 0,
    awards: stored.awards ?? [],
  };
}

/**
 * Keeps only players still in the game, drops awards left with no players, and caps
 * the list at MAX_AWARDS while keeping order. Pure so tests can call it directly.
 */
export function sanitizeAwards(
  awards: readonly Award[],
  playerIds: readonly PlayerId[],
): Award[] {
  const roster = new Set(playerIds);
  const kept: Award[] = [];
  for (const award of awards) {
    if (kept.length >= MAX_AWARDS) break;
    const ids = award.playerIds.filter((id) => roster.has(id));
    if (ids.length === 0) continue;
    kept.push({ ...award, playerIds: ids });
  }
  return kept;
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
  lastResult: StoredResult | null;
  game: GameRuntime | null;
  pending: PendingStart | null;
  hostConnected: boolean;
  emptySince: number | null;
  /** False in a no-TV room. Snapshots saved before this field existed lack it; blankState() defaults it to true on restore. */
  sharedScreen: boolean;
  /** Which packs the room draws from. Snapshots saved before this field existed lack it; blankState() defaults it to "en" on restore. */
  contentLanguage: ContentLanguage;
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
  {
    t:
      | "pick-game"
      | "set-pack"
      | "set-locked"
      | "set-shared-screen"
      | "kick"
      | "start-game";
  }
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
    message.t === "set-shared-screen" ||
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
  private lastResult: StoredResult | null;
  private game: GameRuntime | null;
  private pending: PendingStart | null;
  private hostConnected: boolean;
  private emptySince: number | null;
  private sharedScreen: boolean;
  private contentLanguage: ContentLanguage;

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
          winnerIds: [...(state.lastResult.winnerIds ?? [])],
          awards: state.lastResult.awards?.map((a) => ({
            ...a,
            playerIds: [...a.playerIds],
          })),
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
    this.sharedScreen = state.sharedScreen;
    this.contentLanguage = state.contentLanguage;
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

  /**
   * The catalog restricted to the room's content language: a Hebrew room never sees an
   * English pack, so it can never enable one, toggle one, or fall back to one.
   */
  private packsInLanguage(kind: ContentKind): PackMeta[] {
    return this.packCatalog.filter(
      (p) => p.kind === kind && p.language === this.contentLanguage,
    );
  }

  private enabledPackIds(kind: ContentKind): string[] {
    return this.packsInLanguage(kind)
      .filter((p) => this.packEnabled[p.id] === true)
      .map((p) => p.id);
  }

  private hasConnection(): boolean {
    return this.hostConnected || this.players.some((p) => p.connected);
  }

  /** The idle clock is persisted, so moving it counts as a change to the room. */
  private syncEmpty(now: number, out: Out): void {
    if (this.hasConnection()) {
      if (this.emptySince === null) return;
      this.emptySince = null;
    } else {
      if (this.emptySince !== null) return;
      this.emptySince = now;
    }
    out.changed = true;
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

  /**
   * Recomputes the deadline and re-anchors `timerStartedAt` whenever its value changes.
   * A new phase always gets `ctx.now + duration`, which differs from the old deadline unless the
   * phase began in the same millisecond the previous one did, so value equality means "no change".
   */
  private setDeadline(now: number): void {
    if (!this.game) return;
    const def = this.gameDef(this.game.gameId);
    const next = def ? def.nextDeadline(this.game.state) : null;
    if (next === this.game.deadline) return;
    this.game.deadline = next;
    this.game.timerStartedAt = next === null ? null : now;
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
    this.syncEmpty(now, out);
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
    this.syncEmpty(now, out);
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
      case "set-shared-screen":
        this.onSetSharedScreen(caller, message.sharedScreen, out);
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
    const deadline = def.nextDeadline(state);
    this.game = {
      gameId: def.id,
      state,
      playerIds,
      content,
      deadline,
      timerStartedAt: deadline === null ? null : now,
      startedAt: now,
    };
    this.pending = null;
    this.phase = "in-game";
    out.changed = true;
    this.checkGameOver(now, out);
    this.syncEmpty(now, out);
    return result(out);
  }

  abortStart(now: number): HandleResult {
    const out = newOut();
    this.abortStartNow(now, out);
    this.syncEmpty(now, out);
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
    this.syncEmpty(now, out);
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
    this.setDeadline(now);
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
      this.notifyPlayersChanged(now, out);
    }
    this.syncEmpty(now, out);
    return result(out);
  }

  /** Gives the running game a chance to react to a connection flip, e.g. skip an absent speaker. */
  private notifyPlayersChanged(now: number, out: Out): void {
    const game = this.game;
    if (this.phase !== "in-game" || !game) return;
    const def = this.gameDef(game.gameId);
    if (!def?.onPlayersChanged) return;
    const next = def.onPlayersChanged(game.state, this.makeCtx(game, now));
    if (next === game.state) return;
    game.state = next;
    this.setDeadline(now);
    out.changed = true;
    this.checkGameOver(now, out);
  }

  setHostConnected(connected: boolean, now: number): HandleResult {
    const out = newOut();
    // Host presence is not part of any view, but it is part of the snapshot: the idle
    // sweep reads it after a restart, so a change here must be persisted.
    if (this.hostConnected !== connected) {
      this.hostConnected = connected;
      out.changed = true;
    }
    this.syncEmpty(now, out);
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
      sharedScreen: this.sharedScreen,
      contentLanguage: this.contentLanguage,
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
      out.changed = true;
      this.syncEmpty(now, out);
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
    this.syncEmpty(now, out);
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
    this.syncEmpty(now, out);
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

  private onSetSharedScreen(
    caller: Caller,
    sharedScreen: boolean,
    out: Out,
  ): void {
    if (!this.requireVip(caller, out)) return;
    if (this.phase !== "lobby") {
      this.fail(out, "invalid-action", "That is not available right now.");
      return;
    }
    if (this.sharedScreen !== sharedScreen) {
      this.sharedScreen = sharedScreen;
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
    this.syncEmpty(now, out);
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
    this.setDeadline(now);
    if (game.playerIds.length < def.minPlayers) {
      this.finishGame(now, false, out);
    } else {
      this.checkGameOver(now, out);
    }
  }

  /** False when the selected game cannot run in the room's current mode. */
  private requireStartableMode(def: AnyGame, out: Out): boolean {
    if (this.sharedScreen || def.noTv === true) return true;
    this.fail(out, "invalid-action", "This game plays on a shared screen.");
    return false;
  }

  /**
   * No pack is enabled for this game right now. Distinguishes "nothing exists in this
   * room's language" (the VIP has nothing to turn on) from "the VIP turned every pack off".
   */
  private failToStart(def: AnyGame, out: Out): void {
    if (this.packsInLanguage(def.contentKind).length === 0) {
      this.fail(out, "no-language-packs", `${def.name} plays in a different language than this room.`);
      return;
    }
    this.fail(out, "invalid-action", "Turn on a pack to start.");
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
    if (!this.requireStartableMode(def, out)) return;
    const ready = this.players.filter(
      (p) => p.connected && !p.waitingForNextGame,
    );
    if (ready.length < def.minPlayers) {
      this.fail(out, "not-enough-players", "You need more players to start.");
      return;
    }
    const packIds = this.enabledPackIds(def.contentKind);
    if (packIds.length === 0) {
      this.failToStart(def, out);
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
    this.setDeadline(now);
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
    this.setDeadline(now);
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
    const awards = this.gameAwards(game, def, completed);

    this.lastResult = {
      gameId: game.gameId,
      scores,
      winnerIds,
      completed,
      finishedAt: now,
      awards,
    };
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

  /** Only a completed game gets awards; they are sanitized against the surviving roster. */
  private gameAwards(
    game: GameRuntime,
    def: AnyGame | undefined,
    completed: boolean,
  ): Award[] {
    if (!completed) return [];
    return sanitizeAwards(def?.awards?.(game.state) ?? [], game.playerIds);
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
        noTv: g.noTv === true,
        hasContentInLanguage: this.packsInLanguage(g.contentKind).length > 0,
      })),
      selectedGameId: this.selectedGameId,
      packs: this.packSummaries(),
      lastResult: this.lastResult ? resultSummary(this.lastResult) : null,
      serverNow: now,
      sharedScreen: this.sharedScreen,
      contentLanguage: this.contentLanguage,
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
    return this.packsInLanguage(kind)
      .map((p) => ({
        id: p.id,
        name: p.name,
        rating: p.rating,
        enabled: this.packEnabled[p.id] === true,
        itemCount: p.itemCount,
      }));
  }

  /** The shared envelope every active-game view carries. */
  private gameViewBase(game: GameRuntime) {
    return {
      id: game.gameId,
      deadline: game.deadline,
      timerStartedAt: game.timerStartedAt ?? null,
    };
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
    const base = this.gameViewBase(game);
    // The host already has the host view in `view`, so the stage would be redundant.
    if (role === "host")
      return { ...base, view: def.hostView(game.state, { now }), stage: null };
    return { ...base, ...this.playerGameView(game, def, now, playerId) };
  }

  /** A player's own view, plus the stage they share with the room when there is no TV. */
  private playerGameView(
    game: GameRuntime,
    def: AnyGame,
    now: number,
    playerId?: PlayerId,
  ): Pick<ActiveGameView, "view" | "stage"> {
    if (playerId === undefined || !game.playerIds.includes(playerId)) {
      return { view: null, stage: null };
    }
    // `stage` is literally the host view in a no-TV room: a game can never put
    // something on it that is not already on the TV.
    return {
      view: def.playerView(game.state, playerId, { now }),
      stage: this.sharedScreen ? null : def.hostView(game.state, { now }),
    };
  }
}

/**
 * The game a new room starts on. A room with no shared screen prefers a game it can
 * actually start, so the VIP does not open the picker on a game that refuses to run.
 * Falls back to the first game when none supports the mode; the picker then says why.
 */
function defaultGameId(games: readonly AnyGame[], sharedScreen: boolean): string {
  const playable = sharedScreen ? games[0] : (games.find((g) => g.noTv === true) ?? games[0]);
  return playable ? playable.id : "";
}

export function createRoom(options: CreateRoomOptions): RoomCore {
  const games = options.games;
  const firstGameId = defaultGameId(games, options.sharedScreen ?? true);
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
    sharedScreen: options.sharedScreen ?? true,
    contentLanguage: options.contentLanguage ?? "en",
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
    sharedScreen: true,
    contentLanguage: "en",
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
  let persisted: Partial<InternalState> = {};
  try {
    persisted = JSON.parse(snapshot.data);
  } catch {
    // A corrupted snapshot restarts the room as blank instead of leaving it unloadable.
  }
  const state = Object.assign(blankState(), persisted);
  // A snapshot written by an older build (or a corrupted one) can lack the fields the
  // constructor reads, so normalize the result once here instead of throwing on restore.
  if (state.lastResult !== null)
    state.lastResult = resultSummary(state.lastResult);
  return new RoomImpl(state, games, newToken);
}
