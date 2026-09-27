// WebSocket room connection: hello/join, reconnect backoff, ping, latest view.
import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { ERROR_CODES } from "@opg/protocol";
import type {
  ClientMessage,
  ErrorCode,
  PlayerId,
  RoomView,
  ServerMessage,
} from "@opg/protocol";
import { clockOffsetFrom, createServerClock, nextClockSamples } from "@opg/ui";
import type { ServerClock } from "@opg/ui";

export type RoomSocketStatus =
  | "connecting"
  | "open"
  | "reconnecting"
  | "closed";

export interface RoomSocketError {
  code: ErrorCode;
  message: string;
}

export interface UseRoomSocketOptions {
  code: string;
  role: "host" | "player";
  /** Required for the host role. */
  hostToken?: string | null;
  /** Display name for the first player join. */
  name?: string | null;
  enabled?: boolean;
}

export interface RoomSocket {
  status: RoomSocketStatus;
  view: RoomView | null;
  lastError: RoomSocketError | null;
  kicked: boolean;
  playerId: PlayerId | null;
  /** Server-corrected clock; its offset is sampled as each state frame arrives. */
  clock: ServerClock;
  send: (message: ClientMessage) => void;
  join: (name: string) => void;
  clearError: () => void;
}

const PING_MS = 25_000;
const BACKOFF_START_MS = 500;
const BACKOFF_MAX_MS = 5_000;
/**
 * How long a tap made while the socket was down is still worth delivering. A party game moves
 * on: a vote replayed into the round after next is worse than one quietly dropped, and the
 * reconnect backoff caps at 5s, so anything older than this was lost to a real outage rather
 * than to the blip a backgrounded tab causes.
 */
const PENDING_TTL_MS = 10_000;

/**
 * The error codes an error frame may carry, taken straight from the protocol rather than
 * re-listed here. A copy that drifts fails silently and badly: an unknown code makes the whole
 * frame fail to parse, so the phone shows nothing at all — not even the server's English prose.
 * `no-language-packs` went its entire life like that, with translated copy already written for
 * it, because the old list was only checked as a subset. There is now one list, in @opg/protocol.
 */

const serverMessageSchema = z.union([
  z.object({ t: z.literal("welcome"), role: z.literal("host") }),
  z.object({
    t: z.literal("welcome"),
    role: z.literal("player"),
    playerId: z.string(),
    token: z.string(),
  }),
  // The view shape is produced by our own Worker; only the envelope is validated here.
  // SAFETY: state frames come from trusted server code, so the view payload needs no runtime decode.
  z.object({
    t: z.literal("state"),
    view: z.custom<RoomView>((value) => value !== null),
  }),
  z.object({
    t: z.literal("error"),
    code: z.enum(ERROR_CODES),
    message: z.string(),
  }),
  z.object({ t: z.literal("kicked") }),
]);

/** Decodes one WebSocket frame; returns null when it is not a known server message. */
function parseServerMessage(raw: ClientFrame): ServerMessage | null {
  const text = z.string().safeParse(raw);
  if (!text.success) return null;
  let json: unknown;
  try {
    json = JSON.parse(text.data);
  } catch {
    return null;
  }
  const parsed = serverMessageSchema.safeParse(json);
  if (!parsed.success) return null;
  return parsed.data;
}

function playerTokenKey(code: string): string {
  return `opg:player:${code}`;
}

function readPlayerToken(code: string): string | null {
  try {
    return localStorage.getItem(playerTokenKey(code));
  } catch {
    return null;
  }
}

function writePlayerToken(code: string, token: string): void {
  try {
    localStorage.setItem(playerTokenKey(code), token);
  } catch {
    /* storage unavailable; session still works until reload */
  }
}

/** Raw frame as delivered by the browser socket: text, or binary we ignore. */
type ClientFrame = string | ArrayBuffer;

interface ConnectionEvents {
  onStatus: (status: RoomSocketStatus) => void;
  onView: (view: RoomView) => void;
  onError: (error: RoomSocketError | null) => void;
  onKicked: () => void;
  onPlayer: (playerId: PlayerId) => void;
}

/** A message the socket could not carry, held until the next socket opens or it goes stale. */
interface PendingMessage {
  data: string;
  expiresAt: number;
}

interface ConnectionState {
  code: string;
  role: "host" | "player";
  hostToken: string | null;
  name: string | null;
  token: string | null;
  events: ConnectionEvents;
  ws: WebSocket | null;
  detach: (() => void) | null;
  reconnectTimer: number | null;
  pingTimer: number | null;
  backoff: number;
  stopped: boolean;
  kicked: boolean;
  /** One slot per kind of tap, keyed by `pendingKey`. Bounded by the kinds that exist. */
  pending: Map<string, PendingMessage>;
}

export interface RoomConnection {
  send: (message: ClientMessage) => void;
  join: (name: string) => void;
  stop: () => void;
}

function clearTimers(state: ConnectionState): void {
  if (state.reconnectTimer !== null) window.clearTimeout(state.reconnectTimer);
  if (state.pingTimer !== null) window.clearInterval(state.pingTimer);
  state.reconnectTimer = null;
  state.pingTimer = null;
}

/** Writes to the socket when it is open. False means the frame did not go out. */
function sendRaw(state: ConnectionState, data: string): boolean {
  const ws = state.ws;
  if (!ws || ws.readyState !== WebSocket.OPEN) return false;
  ws.send(data);
  return true;
}

/** The discriminant every game's action carries; see each game's `actionSchema`. */
const actionKindSchema = z.object({ type: z.string() });

/**
 * What a buffered tap supersedes. One slot per kind, so a player who changes their pick three
 * times during a blip lands one pick rather than a replayed backlog of three. Game actions key
 * on their own discriminant, so a lie and the vote that follows it do not overwrite each other.
 */
function pendingKey(message: ClientMessage): string {
  if (message.t !== "game-action") return message.t;
  const kind = actionKindSchema.safeParse(message.action);
  return kind.success ? `game-action:${kind.data.type}` : "game-action";
}

/**
 * Holds a tap the closed socket could not carry. Dropping it is what a player feels as a tap
 * that did nothing: no error, no retry, just a vote that never counted. The reconnect overlay
 * promises the taps are safe, and this is what makes that true.
 */
function bufferMessage(
  state: ConnectionState,
  message: ClientMessage,
  data: string,
): void {
  state.pending.set(pendingKey(message), {
    data,
    expiresAt: Date.now() + PENDING_TTL_MS,
  });
}

/** Sends what the gap held back, oldest first, minus anything the round has outlived. */
function flushPending(state: ConnectionState): void {
  const held = [...state.pending.values()];
  state.pending.clear();
  const now = Date.now();
  for (const item of held) {
    if (item.expiresAt > now) sendRaw(state, item.data);
  }
}

function sendMessage(state: ConnectionState, message: ClientMessage): void {
  const data = JSON.stringify(message);
  if (sendRaw(state, data)) return;
  bufferMessage(state, message, data);
}

function handleOpen(state: ConnectionState): void {
  state.backoff = BACKOFF_START_MS;
  state.events.onStatus("open");
  state.events.onError(null);
  if (state.role === "host") {
    if (state.hostToken)
      sendMessage(state, { t: "host-hello", hostToken: state.hostToken });
  } else if (state.token) {
    sendMessage(state, {
      t: "join",
      name: state.name ?? "",
      token: state.token,
    });
  } else if (state.name) {
    sendMessage(state, { t: "join", name: state.name });
  }
  // After the hello, so the room knows who is speaking before the held taps arrive.
  flushPending(state);
  state.pingTimer = window.setInterval(() => sendRaw(state, "ping"), PING_MS);
}

function handleMessage(state: ConnectionState, raw: ClientFrame): void {
  const message = parseServerMessage(raw);
  if (!message) return;
  switch (message.t) {
    case "welcome":
      state.events.onError(null);
      if (message.role === "player") {
        state.token = message.token;
        writePlayerToken(state.code, message.token);
        state.events.onPlayer(message.playerId);
      }
      break;
    case "state":
      state.events.onView(message.view);
      break;
    case "error":
      state.events.onError({ code: message.code, message: message.message });
      break;
    case "kicked":
      state.kicked = true;
      state.stopped = true;
      state.events.onKicked();
      state.events.onStatus("closed");
      clearTimers(state);
      state.ws?.close();
      break;
  }
}

function handleClose(state: ConnectionState): void {
  if (state.pingTimer !== null) window.clearInterval(state.pingTimer);
  state.pingTimer = null;
  if (state.stopped || state.kicked) {
    state.events.onStatus("closed");
    return;
  }
  state.events.onStatus("reconnecting");
  const delay = state.backoff;
  state.backoff = Math.min(delay * 2, BACKOFF_MAX_MS);
  state.reconnectTimer = window.setTimeout(() => openSocket(state), delay);
}

function ignoreSocketError(): void {
  /* onclose handles reconnect */
}

function noCleanup(): void {
  /* nothing to tear down when the socket is disabled */
}

function openSocket(state: ConnectionState): void {
  if (state.stopped) return;
  const scheme = window.location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(
    `${scheme}://${window.location.host}/ws/${state.code}`,
  );
  state.ws = ws;
  const onOpen = () => handleOpen(state);
  const onMessage = (event: MessageEvent) => handleMessage(state, event.data);
  const onClose = () => handleClose(state);
  ws.addEventListener("open", onOpen);
  ws.addEventListener("message", onMessage);
  ws.addEventListener("close", onClose);
  ws.addEventListener("error", ignoreSocketError);
  state.detach = () => {
    ws.removeEventListener("open", onOpen);
    ws.removeEventListener("message", onMessage);
    ws.removeEventListener("close", onClose);
    ws.removeEventListener("error", ignoreSocketError);
  };
}

function stopConnection(state: ConnectionState): void {
  state.stopped = true;
  state.pending.clear();
  clearTimers(state);
  if (state.detach) {
    state.detach();
    state.detach = null;
  }
  const ws = state.ws;
  state.ws = null;
  if (ws) ws.close();
}

/** Opens a room socket and keeps it alive. Exported for direct tests of the transport. */
export function connectRoom(params: {
  code: string;
  role: "host" | "player";
  hostToken: string | null;
  name: string | null;
  events: ConnectionEvents;
}): RoomConnection {
  const state: ConnectionState = {
    code: params.code,
    role: params.role,
    hostToken: params.hostToken,
    name: params.name,
    token: readPlayerToken(params.code),
    events: params.events,
    ws: null,
    detach: null,
    reconnectTimer: null,
    pingTimer: null,
    backoff: BACKOFF_START_MS,
    stopped: false,
    kicked: false,
    pending: new Map(),
  };
  openSocket(state);
  return {
    send: (message) => sendMessage(state, message),
    join: (name) => {
      // The name is what the next socket joins with (see handleOpen), so a join that lands in
      // a gap needs no buffer of its own — buffering it would join twice on the way back.
      state.name = name;
      const token = state.token;
      sendRaw(
        state,
        JSON.stringify(token ? { t: "join", name, token } : { t: "join", name }),
      );
    },
    stop: () => stopConnection(state),
  };
}

/**
 * Collects clock samples outside of React state and exposes a clock over the running estimate.
 * Each new socket starts a fresh estimate (a phone waking from sleep may have resynced its clock),
 * but the old estimate keeps serving until the new socket's first sample lands.
 */
function createClockSampler() {
  let samples: number[] = [];
  let restarting = false;
  return {
    push: (sample: number) => {
      samples = restarting ? [sample] : nextClockSamples(samples, sample);
      restarting = false;
    },
    restart: () => {
      restarting = true;
    },
    clock: createServerClock(() => clockOffsetFrom(samples)),
  };
}

export function useRoomSocket({
  code,
  role,
  hostToken,
  name,
  enabled = true,
}: UseRoomSocketOptions): RoomSocket {
  const [status, setStatus] = useState<RoomSocketStatus>(
    enabled ? "connecting" : "closed",
  );
  const [view, setView] = useState<RoomView | null>(null);
  const [lastError, setLastError] = useState<RoomSocketError | null>(null);
  const [kicked, setKicked] = useState(false);
  const [playerId, setPlayerId] = useState<PlayerId | null>(null);
  const connectionRef = useRef<RoomConnection | null>(null);
  const [sampler] = useState(createClockSampler);
  const clock = sampler.clock;

  const clearError = useCallback(() => setLastError(null), []);
  const send = useCallback((message: ClientMessage) => {
    connectionRef.current?.send(message);
  }, []);
  const join = useCallback((joinName: string) => {
    connectionRef.current?.join(joinName);
  }, []);

  useEffect(() => {
    if (!enabled || !code) return noCleanup;
    const connection = connectRoom({
      code,
      role,
      hostToken: hostToken ?? null,
      name: name ?? null,
      events: {
        onStatus: (next) => {
          if (next === "open") sampler.restart();
          setStatus(next);
        },
        onView: (nextView) => {
          sampler.push(nextView.serverNow - Date.now());
          setView(nextView);
        },
        onError: setLastError,
        onKicked: () => setKicked(true),
        onPlayer: setPlayerId,
      },
    });
    connectionRef.current = connection;
    return () => {
      connectionRef.current = null;
      connection.stop();
    };
  }, [code, role, hostToken, name, enabled, sampler]);

  return {
    status: enabled ? status : "closed",
    view,
    lastError,
    kicked,
    playerId,
    clock,
    send,
    join,
    clearError,
  };
}
