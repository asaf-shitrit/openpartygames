import { z } from "zod";

// Wire protocol shared by the Worker, the Room Durable Object, the host screen and phones.
// Everything here is JSON-serializable. Game-specific view shapes live in each game package.

export type PlayerId = string;

export const AVATARS = [
  "blob",
  "toast",
  "drop",
  "cloud",
  "star",
  "cat",
  "ghost",
  "bean",
  "robot",
  "mushroom",
  "egg",
  "sun",
] as const;
export type AvatarId = (typeof AVATARS)[number];

export type Rating = "family" | "teen" | "adult";
export const RATINGS: readonly Rating[] = ["family", "teen", "adult"];

// Consonants only (no vowels, no Y) so codes can't spell words.
export const ROOM_CODE_ALPHABET = "BCDFGHJKLMNPQRSTVWXZ";
export const ROOM_CODE_LENGTH = 4;
export const ROOM_CODE_RE = /^[BCDFGHJKLMNPQRSTVWXZ]{4}$/;

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 8;
export const NAME_MAX_LENGTH = 12;

export function normalizeRoomCode(input: string): string {
  return input.trim().toUpperCase();
}

// ---------- Views (server -> client, recomputed and sent in full after every change) ----------

export type RoomPhase = "lobby" | "starting" | "in-game";

/**
 * Which lobby screen the TV shows:
 * - "join": room code, QR and players (default)
 * - "pick": the VIP has touched the game or pack picker since the lobby opened
 * - "results": a game just finished; stays until the VIP picks, toggles a pack or starts
 */
export type LobbyScreen = "join" | "pick" | "results";

export interface PlayerSummary {
  id: PlayerId;
  name: string;
  avatar: AvatarId | null;
  connected: boolean;
  isVip: boolean;
  crowns: number;
  /** Joined while a game was running; plays from the next game. */
  waitingForNextGame: boolean;
}

export interface GameSummary {
  id: string;
  name: string;
  blurb: string;
  minPlayers: number;
  maxPlayers: number;
  minutes: number;
}

export interface PackSummary {
  id: string;
  name: string;
  rating: Rating;
  enabled: boolean;
  itemCount: number;
}

export interface Award {
  /** Game-defined id such as "best-liar"; the game's UI turns it into words. */
  id: string;
  /** Everyone who shares it (ties). */
  playerIds: PlayerId[];
  /** The number the award cites, e.g. people fooled. */
  value: number;
}

export const MAX_AWARDS = 3;

export interface GameResultSummary {
  gameId: string;
  scores: Record<PlayerId, number>;
  winnerIds: PlayerId[];
  /** False when the VIP ended the game early or too few players remained. */
  completed: boolean;
  /** Epoch ms the game ended; anchors the finale ceremony. 0 for results saved before this field existed. */
  finishedAt: number;
  /** Best first; empty when the game ended early or has no awards. */
  awards: Award[];
}

export interface ActiveGameView {
  id: string;
  /** Game-specific host or player view. Each game package exports its own view types. */
  view: unknown;
  /** Epoch ms of the current phase deadline, or null when nothing is timed. */
  deadline: number | null;
  /** Epoch ms when `deadline` was last set to its current value; null when nothing is timed. */
  timerStartedAt: number | null;
}

export interface RoomViewBase {
  code: string;
  phase: RoomPhase;
  lobbyScreen: LobbyScreen;
  players: PlayerSummary[];
  vipId: PlayerId | null;
  locked: boolean;
  games: GameSummary[];
  selectedGameId: string;
  /** Packs that apply to the selected game, with the room's on/off choice. */
  packs: PackSummary[];
  lastResult: GameResultSummary | null;
  game: ActiveGameView | null;
  /** Server clock when the view was built, so clients can correct timers for clock skew. */
  serverNow: number;
}

export interface HostRoomView extends RoomViewBase {
  role: "host";
}

export interface PlayerRoomView extends RoomViewBase {
  role: "player";
  you: PlayerId;
}

export type RoomView = HostRoomView | PlayerRoomView;

// ---------- Client -> server ----------

const shortText = (max = 64) => z.string().max(max);

export const avatarIdSchema = z.enum(AVATARS);

/** Every message a phone or host screen may send. Parsed at the socket boundary. */
export const clientMessageSchema = z.discriminatedUnion("t", [
  z.object({ t: z.literal("host-hello"), hostToken: shortText(128) }),
  z.object({ t: z.literal("join"), name: shortText(), token: shortText(128).optional() }),
  z.object({ t: z.literal("set-avatar"), avatar: avatarIdSchema }),
  z.object({ t: z.literal("pick-game"), gameId: shortText() }),
  z.object({ t: z.literal("set-pack"), packId: shortText(), enabled: z.boolean() }),
  z.object({ t: z.literal("set-locked"), locked: z.boolean() }),
  z.object({ t: z.literal("kick"), playerId: shortText() }),
  z.object({ t: z.literal("start-game") }),
  z.object({ t: z.literal("skip-phase") }),
  z.object({ t: z.literal("end-game") }),
  // The payload is JSON here; the game's own actionSchema parses it inside the room.
  z.object({ t: z.literal("game-action"), action: z.json() }),
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;

// ---------- Server -> client ----------

export type ErrorCode =
  | "bad-message"
  | "room-not-found"
  | "room-full"
  | "room-locked"
  | "name-invalid"
  | "name-taken"
  | "avatar-taken"
  | "not-joined"
  | "not-vip"
  | "not-enough-players"
  | "game-in-progress"
  | "invalid-action"
  | "host-token-invalid"
  | "rate-limited";

export type ServerMessage =
  | { t: "welcome"; role: "host" }
  | { t: "welcome"; role: "player"; playerId: PlayerId; token: string }
  | { t: "state"; view: RoomView }
  | { t: "error"; code: ErrorCode; message: string }
  | { t: "kicked" };

// ---------- HTTP API ----------

export interface CreateRoomResponse {
  code: string;
  hostToken: string;
}

export interface RoomInfoResponse {
  code: string;
  exists: boolean;
  locked: boolean;
  inGame: boolean;
  playerCount: number;
  /** False when the room is missing, locked or full. A running game still accepts joins (they wait). */
  joinable: boolean;
}

export type ApiErrorCode = "full-tonight" | "rate-limited" | "not-found" | "bad-request" | "internal";

export interface ApiErrorResponse {
  error: ApiErrorCode;
}

// ---------- Parsing untrusted client messages ----------

const MAX_MESSAGE_LENGTH = 4096;

function parseJson(text: string): z.core.util.JSONType | undefined {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** Parses a raw WebSocket frame into a ClientMessage, or returns null if it is malformed. */
export function parseClientMessage(raw: string | ArrayBuffer): ClientMessage | null {
  if (raw instanceof ArrayBuffer || raw.length > MAX_MESSAGE_LENGTH) return null;
  const result = clientMessageSchema.safeParse(parseJson(raw));
  return result.success ? result.data : null;
}

/** Trims and collapses whitespace; returns null if the name is empty or too long. */
export function cleanPlayerName(input: string): string | null {
  const name = input.replace(/\s+/g, " ").trim();
  if (name.length === 0 || name.length > NAME_MAX_LENGTH) return null;
  return name;
}
