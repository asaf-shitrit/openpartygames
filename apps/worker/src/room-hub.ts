import {
  MAX_PLAYERS,
  normalizeRoomCode,
  parseClientMessage,
  ROOM_CODE_RE,
  type ContentLanguage,
  type RoomInfoResponse,
  type ServerMessage,
} from "@opg/protocol";
import {
  createRoom,
  restoreRoom,
  type AnyGame,
  type Caller,
  type ContentSource,
  type HandleResult,
  type PackMeta,
  type RoomCore,
  type RoomEffect,
  type RoomSnapshot,
} from "@opg/sdk";
import { newBudget, spend, type Budget } from "./message-budget";
import type { MatchStats } from "./stats";

/** Snapshot key inside Durable Object storage. */
export const ROOM_KEY = "room";
/** A room with no connections and no running game is deleted after this long. */
export const IDLE_MS = 2 * 60 * 60 * 1000;
/** Close code sent to kicked and idle sockets. */
const KICK = 1000;

export const ANONYMOUS_CALLER: Caller = { kind: "anonymous" };
const HOST_CALLER: Caller = { kind: "host" };

const BAD_MESSAGE: ServerMessage = {
  t: "error",
  code: "bad-message",
  message: "Malformed message.",
};
const NO_ROOM: ServerMessage = {
  t: "error",
  code: "room-not-found",
  message: "This room is gone.",
};
const RATE_LIMITED: ServerMessage = {
  t: "error",
  code: "rate-limited",
  message: "Slow down a moment.",
};

/** One accepted socket. The Durable Object adapter wraps Cloudflare's WebSocket in this. */
export interface HubSocket {
  send(message: ServerMessage): void;
  close(code: number, reason: string): void;
  caller(): Caller;
  setCaller(caller: Caller): void;
}

/** Every socket the adapter holds, including sockets restored after hibernation. */
export interface HubSockets {
  all(): HubSocket[];
  add(socket: HubSocket): void;
}

/** The slice of Durable Object storage the hub uses. */
export interface HubStorage {
  get(): Promise<RoomSnapshot | undefined>;
  put(snapshot: RoomSnapshot): Promise<void>;
  deleteAll(): Promise<void>;
  setAlarm(at: number): Promise<void>;
}

/** Where finished games are recorded. */
export interface StatsRecorder {
  record(stats: MatchStats): Promise<void>;
}

export interface HubOptions {
  games: AnyGame[];
  content: ContentSource;
  storage: HubStorage;
  sockets: HubSockets;
  stats: StatsRecorder;
  now: () => number;
  newToken: () => string;
  seed: () => number;
}

/** A freshly accepted socket and the 101 response that carries it back to the client. */
export interface OpenedSocket {
  response: Response;
  socket: HubSocket;
}

/** Room code from a WebSocket URL, normalized; null when the URL is unusable. */
export function roomCodeFromUrl(url: string): string | null {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return null;
  }
  return roomCodeFromPath(pathname);
}

/** Room code form of a pathname: the last segment, when it looks like a code. */
export function roomCodeFromPath(pathname: string): string | null {
  const code = normalizeRoomCode(pathname.split("/").pop() ?? "");
  return ROOM_CODE_RE.test(code) ? code : null;
}

/**
 * All of the room logic, with sockets, storage, content, stats and the clock
 * injected: init, info, accept, message, close, alarm and effect handling.
 * The Durable Object adapter in room.ts only supplies Cloudflare bindings.
 */
export class RoomHub {
  private readonly options: HubOptions;
  private room: RoomCore | null;
  /**
   * False only for a room rebuilt from storage, until `resumeIfNeeded` has run. A restored
   * room may have been saved mid-start, with the content load that would have finished it
   * lost along with the instance that was running it.
   */
  private resumed: boolean;
  /**
   * One frame budget per live socket. Keyed by the socket object, so a socket restored after
   * hibernation starts fresh — that costs an attacker a reconnect, which the join route already
   * rate limits, and costs an honest player nothing.
   */
  private readonly budgets: Map<HubSocket, Budget>;

  constructor(options: HubOptions, snapshot?: RoomSnapshot) {
    this.options = options;
    this.room = snapshot
      ? restoreRoom(snapshot, options.games, options.newToken)
      : null;
    this.resumed = snapshot === undefined;
    this.budgets = new Map();
  }

  /** True when this room owns the code, so the adapter can 404 every other socket. */
  accepts(code: string): boolean {
    return this.room !== null && this.room.code === code;
  }

  /** Accepts a socket: anonymous until it says hello or joins. */
  accept(socket: HubSocket): void {
    this.options.sockets.add(socket);
    socket.setCaller(ANONYMOUS_CALLER);
  }

  /** Answers the WebSocket upgrade for /ws/:code. */
  upgrade(url: string, open: () => OpenedSocket): Response {
    const code = roomCodeFromUrl(url);
    if (code === null || !this.accepts(code))
      return new Response("room not found", { status: 404 });
    const opened = open();
    this.accept(opened.socket);
    return opened.response;
  }

  /** Creates the room. Returns false when another active room already owns this code. */
  async init(
    code: string,
    hostToken: string,
    sharedScreen = true,
    contentLanguage: ContentLanguage = "en",
  ): Promise<boolean> {
    const now = this.options.now();
    if (this.room && !this.room.isIdleSince(now, IDLE_MS)) return false;

    const room = createRoom({
      code,
      hostToken,
      games: this.options.games,
      seed: this.options.seed(),
      now,
      newToken: this.options.newToken,
      sharedScreen,
      contentLanguage,
    });
    this.room = room;

    const packs = await this.loadPacks();
    await this.apply(room.setPackCatalog(packs, this.options.now()));
    return true;
  }

  /** Room metadata for GET /api/rooms/:code. Null when the room was never initialized. */
  info(): RoomInfoResponse | null {
    const room = this.room;
    if (!room) return null;
    const view = room.hostView(this.options.now());
    const playerCount = view.players.length;
    return {
      code: view.code,
      exists: true,
      locked: view.locked,
      inGame: view.phase !== "lobby",
      playerCount,
      joinable: !view.locked && playerCount < MAX_PLAYERS,
    };
  }

  /**
   * Charges one frame to this socket's budget.
   *
   * Frames are spent before anything else looks at them: a change costs a storage write and a
   * broadcast to the whole room, so an unthrottled sender multiplies its own rate by the size
   * of the party. The budget is generous next to real play — a Doodle Bluff pad sends one frame
   * per finished stroke — and stingy next to a script.
   */
  private affords(socket: HubSocket, now: number): boolean {
    const budget = this.budgets.get(socket) ?? newBudget(now);
    const result = spend(budget, now);
    this.budgets.set(socket, result.budget);
    if (result.warn) socket.send(RATE_LIMITED);
    return result.allowed;
  }

  /** Handles one raw socket frame. */
  async message(socket: HubSocket, raw: string | ArrayBuffer): Promise<void> {
    await this.resumeIfNeeded();
    if (!this.affords(socket, this.options.now())) return;
    const parsed = parseClientMessage(raw);
    if (!parsed) {
      socket.send(BAD_MESSAGE);
      return;
    }
    const room = this.room;
    if (!room) {
      socket.send(NO_ROOM);
      return;
    }

    const result = room.handle(socket.caller(), parsed, this.options.now());
    // A welcome promotes the socket so its own view can be broadcast this round.
    for (const reply of result.reply) {
      if (reply.t === "welcome") socket.setCaller(callerForWelcome(reply));
    }
    await this.apply(result, socket);
  }

  /** A socket closed or errored. */
  async close(socket: HubSocket): Promise<void> {
    await this.resumeIfNeeded();
    // A closed socket can never spend again, and the map must not outlive the party.
    this.budgets.delete(socket);
    const room = this.room;
    if (!room) return;
    const caller = socket.caller();
    if (caller.kind === "anonymous") return;
    if (this.otherSockets(caller, socket).length > 0) return;

    const now = this.options.now();
    const result =
      caller.kind === "host"
        ? room.setHostConnected(false, now)
        : room.setConnected(caller.playerId, false, now);
    await this.apply(result);
  }

  /** Deadline tick: run the game clock, then delete an idle room. */
  async alarm(): Promise<void> {
    await this.resumeIfNeeded();
    const room = this.room;
    if (!room) return;
    const now = this.options.now();
    await this.apply(room.tick(now));
    if (!room.isIdleSince(now, IDLE_MS)) return;

    this.room = null;
    for (const socket of this.options.sockets.all()) socket.close(KICK, "idle");
    await this.options.storage.deleteAll();
  }

  // ---------- internals ----------

  /**
   * Picks up a start that a restart interrupted, on whatever wakes this instance first.
   * The flag flips before the await so two concurrent entry points cannot both re-issue
   * the load, and a room that was not starting simply produces nothing to apply.
   */
  private async resumeIfNeeded(): Promise<void> {
    if (this.resumed) return;
    this.resumed = true;
    const room = this.room;
    if (!room) return;
    const now = this.options.now();
    const result = mergeResults([
      this.reconcileConnections(room, now),
      room.resumeStart(now),
    ]);
    if (!result.changed && result.effects.length === 0) return;
    await this.apply(result);
  }

  /**
   * The snapshot remembers who was connected, but a crash or deploy kills every socket
   * without a close event reaching the new instance, so a seat can be saved as connected
   * with nothing behind it. That seat would hold the VIP crown, stall the game's
   * connected-player checks and keep the room from ever going idle. What survived
   * hibernation is exactly what `sockets.all()` holds, so the sockets decide.
   */
  private reconcileConnections(room: RoomCore, now: number): HandleResult {
    const live = this.liveCallers();
    const results = room
      .playerIds()
      .map((id) => room.setConnected(id, live.players.has(id), now));
    results.push(room.setHostConnected(live.host, now));
    return mergeResults(results);
  }

  private liveCallers(): { players: Set<string>; host: boolean } {
    const players = new Set<string>();
    let host = false;
    for (const socket of this.options.sockets.all()) {
      const caller = socket.caller();
      if (caller.kind === "host") host = true;
      if (caller.kind === "player") players.add(caller.playerId);
    }
    return { players, host };
  }

  private async loadPacks(): Promise<PackMeta[]> {
    try {
      return await this.options.content.listPacks();
    } catch (error) {
      // A room with no packs still plays: the VIP just sees an empty picker.
      console.error("failed to load the pack catalog", error);
      return [];
    }
  }

  private otherSockets(caller: Caller, exclude: HubSocket): HubSocket[] {
    return this.options.sockets
      .all()
      .filter(
        (socket) => socket !== exclude && sameCaller(socket.caller(), caller),
      );
  }

  /**
   * Persist when the room changed, reply to the caller, then either rebroadcast
   * every socket's view (a real change) or send just the caller's own view when
   * a no-op reply carries a welcome (a reconnect promoting the socket). Then re-arm
   * the alarm and run effects.
   *
   * The alarm is armed before the effects run, not after: "load-content" is an await on
   * the outside world, and a start whose snapshot is already saved as "starting" must have
   * a wake-up booked before that await, or an instance that dies inside it leaves a room
   * no alarm will ever visit.
   */
  private async apply(result: HandleResult, socket?: HubSocket): Promise<void> {
    const room = this.room;
    if (!room) return;
    if (result.changed) await this.options.storage.put(room.snapshot());
    if (socket) for (const reply of result.reply) socket.send(reply);
    this.notify(result, socket);
    await this.armAlarm();
    await this.runEffects(result.effects);
  }

  /** Broadcasts on a real change; otherwise sends only a welcomed caller its own view. */
  private notify(result: HandleResult, socket?: HubSocket): void {
    const now = this.options.now();
    if (result.changed) {
      this.broadcast(now);
      return;
    }
    if (socket && hasWelcome(result.reply)) this.sendView(socket, now);
  }

  private broadcast(now: number): void {
    const room = this.room;
    if (!room) return;
    const players = new Set(room.playerIds());
    for (const socket of this.options.sockets.all()) {
      this.sendView(socket, now, players);
    }
  }

  /** Sends one socket its own current view, when its caller still belongs to the room. */
  private sendView(
    socket: HubSocket,
    now: number,
    players?: Set<string>,
  ): void {
    const room = this.room;
    if (!room) return;
    const caller = socket.caller();
    if (caller.kind === "anonymous") return;
    const ids = players ?? new Set(room.playerIds());
    if (caller.kind === "player" && !ids.has(caller.playerId)) return;
    const view =
      caller.kind === "host"
        ? room.hostView(now)
        : room.playerView(caller.playerId, now);
    socket.send({ t: "state", view });
  }

  /** Effects run in order: a disconnect must not race the game start it belongs to. */
  private runEffects(effects: RoomEffect[]): Promise<void> {
    return effects.reduce(async (previous, effect) => {
      await previous;
      await this.runEffect(effect);
    }, Promise.resolve());
  }

  private async runEffect(effect: RoomEffect): Promise<void> {
    try {
      await this.applyEffect(effect);
    } catch (error) {
      if (effect.type === "load-content" && this.room) {
        console.error("load-content failed, aborting the start", error);
        await this.apply(this.room.abortStart(this.options.now()));
        return;
      }
      console.error(`room effect ${effect.type} failed`, error);
    }
  }

  private async applyEffect(effect: RoomEffect): Promise<void> {
    switch (effect.type) {
      case "load-content": {
        const room = this.room;
        if (!room) return;
        const content = await this.options.content.loadContent(
          effect.kind,
          effect.packIds,
        );
        await this.apply(room.beginGame(content, this.options.now()));
        return;
      }
      case "disconnect-player": {
        this.disconnectPlayer(effect.playerId);
        return;
      }
      case "notify-error": {
        this.sendToPlayers(effect.playerIds, {
          t: "error",
          code: effect.code,
          message: effect.message,
        });
        return;
      }
      case "game-finished": {
        await this.options.stats.record({
          gameId: effect.gameId,
          playerCount: effect.playerCount,
          durationMs: effect.durationMs,
          completed: effect.completed,
          finishedAt: this.options.now(),
        });
        return;
      }
    }
  }

  /** Sends one message to every socket of the named players; a player with none is skipped. */
  private sendToPlayers(playerIds: string[], message: ServerMessage): void {
    const wanted = new Set(playerIds);
    for (const socket of this.options.sockets.all()) {
      const caller = socket.caller();
      if (caller.kind !== "player" || !wanted.has(caller.playerId)) continue;
      socket.send(message);
    }
  }

  private disconnectPlayer(playerId: string): void {
    for (const socket of this.options.sockets.all()) {
      const caller = socket.caller();
      if (caller.kind !== "player" || caller.playerId !== playerId) continue;
      socket.send({ t: "kicked" });
      socket.close(KICK, "kicked");
    }
  }

  /** Wake for the next game deadline, and at the latest two hours from now to check for idle. */
  private async armAlarm(): Promise<void> {
    const room = this.room;
    if (!room) return;
    const now = this.options.now();
    const deadline = room.nextDeadline();
    const idleCheck = now + IDLE_MS;
    await this.options.storage.setAlarm(
      deadline === null ? idleCheck : Math.min(deadline, idleCheck),
    );
  }
}

/** One result standing for several, so a batch of changes persists and broadcasts once. */
function mergeResults(results: HandleResult[]): HandleResult {
  return {
    reply: results.flatMap((r) => r.reply),
    effects: results.flatMap((r) => r.effects),
    changed: results.some((r) => r.changed),
  };
}

function hasWelcome(reply: ServerMessage[]): boolean {
  return reply.some((message) => message.t === "welcome");
}

function callerForWelcome(
  reply: Extract<ServerMessage, { t: "welcome" }>,
): Caller {
  return reply.role === "host"
    ? HOST_CALLER
    : { kind: "player", playerId: reply.playerId };
}

function sameCaller(a: Caller, b: Caller): boolean {
  if (a.kind !== b.kind) return false;
  return (
    a.kind !== "player" || b.kind !== "player" || a.playerId === b.playerId
  );
}