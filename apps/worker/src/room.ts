import { DurableObject } from "cloudflare:workers";
import type { RoomInfoResponse, ServerMessage } from "@opg/protocol";
import type { Caller, RoomSnapshot } from "@opg/sdk";
import { createContentSource } from "./content";
import { createD1PackReader } from "./d1-reader";
import { GAMES } from "./games";
import {
  ANONYMOUS_CALLER,
  RoomHub,
  ROOM_KEY,
  type HubOptions,
  type HubSocket,
  type HubSockets,
  type HubStorage,
  type OpenedSocket,
  type StatsRecorder,
} from "./room-hub";
import { recordMatch } from "./stats";

function randomSeed(): number {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return bytes[0] ?? 0;
}

/**
 * Cloudflare adapter for RoomHub. Everything Cloudflare-specific lives here:
 * the Durable Object constructor, WebSocket acceptance and the bindings for
 * storage, content, stats and the clock.
 */
export class Room extends DurableObject<Env> {
  private readonly hub: Promise<RoomHub>;
  private readonly sockets = new WeakMap<WebSocket, CloudflareSocket>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.hub = ctx
      .blockConcurrencyWhile(() => ctx.storage.get<RoomSnapshot>(ROOM_KEY))
      .then((snapshot) => new RoomHub(this.options(ctx, env), snapshot));
    ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair("ping", "pong"),
    );
  }

  /** Creates the room. Returns false when another active room already owns this code. */
  async init(code: string, hostToken: string): Promise<boolean> {
    return (await this.hub).init(code, hostToken);
  }

  /** Room metadata for GET /api/rooms/:code. Null when the room was never initialized. */
  async info(): Promise<RoomInfoResponse | null> {
    return (await this.hub).info();
  }

  /** Accepts a hibernatable WebSocket for /ws/:code. */
  override async fetch(request: Request): Promise<Response> {
    return (await this.hub).upgrade(request.url, () => this.openSocket());
  }

  override async webSocketMessage(
    ws: WebSocket,
    message: string | ArrayBuffer,
  ): Promise<void> {
    await (await this.hub).message(this.wrap(ws), message);
  }

  override async webSocketClose(ws: WebSocket): Promise<void> {
    await (await this.hub).close(this.wrap(ws));
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    await (await this.hub).close(this.wrap(ws));
  }

  override async alarm(): Promise<void> {
    await (await this.hub).alarm();
  }

  // ---------- Cloudflare glue ----------

  private options(ctx: DurableObjectState, env: Env): HubOptions {
    return {
      games: GAMES,
      content: createContentSource(createD1PackReader(env.DB)),
      storage: hubStorage(ctx),
      sockets: hubSockets(ctx, (ws) => this.wrap(ws)),
      stats: hubStats(env),
      now: () => Date.now(),
      newToken: () => crypto.randomUUID(),
      seed: randomSeed,
    };
  }

  private openSocket(): OpenedSocket {
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    return {
      response: new Response(null, { status: 101, webSocket: pair[0] }),
      socket: this.wrap(pair[1]),
    };
  }

  /** One wrapper per socket, so the hub can compare sockets by identity. */
  private wrap(ws: WebSocket): CloudflareSocket {
    const existing = this.sockets.get(ws);
    if (existing) return existing;
    const created = new CloudflareSocket(ws);
    this.sockets.set(ws, created);
    return created;
  }
}

/** Hibernatable socket: the caller (anonymous until hello/join) lives in the attachment. */
class CloudflareSocket implements HubSocket {
  constructor(private readonly socket: WebSocket) {}

  send(message: ServerMessage): void {
    try {
      this.socket.send(JSON.stringify(message));
    } catch {
      // Socket is already gone; the broadcast of the next change will not include it.
    }
  }

  close(code: number, reason: string): void {
    try {
      this.socket.close(code, reason);
    } catch {
      // already closed
    }
  }

  caller(): Caller {
    const caller: Caller = this.socket.deserializeAttachment() ?? ANONYMOUS_CALLER;
    return caller;
  }

  setCaller(caller: Caller): void {
    this.socket.serializeAttachment(caller);
  }
}

function hubStorage(ctx: DurableObjectState): HubStorage {
  return {
    get: () => ctx.storage.get<RoomSnapshot>(ROOM_KEY),
    put: (snapshot) => ctx.storage.put(ROOM_KEY, snapshot),
    deleteAll: () => ctx.storage.deleteAll(),
    setAlarm: (at) => ctx.storage.setAlarm(at),
  };
}

function hubSockets(
  ctx: DurableObjectState,
  wrap: (ws: WebSocket) => HubSocket,
): HubSockets {
  return {
    all: () => ctx.getWebSockets().map(wrap),
    // ctx.acceptWebSocket already tracks the socket; there is nothing left to add.
    add: () => undefined,
  };
}

function hubStats(env: Env): StatsRecorder {
  return { record: (stats) => recordMatch(env.DB, stats) };
}