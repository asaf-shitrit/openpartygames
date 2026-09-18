// Test harness for games and RoomCore. Bots drive the real room engine the same way
// phones do: they read their own playerView and send actions, never poking at state.
// The clock is fake — it only moves when every bot is waiting, to the next deadline.

import type { GameResultSummary, PlayerId, ServerMessage } from "@opg/protocol";
import { mergeContent } from "./content";
import { createRng } from "./rng";
import { createRoom } from "./room";
import type {
  AnyGame,
  Caller,
  ContentKind,
  ContentSource,
  GameContent,
  PackMeta,
  PlaythroughOptions,
  PlaythroughResult,
  Rng,
  RoomCore,
  RoomEffect,
} from "./types";

// ---------- In-memory content ----------

export interface MemoryPack {
  meta: PackMeta;
  content: GameContent;
}

/** In-memory ContentSource for tests: packs are listed as-is; loadContent merges enabled ids. */
export function createMemoryContentSource(
  packs: readonly MemoryPack[],
): ContentSource {
  return {
    async listPacks(): Promise<PackMeta[]> {
      return packs.map((p) => ({ ...p.meta }));
    },
    async loadContent(
      kind: ContentKind,
      packIds: string[],
    ): Promise<GameContent> {
      const wanted = new Set(packIds);
      return mergeContent(
        kind,
        packs.filter((p) => wanted.has(p.meta.id)).map((p) => p.content),
      );
    },
  };
}

// ---------- Bot playthrough ----------

type PlayerWelcome = Extract<ServerMessage, { t: "welcome"; role: "player" }>;
type FinishedEffect = Extract<RoomEffect, { type: "game-finished" }>;

const DISCONNECT_STEP = 2;
const REJOIN_STEP = 4;
const MAX_STUCK_STEPS = 3;
const ROOM_CODE = "BCDF";
const HOST_TOKEN = "host-secret";
const CONTENT_PACK_ID = "pack-test";

function findWelcome(reply: ServerMessage[]): PlayerWelcome | null {
  for (const m of reply) {
    if (m.t === "welcome" && m.role === "player") return m;
  }
  return null;
}

function findFinished(effects: RoomEffect[]): FinishedEffect | null {
  for (const e of effects) {
    if (e.type === "game-finished") return e;
  }
  return null;
}

/** Live game scores, read from the persisted snapshot (works mid-game). */
function liveScores(
  room: RoomCore,
  game: AnyGame,
): Record<PlayerId, number> | null {
  try {
    // The snapshot's data is the engine's JSON state; read the running game's state from it.
    const persisted = JSON.parse(room.snapshot().data);
    const state = persisted.game?.state;
    if (state === undefined) return null;
    return game.scores(state);
  } catch {
    return null;
  }
}

interface BotSession {
  room: RoomCore;
  playerIds: PlayerId[];
  tokens: Map<PlayerId, string>;
  log: string[];
}

function validatePlaythrough(options: PlaythroughOptions): void {
  if (options.players < 1) {
    throw new Error("runBotPlaythrough needs at least one player");
  }
  if (options.disconnectRejoin === true && options.players < 2) {
    throw new Error("disconnectRejoin needs at least two players");
  }
}

/** Creates the room, joins the bots, picks the game and starts it with the supplied content. */
function openBotSession(options: PlaythroughOptions): BotSession {
  let tokenSeq = 0;
  const newToken = (): string => `tok-${tokenSeq++}`;
  const room = createRoom({
    code: ROOM_CODE,
    hostToken: HOST_TOKEN,
    games: [options.game],
    seed: options.seed,
    now: 0,
    newToken,
    sharedScreen: options.sharedScreen ?? true,
  });
  const log: string[] = [];
  room.handle({ kind: "host" }, { t: "host-hello", hostToken: HOST_TOKEN }, 0);
  // start-game requires at least one enabled pack that matches the game's content kind.
  room.setPackCatalog(
    [
      {
        id: CONTENT_PACK_ID,
        name: "Test Pack",
        kind: options.game.contentKind,
        rating: "family",
        language: "en",
        itemCount: options.content.items.length,
      },
    ],
    0,
  );

  const playerIds: PlayerId[] = [];
  const tokens = new Map<PlayerId, string>();
  for (let i = 0; i < options.players; i++) {
    const res = room.handle(
      { kind: "anonymous" },
      { t: "join", name: `Bot${i + 1}` },
      0,
    );
    const welcome = findWelcome(res.reply);
    if (!welcome) {
      throw new Error(
        `Bot${i + 1} could not join: ${JSON.stringify(res.reply)}`,
      );
    }
    playerIds.push(welcome.playerId);
    tokens.set(welcome.playerId, welcome.token);
    log.push(`joined Bot${i + 1} as ${welcome.playerId}`);
  }

  const [vipId] = playerIds;
  if (vipId === undefined) throw new Error("no bot joined the room");
  const vip: Caller = { kind: "player", playerId: vipId };
  room.handle(vip, { t: "pick-game", gameId: options.game.id }, 0);
  const startRes = room.handle(vip, { t: "start-game" }, 0);
  if (!startRes.effects.some((e) => e.type === "load-content")) {
    throw new Error(
      `start-game did not request content: ${JSON.stringify(startRes.reply)}`,
    );
  }
  room.beginGame(options.content, 0);
  log.push(`started ${options.game.id} with ${options.players} players`);
  return { room, playerIds, tokens, log };
}

/** One bot playthrough: drives turns, rejoin, deadlines and the step budget. */
class BotPlaythrough {
  private readonly room: RoomCore;
  private readonly game: AnyGame;
  private readonly playerIds: PlayerId[];
  private readonly tokens: Map<PlayerId, string>;
  private readonly botRng: Rng;
  private readonly maxSteps: number;
  private readonly target: PlayerId | null;
  private readonly log: string[];

  private clock = 0;
  private steps = 0;
  private stepsInGame = 0;
  private cursor = 0;
  private stuck = 0;
  private finished = false;
  private stopped = false;
  private detachedId: PlayerId | null = null;
  private detachedScore = 0;
  private rejoinedPlayerId: PlayerId | null = null;

  constructor(options: PlaythroughOptions, session: BotSession) {
    this.room = session.room;
    this.playerIds = session.playerIds;
    this.tokens = session.tokens;
    this.log = session.log;
    this.game = options.game;
    this.maxSteps = options.maxSteps ?? 500;
    this.target =
      options.disconnectRejoin === true ? (session.playerIds[1] ?? null) : null;
    this.botRng = createRng((options.seed ^ 0x9e3779b9) >>> 0);
  }

  run(): void {
    while (this.steps < this.maxSteps && !this.finished && !this.stopped) {
      this.step();
    }
  }

  private step(): void {
    this.steps++;
    this.stepsInGame++;
    this.handleRejoin();
    if (!this.botTurn()) this.waitForAction();
  }

  private handleRejoin(): void {
    if (this.target === null || this.rejoinedPlayerId !== null) return;
    if (this.detachedId === null) this.maybeDisconnect(this.target);
    else this.maybeRejoin(this.detachedId);
  }

  private maybeDisconnect(target: PlayerId): void {
    if (this.stepsInGame < DISCONNECT_STEP) return;
    this.detachedScore = liveScores(this.room, this.game)?.[target] ?? 0;
    this.room.setConnected(target, false, this.clock);
    this.detachedId = target;
    this.log.push(`disconnected ${target} at step ${this.stepsInGame}`);
  }

  private maybeRejoin(id: PlayerId): void {
    if (this.stepsInGame < REJOIN_STEP) return;
    const after = this.rejoinAndReadScore(id);
    if (after < this.detachedScore) {
      throw new Error(
        `score decreased across rejoin: ${this.detachedScore} -> ${after}`,
      );
    }
    this.rejoinedPlayerId = id;
    this.detachedId = null;
    this.log.push(
      `rejoined ${id} at step ${this.stepsInGame} with score ${after}`,
    );
  }

  private rejoinAndReadScore(id: PlayerId): number {
    const token = this.tokens.get(id);
    if (token === undefined) throw new Error(`no rejoin token for ${id}`);
    const res = this.room.handle(
      { kind: "anonymous" },
      { t: "join", name: "Rejoin", token },
      this.clock,
    );
    const welcome = findWelcome(res.reply);
    if (!welcome || welcome.playerId !== id) {
      throw new Error(
        `rejoin did not keep player id (${id}): ${JSON.stringify(res.reply)}`,
      );
    }
    return liveScores(this.room, this.game)?.[id] ?? 0;
  }

  /** Runs one round-robin turn; returns true when a bot acted. */
  private botTurn(): boolean {
    for (let i = 0; i < this.playerIds.length; i++) {
      const index = (this.cursor + i) % this.playerIds.length;
      const pid = this.playerIds[index];
      if (pid === undefined || pid === this.detachedId) continue;
      const view = this.room.playerView(pid, this.clock);
      if (!view.game) continue;
      const action = this.game.bot(view.game.view, this.botRng);
      if (action === null || action === undefined) continue;
      const res = this.room.handle(
        { kind: "player", playerId: pid },
        { t: "game-action", action },
        this.clock,
      );
      this.cursor = (index + 1) % this.playerIds.length;
      this.noteFinished(res.effects);
      return true;
    }
    return false;
  }

  private noteFinished(effects: RoomEffect[]): void {
    if (findFinished(effects)?.completed !== true) return;
    this.finished = true;
    this.log.push(`finished at step ${this.stepsInGame}`);
  }

  private waitForAction(): void {
    if (this.finished) return;
    const deadline = this.room.nextDeadline();
    if (deadline !== null && deadline > this.clock) {
      this.clock = deadline;
      this.stuck = 0;
      // Games usually end on a timer (the last result phase), so the tick can finish the game too.
      this.noteFinished(this.room.tick(this.clock).effects);
      return;
    }
    this.stuck++;
    if (this.stuck > MAX_STUCK_STEPS) {
      this.log.push("no bot acted and the clock cannot advance; stopping");
      this.stopped = true;
    }
  }

  result(): PlaythroughResult {
    const lastResult = this.room.hostView(this.clock).lastResult;
    const fields = resultFields(
      lastResult,
      liveScores(this.room, this.game) ?? {},
    );
    return {
      finished: this.finished,
      steps: this.steps,
      ...fields,
      rejoinedPlayerId: this.rejoinedPlayerId,
      log: this.log,
    };
  }
}

/** The score/winner/award fields for a playthrough result, falling back to live state. */
function resultFields(
  lastResult: GameResultSummary | null,
  fallbackScores: Record<PlayerId, number>,
) {
  return {
    scores: lastResult?.scores ?? fallbackScores,
    winnerIds: lastResult?.winnerIds ?? [],
    awards: lastResult?.awards ?? [],
  };
}

/**
 * Drives one full game with bot players. Bots act one at a time in round-robin order on
 * their own playerView; when nobody can act, the fake clock jumps to nextDeadline and
 * tick() runs. With disconnectRejoin, bot 2 drops mid-game and rejoins by token.
 */
export function runBotPlaythrough(
  options: PlaythroughOptions,
): PlaythroughResult {
  validatePlaythrough(options);
  const session = openBotSession(options);
  const playthrough = new BotPlaythrough(options, session);
  playthrough.run();
  return playthrough.result();
}
