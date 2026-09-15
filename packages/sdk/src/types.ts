// Game SDK contract. Games are pure, deterministic state machines: no I/O, no Date.now(),
// no Math.random(). All state is plain JSON so a Room Durable Object can persist it after
// every change and resume after a deploy or hibernation.

import type {
  AvatarId,
  ClientMessage,
  HostRoomView,
  PlayerId,
  PlayerRoomView,
  Rating,
  ServerMessage,
} from "@opg/protocol";
import type { ZodType, z } from "zod";

// ---------- Randomness ----------

/** Seeded, serializable RNG. Implementations must be deterministic for a given seed. */
export interface Rng {
  /** Float in [0, 1). */
  next(): number;
  /** Integer in [0, maxExclusive). */
  int(maxExclusive: number): number;
  /** Returns a new shuffled array; does not mutate the input. */
  shuffle<T>(items: readonly T[]): T[];
  /** Picks one element. Throws on an empty array. */
  pick<T>(items: readonly T[]): T;
}

// ---------- Content ----------

export type ContentKind = "word-pairs" | "facts";

export interface WordPair {
  /** Word every crew member sees, e.g. "giraffe". */
  crew: string;
  /** Similar word only the imposter sees, e.g. "zebra". */
  decoy: string;
}

export interface Fact {
  id: string;
  /** Prompt with exactly one blank written as "____" (four underscores). */
  prompt: string;
  answer: string;
  /** Other spellings that also count as the real answer (for catching players who type the truth). */
  alternates: string[];
  /** House lies used when too few players submitted. */
  decoys: string[];
  source: { title: string; url: string };
}

export interface WordPairContent {
  kind: "word-pairs";
  items: WordPair[];
}

export interface FactContent {
  kind: "facts";
  items: Fact[];
}

export type GameContent = WordPairContent | FactContent;

export interface PackMeta {
  id: string;
  name: string;
  kind: ContentKind;
  rating: Rating;
  language: string;
  itemCount: number;
}

/** Async content access, implemented by the Worker (D1) and by tests (in memory). */
export interface ContentSource {
  listPacks(): Promise<PackMeta[]>;
  /** Merged items from the given packs. */
  loadContent(kind: ContentKind, packIds: string[]): Promise<GameContent>;
}

// ---------- Games ----------

export interface GamePlayer {
  id: PlayerId;
  name: string;
  avatar: AvatarId | null;
}

export interface GameContext<C extends GameContent = GameContent> {
  /** Players in this game, in join order. Fixed for the whole game except removals. */
  players: readonly GamePlayer[];
  /** Players whose phone is connected right now (a subset of players). Use it to skip absent speakers or end a phase early. */
  connectedIds: readonly PlayerId[];
  rng: Rng;
  /** Epoch ms. */
  now: number;
  content: C;
}

export interface ViewContext {
  now: number;
}

export interface GameDefinition<State, Action, HostView, PlayerView, C extends GameContent = GameContent> {
  id: string;
  name: string;
  blurb: string;
  minPlayers: number;
  maxPlayers: number;
  /** Approximate length of a standard game, shown in the game picker. */
  minutes: number;
  contentKind: C["kind"];

  setup(ctx: GameContext<C>): State;
  /** Schema for untrusted action payloads from phones. RoomCore drops anything that fails it. */
  actionSchema: ZodType<Action>;
  /** Apply a player's action. Return the same state object when the action is not allowed right now. */
  onAction(state: State, playerId: PlayerId, action: Action, ctx: GameContext<C>): State;
  /** Epoch ms when the current phase times out, or null. */
  nextDeadline(state: State): number | null;
  /** Called when now >= nextDeadline(state), or when the VIP skips the phase. */
  onDeadline(state: State, ctx: GameContext<C>): State;
  /** A player was kicked mid-game. ctx.players no longer contains them. */
  onPlayerRemoved(state: State, playerId: PlayerId, ctx: GameContext<C>): State;
  hostView(state: State, ctx: ViewContext): HostView;
  /** Must never include another player's secrets. */
  playerView(state: State, playerId: PlayerId, ctx: ViewContext): PlayerView;
  isOver(state: State): boolean;
  scores(state: State): Record<PlayerId, number>;
  /** Bot policy for tests: the action a reasonable player would send now, or null to wait. */
  bot(view: PlayerView, rng: Rng): Action | null;
}

/**
 * A game with its type parameters erased, for registries that hold several games.
 * GameDefinition uses method syntax, so every concrete game is assignable here.
 * Actions stay JSON because they travel inside a game-action message.
 */
export type AnyGame = GameDefinition<unknown, z.core.util.JSONType, unknown, unknown>;

// ---------- Room engine ----------

/** Who sent a message to the room. "anonymous" is a socket that has not joined yet. */
export type Caller = { kind: "host" } | { kind: "player"; playerId: PlayerId } | { kind: "anonymous" };

export type RoomEffect =
  /** Adapter must load content, then call room.beginGame(content, now). */
  | { type: "load-content"; kind: ContentKind; packIds: string[] }
  /** Adapter must close every socket attached to this player. */
  | { type: "disconnect-player"; playerId: PlayerId }
  /** For anonymous match stats. */
  | { type: "game-finished"; gameId: string; playerCount: number; durationMs: number; completed: boolean };

export interface HandleResult {
  /** Messages for the caller only (welcome, errors). */
  reply: ServerMessage[];
  effects: RoomEffect[];
  /** True when any view may have changed: the adapter persists the snapshot and rebroadcasts views. */
  changed: boolean;
}

/** Opaque, versioned room state. Adapters persist it as-is; only restoreRoom reads `data`. */
export interface RoomSnapshot {
  version: 1;
  /** JSON-encoded engine state. */
  data: string;
}

export interface RoomCore {
  readonly code: string;
  /** Replace the pack catalog (loaded by the adapter at startup). Packs default on for family/teen, off for adult. */
  setPackCatalog(packs: PackMeta[], now: number): HandleResult;
  handle(caller: Caller, message: ClientMessage, now: number): HandleResult;
  /** Continue a "load-content" effect. */
  beginGame(content: GameContent, now: number): HandleResult;
  /** Content failed to load: return to lobby. */
  abortStart(now: number): HandleResult;
  /** Process any deadlines at or before now. */
  tick(now: number): HandleResult;
  setConnected(playerId: PlayerId, connected: boolean, now: number): HandleResult;
  setHostConnected(connected: boolean, now: number): HandleResult;
  nextDeadline(): number | null;
  hostView(now: number): HostRoomView;
  playerView(playerId: PlayerId, now: number): PlayerRoomView;
  playerIds(): PlayerId[];
  snapshot(): RoomSnapshot;
  /** No host or player connected since the given time and no game running. */
  isIdleSince(now: number, idleMs: number): boolean;
}

export interface CreateRoomOptions {
  code: string;
  hostToken: string;
  games: AnyGame[];
  /** Seed for game randomness (imposter choice, shuffles). */
  seed: number;
  now: number;
  /** Unguessable id/token generator. The Worker passes crypto.randomUUID; tests pass a counter. */
  newToken: () => string;
}

// ---------- Testing ----------

export interface PlaythroughOptions {
  game: AnyGame;
  content: GameContent;
  players: number;
  seed: number;
  /** Disconnect one bot mid-game and rejoin it with its token; asserts the seat and score survive. */
  disconnectRejoin?: boolean;
  maxSteps?: number;
}

export interface PlaythroughResult {
  finished: boolean;
  steps: number;
  scores: Record<PlayerId, number>;
  winnerIds: PlayerId[];
  rejoinedPlayerId: PlayerId | null;
  log: string[];
}
