import type {
  ClientMessage,
  HostRoomView,
  PlayerRoomView,
  ServerMessage,
} from "@opg/protocol";
import type {
  Caller,
  ContentKind,
  ContentSource,
  GameContent,
  PackMeta,
  RoomSnapshot,
  WordPair,
} from "@opg/sdk";
import { mergeContent } from "@opg/sdk";
import { GAMES } from "../games";
import {
  RoomHub,
  type HubSocket,
  type HubSockets,
  type HubStorage,
} from "../room-hub";
import type { MatchStats } from "../stats";

export const WORD_PACK: PackMeta = {
  id: "starter",
  name: "Starter",
  kind: "word-pairs",
  rating: "family",
  language: "en",
  itemCount: 2,
};

/** The snapshot payload fields the tests assert on. */
export interface StoredRoom {
  code: string;
  phase: string;
  players: unknown[];
  hostConnected?: boolean;
  emptySince?: number | null;
}

/** Decodes the engine state the hub persists inside the opaque snapshot. */
export function storedRoom(
  snapshot: RoomSnapshot | undefined,
): StoredRoom | undefined {
  if (!snapshot) return undefined;
  try {
    // `data` is the JSON-encoded engine state written by RoomCore.snapshot().
    const parsed: StoredRoom = JSON.parse(snapshot.data);
    return parsed;
  } catch {
    return undefined;
  }
}

/** A socket that records everything the hub sends it. */
export class FakeSocket implements HubSocket {
  readonly sent: ServerMessage[] = [];
  closed: { code: number; reason: string } | null = null;
  private current: Caller = { kind: "anonymous" };

  constructor(private readonly registry?: FakeSockets) {}

  send(message: ServerMessage): void {
    this.sent.push(message);
  }

  close(code: number, reason: string): void {
    this.closed = { code, reason };
    // The runtime drops a closed socket from getWebSockets(); the fake does the same.
    this.registry?.remove(this);
  }

  caller(): Caller {
    return this.current;
  }

  setCaller(caller: Caller): void {
    this.current = caller;
  }

  welcome(): Extract<ServerMessage, { t: "welcome" }> | undefined {
    let found: Extract<ServerMessage, { t: "welcome" }> | undefined;
    for (const message of this.sent) {
      if (message.t === "welcome") found = message;
    }
    return found;
  }

  wasKicked(): boolean {
    return this.sent.some((m) => m.t === "kicked");
  }

  lastHostView(): HostRoomView | undefined {
    let found: HostRoomView | undefined;
    for (const view of this.views()) {
      if (view.role === "host") found = view;
    }
    return found;
  }

  lastPlayerView(): PlayerRoomView | undefined {
    let found: PlayerRoomView | undefined;
    for (const view of this.views()) {
      if (view.role === "player") found = view;
    }
    return found;
  }

  clearSent(): void {
    this.sent.length = 0;
  }

  private views(): (HostRoomView | PlayerRoomView)[] {
    return this.sent.flatMap((m) => (m.t === "state" ? [m.view] : []));
  }
}

/** Player id from this socket's own welcome, or null when it never joined. */
export function welcomedPlayerId(socket: FakeSocket): string | null {
  const welcome = socket.welcome();
  return welcome?.role === "player" ? welcome.playerId : null;
}

/** Player token from this socket's own welcome, for reconnecting a second socket. */
export function welcomedToken(socket: FakeSocket): string | null {
  const welcome = socket.welcome();
  return welcome?.role === "player" ? welcome.token : null;
}

export function connectedIn(
  view: HostRoomView | undefined,
  playerId: string,
): boolean {
  return view?.players.find((p) => p.id === playerId)?.connected === true;
}

export class FakeSockets implements HubSockets {
  readonly held: HubSocket[] = [];

  all(): HubSocket[] {
    return [...this.held];
  }

  add(socket: HubSocket): void {
    this.held.push(socket);
  }

  remove(socket: HubSocket): void {
    const index = this.held.indexOf(socket);
    if (index >= 0) this.held.splice(index, 1);
  }
}

export class FakeStorage implements HubStorage {
  stored: RoomSnapshot | undefined;
  readonly alarms: number[] = [];
  deletions = 0;

  constructor(stored?: RoomSnapshot) {
    this.stored = stored;
  }

  async get(): Promise<RoomSnapshot | undefined> {
    return this.stored;
  }

  async put(snapshot: RoomSnapshot): Promise<void> {
    this.stored = snapshot;
  }

  async deleteAll(): Promise<void> {
    this.stored = undefined;
    this.deletions += 1;
  }

  async setAlarm(at: number): Promise<void> {
    this.alarms.push(at);
  }
}

/** In-memory content: one family word-pairs pack, switchable to fail. */
export class FakeContent implements ContentSource {
  packs: PackMeta[] = [WORD_PACK];
  wordPairs: WordPair[] = [
    { crew: "giraffe", decoy: "zebra" },
    { crew: "otter", decoy: "seal" },
  ];
  loadCalls = 0;
  catalogFails = false;
  contentFails = false;

  async listPacks(): Promise<PackMeta[]> {
    if (this.catalogFails) throw new Error("catalog unavailable");
    return this.packs;
  }

  async loadContent(kind: ContentKind): Promise<GameContent> {
    this.loadCalls += 1;
    if (this.contentFails) throw new Error("content unavailable");
    return mergeContent(kind, [{ kind: "word-pairs", items: this.wordPairs }]);
  }
}

export class FakeClock {
  private time: number;

  constructor(start: number) {
    this.time = start;
  }

  now(): number {
    return this.time;
  }

  advance(ms: number): void {
    this.time += ms;
  }
}

export class FakeStats {
  readonly recorded: MatchStats[] = [];
  fails = false;

  async record(stats: MatchStats): Promise<void> {
    if (this.fails) throw new Error("stats unavailable");
    this.recorded.push(stats);
  }
}

export interface HubHarness {
  hub: RoomHub;
  clock: FakeClock;
  storage: FakeStorage;
  sockets: FakeSockets;
  content: FakeContent;
  stats: FakeStats;
}

/** A hub wired to in-memory fakes, exactly like the Durable Object adapter wires Cloudflare. */
export function makeHub(snapshot?: RoomSnapshot): HubHarness {
  const clock = new FakeClock(1_700_000_000_000);
  const storage = new FakeStorage(snapshot);
  const sockets = new FakeSockets();
  const content = new FakeContent();
  const stats = new FakeStats();
  let tokens = 0;
  const hub = new RoomHub(
    {
      games: GAMES,
      content,
      storage,
      sockets,
      stats,
      now: () => clock.now(),
      newToken: () => `t${++tokens}`,
      seed: () => 42,
    },
    snapshot,
  );
  return { hub, clock, storage, sockets, content, stats };
}

/** Accepts a new socket the way the Durable Object adapter does. */
export function accept(harness: HubHarness): FakeSocket {
  const socket = new FakeSocket(harness.sockets);
  harness.hub.accept(socket);
  return socket;
}

/** Sends one client message through the hub and waits for the effects to finish. */
export function send(
  hub: RoomHub,
  socket: FakeSocket,
  message: ClientMessage,
): Promise<void> {
  return hub.message(socket, JSON.stringify(message));
}

/** Host socket that has said hello, so it receives broadcasts. */
export async function connectHost(
  harness: HubHarness,
  hostToken = "host-token",
): Promise<FakeSocket> {
  const host = accept(harness);
  await send(harness.hub, host, { t: "host-hello", hostToken });
  return host;
}

/** Joins a new player and returns its socket. */
export async function joinPlayer(
  harness: HubHarness,
  name: string,
): Promise<FakeSocket> {
  const player = accept(harness);
  await send(harness.hub, player, { t: "join", name });
  return player;
}

/** The client went away: the runtime drops the socket, then tells the hub. */
export async function disconnect(
  harness: HubHarness,
  socket: FakeSocket,
): Promise<void> {
  harness.sockets.remove(socket);
  await harness.hub.close(socket);
}
