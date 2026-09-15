// WebSocket room connection: hello/join, reconnect backoff, ping, latest view.
import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import type {
  ClientMessage,
  ErrorCode,
  PlayerId,
  RoomView,
  ServerMessage,
} from "@opg/protocol";

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
  send: (message: ClientMessage) => void;
  join: (name: string) => void;
  clearError: () => void;
}

const PING_MS = 25_000;
const BACKOFF_START_MS = 500;
const BACKOFF_MAX_MS = 5_000;

const ERROR_CODES = [
  "bad-message",
  "room-not-found",
  "room-full",
  "room-locked",
  "name-invalid",
  "name-taken",
  "avatar-taken",
  "not-joined",
  "not-vip",
  "not-enough-players",
  "game-in-progress",
  "invalid-action",
  "host-token-invalid",
  "rate-limited",
] as const satisfies readonly ErrorCode[];

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
  z.object({ t: z.literal("state"), view: z.custom<RoomView>() }),
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

function sendRaw(state: ConnectionState, data: string): void {
  const ws = state.ws;
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(data);
}

function sendMessage(state: ConnectionState, message: ClientMessage): void {
  sendRaw(state, JSON.stringify(message));
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
  };
  openSocket(state);
  return {
    send: (message) => sendMessage(state, message),
    join: (name) => {
      state.name = name;
      const token = state.token;
      sendMessage(
        state,
        token ? { t: "join", name, token } : { t: "join", name },
      );
    },
    stop: () => stopConnection(state),
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
        onStatus: setStatus,
        onView: setView,
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
  }, [code, role, hostToken, name, enabled]);

  return {
    status: enabled ? status : "closed",
    view,
    lastError,
    kicked,
    playerId,
    send,
    join,
    clearError,
  };
}
