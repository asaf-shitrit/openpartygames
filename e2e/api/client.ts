// HTTP + WebSocket client for the API e2e suite. Talks to the real Worker on
// the port global-setup.ts started (OPG_E2E_BASE_URL), and keeps each socket's
// latest view plus everything the server sent, so tests can assert on either.

import type {
  ApiErrorResponse,
  ClientMessage,
  CreateRoomResponse,
  ErrorCode,
  RoomInfoResponse,
  RoomView,
  ServerMessage,
} from "../../packages/protocol/src/index";
import WsWebSocket, { type RawData } from "ws";

export const BASE_URL = process.env.OPG_E2E_BASE_URL ?? "http://127.0.0.1:8799";
export const WS_BASE_URL = BASE_URL.replace(/^http/u, "ws");

const DEFAULT_WAIT_MS = 10_000;

/** A response from GET /api/rooms/:code: room info, or an API error body. */
export interface RoomInfoResult {
  status: number;
  body: RoomInfoResponse | ApiErrorResponse;
}

export async function health(): Promise<{
  status: number;
  body: { ok?: boolean };
}> {
  const response = await fetch(`${BASE_URL}/api/health`);
  const body: { ok?: boolean } = await response.json();
  return { status: response.status, body };
}

export async function createRoom(): Promise<CreateRoomResponse> {
  const response = await fetch(`${BASE_URL}/api/rooms`, { method: "POST" });
  if (!response.ok) {
    throw new Error(
      `POST /api/rooms -> ${response.status}: ${await response.text()}`,
    );
  }
  const body: CreateRoomResponse = await response.json();
  return body;
}

export async function roomInfo(code: string): Promise<RoomInfoResult> {
  const response = await fetch(`${BASE_URL}/api/rooms/${code}`);
  const body: RoomInfoResponse | ApiErrorResponse = await response.json();
  return { status: response.status, body };
}

/**
 * Decodes one socket frame into a ServerMessage, or null when it is not one.
 * The JSON.parse annotation mirrors the repo's boundary decoders; the `t`
 * check is what makes the returned union trustworthy.
 */
export function parseServerMessage(raw: string): ServerMessage | null {
  try {
    const message: ServerMessage = JSON.parse(raw);
    return isServerMessage(message) ? message : null;
  } catch {
    return null;
  }
}

function isServerMessage(message: ServerMessage): boolean {
  return (
    message.t === "welcome" ||
    message.t === "state" ||
    message.t === "error" ||
    message.t === "kicked"
  );
}

type Predicate = (client: SocketClient) => boolean;

/** Decodes one WebSocket frame; ws delivers a Buffer unless binaryType was changed. */
function decodeFrame(data: RawData): string {
  if (Array.isArray(data)) return Buffer.concat(data).toString("utf8");
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(data);
  return data.toString("utf8");
}

interface Waiter {
  predicate: Predicate;
  resolve: () => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/** One WebSocket connection to a room, host or player. */
export class SocketClient {
  latest: RoomView | null = null;
  readonly received: ServerMessage[] = [];
  readonly errors: { code: ErrorCode; message: string }[] = [];
  readonly welcomes: Extract<ServerMessage, { t: "welcome" }>[] = [];
  playerId: string | null = null;
  token: string | null = null;
  kicked = false;
  private closed = false;
  private readonly waiters: Waiter[] = [];

  constructor(
    readonly code: string,
    private readonly socket: WsWebSocket,
  ) {
    socket.on("message", (data: RawData) => this.handle(decodeFrame(data)));
    socket.on("close", () => this.handleClose());
    socket.on("error", () => this.handleClose());
  }

  send(message: ClientMessage): void {
    this.socket.send(JSON.stringify(message));
  }

  /** Sends a raw frame, for the malformed-message test. */
  sendRaw(raw: string): void {
    this.socket.send(raw);
  }

  /** Resolves once `predicate(this)` holds, polling the latest state on every frame. */
  waitFor(
    predicate: Predicate,
    timeoutMs = DEFAULT_WAIT_MS,
    label = "condition",
  ): Promise<void> {
    if (predicate(this)) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const waiter: Waiter = {
        predicate,
        resolve,
        reject,
        timer: setTimeout(() => {
          this.removeWaiter(waiter);
          reject(
            new Error(
              `timed out waiting for ${label} in room ${this.code} ` +
                `(received ${this.received.length} frames)`,
            ),
          );
        }, timeoutMs),
      };
      this.waiters.push(waiter);
    });
  }

  async close(): Promise<void> {
    if (this.closed) return;
    const done = new Promise<void>((resolve) => {
      this.socket.once("close", () => resolve());
    });
    this.socket.close();
    await done;
  }

  private handle(raw: string): void {
    const message = parseServerMessage(raw);
    if (message === null) return;
    this.received.push(message);
    if (message.t === "state") {
      this.latest = message.view;
    } else if (message.t === "error") {
      this.errors.push({ code: message.code, message: message.message });
    } else if (message.t === "welcome") {
      this.welcomes.push(message);
      if (message.role === "player") {
        this.playerId = message.playerId;
        this.token = message.token;
      }
    } else {
      this.kicked = true;
    }
    this.notify();
  }

  private handleClose(): void {
    if (this.closed) return;
    this.closed = true;
    this.rejectWaiters(new Error(`socket closed (room ${this.code})`));
  }

  private notify(): void {
    const ready = this.waiters.filter((waiter) => waiter.predicate(this));
    for (const waiter of ready) {
      this.removeWaiter(waiter);
      waiter.resolve();
    }
  }

  private rejectWaiters(error: Error): void {
    const pending = this.waiters.slice();
    this.waiters.length = 0;
    for (const waiter of pending) {
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }
  }

  private removeWaiter(waiter: Waiter): void {
    clearTimeout(waiter.timer);
    const index = this.waiters.indexOf(waiter);
    if (index >= 0) this.waiters.splice(index, 1);
  }
}

export async function connectSocket(code: string): Promise<SocketClient> {
  const socket = new WsWebSocket(`${WS_BASE_URL}/ws/${code}`);
  const client = new SocketClient(code, socket);
  await new Promise<void>((resolve, reject) => {
    socket.once("open", () => resolve());
    socket.once("error", (error) =>
      reject(error instanceof Error ? error : new Error("socket error")),
    );
  });
  return client;
}

/** A host screen socket that has said hello; the token may still be wrong. */
export async function hostClient(
  code: string,
  hostToken: string,
): Promise<SocketClient> {
  const client = await connectSocket(code);
  client.send({ t: "host-hello", hostToken });
  return client;
}

/** A phone socket that has joined; resolves once the welcome (or an error) lands. */
export async function playerClient(
  code: string,
  name: string,
  token?: string,
): Promise<SocketClient> {
  const client = await connectSocket(code);
  client.send(
    token === undefined ? { t: "join", name } : { t: "join", name, token },
  );
  await client.waitFor(
    (c) => c.playerId !== null || c.errors.length > 0,
    DEFAULT_WAIT_MS,
    `join ${name}`,
  );
  return client;
}
