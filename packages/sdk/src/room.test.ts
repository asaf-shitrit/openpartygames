// RoomCore rules tests. Every test drives the room through its public API only:
// handle() with a fake clock and a counter token generator, exactly like the Worker adapter.
import { describe, expect, it } from "vitest";
import type { Award, ClientMessage, PlayerId, ServerMessage } from "@opg/protocol";
import { tapGame } from "./fixtures/tap-game";
import type {
  Caller,
  ContentKind,
  GameContent,
  PackMeta,
  RoomCore,
} from "./types";
import { createRoom, restoreRoom, sanitizeAwards } from "./room";

const tapWithAwards = {
  ...tapGame,
  id: "tap-awards",
  awards: (state: { scores: Record<PlayerId, number> }): Award[] => {
    const top = Math.max(0, ...Object.values(state.scores));
    if (top <= 0) return [];
    const winners = Object.keys(state.scores).filter(
      (id) => state.scores[id] === top,
    );
    return [{ id: "high-scorer", playerIds: winners, value: top }];
  },
};

const HOST_TOKEN = "host-secret";

const PACK_FAMILY: PackMeta = {
  id: "pack-family",
  name: "Family Pack",
  kind: "word-pairs",
  rating: "family",
  language: "en",
  itemCount: 4,
};
const PACK_TEEN: PackMeta = {
  id: "pack-teen",
  name: "Teen Pack",
  kind: "word-pairs",
  rating: "teen",
  language: "en",
  itemCount: 4,
};
const PACK_ADULT: PackMeta = {
  id: "pack-adult",
  name: "Adult Pack",
  kind: "word-pairs",
  rating: "adult",
  language: "en",
  itemCount: 4,
};
const PACK_FACTS: PackMeta = {
  id: "pack-facts",
  name: "Facts Pack",
  kind: "facts",
  rating: "family",
  language: "en",
  itemCount: 4,
};

const CONTENT: GameContent = {
  kind: "word-pairs",
  items: [
    { crew: "giraffe", decoy: "zebra" },
    { crew: "moon", decoy: "sun" },
    { crew: "bread", decoy: "cake" },
    { crew: "river", decoy: "lake" },
  ],
};

const EMPTY_CONTENT: GameContent = { kind: "word-pairs", items: [] };

interface RoomOptions {
  code?: string;
  packs?: PackMeta[];
  seed?: number;
  game?: typeof tapGame;
}

interface Harness {
  room: RoomCore;
  host: Caller;
  now: () => number;
  setNow: (value: number) => void;
  advance: (ms: number) => number;
}

function at<T>(items: readonly T[], index: number): T {
  const value = items[index];
  if (value === undefined)
    throw new Error(`expected an item at index ${index}`);
  return value;
}

function makeRoom(options?: RoomOptions): Harness {
  let clock = 0;
  let seq = 0;
  const newToken = (): string => {
    seq++;
    return `t${seq}`;
  };
  const room = createRoom({
    code: options?.code ?? "BCDF",
    hostToken: HOST_TOKEN,
    games: [options?.game ?? tapGame],
    seed: options?.seed ?? 1,
    now: clock,
    newToken,
  });
  if (options?.packs) room.setPackCatalog(options.packs, clock);
  return {
    room,
    host: { kind: "host" },
    now: () => clock,
    setNow: (value: number) => {
      clock = value;
    },
    advance: (ms: number) => {
      clock += ms;
      return clock;
    },
  };
}

type PlayerWelcome = Extract<ServerMessage, { t: "welcome"; role: "player" }>;
type ErrorReply = Extract<ServerMessage, { t: "error" }>;

function welcomeOf(reply: readonly ServerMessage[]): PlayerWelcome {
  const found = reply.find(
    (m): m is PlayerWelcome => m.t === "welcome" && m.role === "player",
  );
  if (!found) throw new Error(`no player welcome in ${JSON.stringify(reply)}`);
  return found;
}

function errorsOf(reply: readonly ServerMessage[]): ErrorReply[] {
  return reply.filter((m): m is ErrorReply => m.t === "error");
}

function errorCode(reply: readonly ServerMessage[]): string | null {
  const first = errorsOf(reply)[0];
  return first ? first.code : null;
}

function hasLoadContent(effects: readonly { type: string }[]): boolean {
  return effects.some((e) => e.type === "load-content");
}

function join(room: RoomCore, name: string, now: number): PlayerWelcome {
  return welcomeOf(
    room.handle({ kind: "anonymous" }, { t: "join", name }, now).reply,
  );
}

function joinMany(
  room: RoomCore,
  names: string[],
  now: number,
): PlayerWelcome[] {
  return names.map((name) => join(room, name, now));
}

function vip(_room: RoomCore, playerId: PlayerId): Caller {
  return { kind: "player", playerId };
}

function idsOf(players: readonly PlayerWelcome[]): PlayerId[] {
  return players.map((p) => p.playerId);
}

/** Pick the tap game as the VIP and kick off content loading. Leaves the room in "starting". */
function startTap(h: Harness, ids: PlayerId[], gameId = tapGame.id): void {
  h.room.handle(
    vip(h.room, at(ids, 0)),
    { t: "pick-game", gameId },
    h.now(),
  );
  h.room.handle(vip(h.room, at(ids, 0)), { t: "start-game" }, h.now());
  h.room.beginGame(CONTENT, h.now());
}

describe("createRoom", () => {
  it("starts in the lobby on the join screen with the first game selected", () => {
    const h = makeRoom({ packs: [PACK_FAMILY] });
    const view = h.room.hostView(0);
    expect(view.phase).toBe("lobby");
    expect(view.lobbyScreen).toBe("join");
    expect(view.locked).toBe(false);
    expect(view.selectedGameId).toBe(tapGame.id);
    expect(view.players).toEqual([]);
    expect(view.vipId).toBeNull();
    expect(view.lastResult).toBeNull();
    expect(view.game).toBeNull();
  });
});

describe("host-hello", () => {
  it("welcomes the host when the token matches", () => {
    const h = makeRoom();
    const res = h.room.handle(
      h.host,
      { t: "host-hello", hostToken: HOST_TOKEN },
      0,
    );
    expect(res.reply).toEqual([{ t: "welcome", role: "host" }]);
  });

  it("rejects a wrong host token without changing the room", () => {
    const h = makeRoom();
    const res = h.room.handle(
      h.host,
      { t: "host-hello", hostToken: "nope" },
      0,
    );
    expect(errorCode(res.reply)).toBe("host-token-invalid");
    expect(res.changed).toBe(false);
  });
});

describe("join", () => {
  it("assigns an id and token", () => {
    const h = makeRoom();
    const w = join(h.room, "Maya", 0);
    expect(w.playerId).toBe("t1");
    expect(w.token).toBe("t2");
    expect(h.room.playerIds()).toEqual([w.playerId]);
  });

  it("rejoins by token keeping id and score", () => {
    const h = makeRoom({ packs: [PACK_FAMILY] });
    const players = joinMany(h.room, ["Maya", "Leo", "Nia"], 0);
    startTap(h, idsOf(players));
    const [maya, leo] = players;
    const leoId = leo ? leo.playerId : "";
    h.room.handle(
      vip(h.room, leoId),
      { t: "game-action", action: { type: "tap" } },
      0,
    );
    h.room.setConnected(leoId, false, 0);

    const res = h.room.handle(
      { kind: "anonymous" },
      { t: "join", name: "Ignored", token: leo ? leo.token : "" },
      0,
    );
    const w = welcomeOf(res.reply);
    expect(w.playerId).toBe(leoId);
    expect(w.token).toBe(leo?.token);
    expect(h.room.playerView(leoId, 0).players).toHaveLength(3);
    expect(h.room.playerView(leoId, 0).game?.view).toMatchObject({
      myScore: 100,
    });
    expect(maya).toBeDefined();
  });

  it("rejects an empty or overlong name", () => {
    const h = makeRoom();
    expect(
      errorCode(
        h.room.handle({ kind: "anonymous" }, { t: "join", name: "   " }, 0)
          .reply,
      ),
    ).toBe("name-invalid");
    expect(
      errorCode(
        h.room.handle(
          { kind: "anonymous" },
          { t: "join", name: "x".repeat(13) },
          0,
        ).reply,
      ),
    ).toBe("name-invalid");
  });

  it("rejects a name taken case-insensitively", () => {
    const h = makeRoom();
    join(h.room, "Maya", 0);
    const res = h.room.handle(
      { kind: "anonymous" },
      { t: "join", name: "  maya " },
      0,
    );
    expect(errorCode(res.reply)).toBe("name-taken");
    expect(h.room.playerIds()).toHaveLength(1);
  });

  it("fills the room at 8 players", () => {
    const h = makeRoom();
    joinMany(h.room, ["A", "B", "C", "D", "E", "F", "G", "H"], 0);
    const res = h.room.handle(
      { kind: "anonymous" },
      { t: "join", name: "Ninth" },
      0,
    );
    expect(errorCode(res.reply)).toBe("room-full");
    expect(h.room.playerIds()).toHaveLength(8);
  });

  it("rejects a join while locked", () => {
    const h = makeRoom();
    const first = join(h.room, "Maya", 0);
    h.room.handle(
      vip(h.room, first.playerId),
      { t: "set-locked", locked: true },
      0,
    );
    const res = h.room.handle(
      { kind: "anonymous" },
      { t: "join", name: "Late" },
      0,
    );
    expect(errorCode(res.reply)).toBe("room-locked");
  });

  it("gives the first free avatar and reports taken ones", () => {
    const h = makeRoom();
    join(h.room, "Maya", 0);
    const second = join(h.room, "Leo", 0);
    const view = h.room.hostView(0);
    expect(view.players[0]?.avatar).toBe("blob");
    expect(view.players[1]?.avatar).toBe("toast");

    const taken = h.room.handle(
      vip(h.room, second.playerId),
      { t: "set-avatar", avatar: "blob" },
      0,
    );
    expect(errorCode(taken.reply)).toBe("avatar-taken");

    const ok = h.room.handle(
      vip(h.room, second.playerId),
      { t: "set-avatar", avatar: "star" },
      0,
    );
    expect(errorCode(ok.reply)).toBeNull();
    expect(h.room.hostView(0).players[1]?.avatar).toBe("star");
  });

  it("rejects an avatar from someone who has not joined", () => {
    const h = makeRoom();
    const res = h.room.handle(
      { kind: "anonymous" },
      { t: "set-avatar", avatar: "star" },
      0,
    );
    expect(errorCode(res.reply)).toBe("not-joined");
  });
});

describe("VIP", () => {
  it("is the first player to join and moves with the earliest connected player", () => {
    const h = makeRoom();
    const players = joinMany(h.room, ["Maya", "Leo", "Nia"], 0);
    expect(h.room.hostView(0).vipId).toBe(at(players, 0).playerId);
  });

  it("keeps the VIP when they kick someone else", () => {
    const h = makeRoom();
    const players = joinMany(h.room, ["Maya", "Leo", "Nia"], 0);
    const [maya, leo, nia] = players;
    const res = h.room.handle(
      vip(h.room, maya ? maya.playerId : ""),
      {
        t: "kick",
        playerId: leo ? leo.playerId : "",
      },
      0,
    );
    expect(res.effects).toContainEqual({
      type: "disconnect-player",
      playerId: leo ? leo.playerId : "",
    });
    expect(h.room.hostView(0).vipId).toBe(maya?.playerId);
    expect(h.room.playerIds()).toEqual([maya?.playerId, nia?.playerId]);
  });

  it("hands the VIP to the earliest connected player only after 60s", () => {
    const h = makeRoom();
    const players = joinMany(h.room, ["Maya", "Leo", "Nia"], 0);
    const [maya, leo] = players;
    const mayaId = maya ? maya.playerId : "";
    h.room.setConnected(mayaId, false, 0);
    expect(h.room.nextDeadline()).toBe(60_000);

    h.room.tick(59_999);
    expect(h.room.hostView(59_999).vipId).toBe(mayaId);

    h.room.tick(60_000);
    expect(h.room.hostView(60_000).vipId).toBe(leo ? leo.playerId : "");
    expect(h.room.nextDeadline()).toBeNull();
  });

  it("gives the VIP back to the earliest connected player even if that player reconnected later", () => {
    const h = makeRoom();
    const players = joinMany(h.room, ["Maya", "Leo", "Nia"], 0);
    const [maya, leo] = players;
    h.room.setConnected(maya ? maya.playerId : "", false, 0);
    h.room.setConnected(maya ? maya.playerId : "", true, 10_000);
    h.room.tick(10_000);
    expect(h.room.hostView(10_000).vipId).toBe(maya?.playerId);
    expect(h.room.nextDeadline()).toBeNull();
    expect(leo).toBeDefined();
  });

  it("rejects every VIP-only message from a non-VIP", () => {
    const h = makeRoom({ packs: [PACK_FAMILY] });
    const players = joinMany(h.room, ["Maya", "Leo", "Nia"], 0);
    const nonVip = vip(h.room, at(players, 1).playerId);
    const lobbyMessages: ClientMessage[] = [
      { t: "pick-game", gameId: tapGame.id },
      { t: "set-pack", packId: PACK_FAMILY.id, enabled: false },
      { t: "set-locked", locked: true },
      { t: "kick", playerId: at(players, 2).playerId },
      { t: "start-game" },
    ];
    for (const message of lobbyMessages) {
      expect(errorCode(h.room.handle(nonVip, message, 0).reply)).toBe(
        "not-vip",
      );
    }
    expect(h.room.hostView(0).locked).toBe(false);
    expect(h.room.playerIds()).toHaveLength(3);
  });

  it("rejects skip-phase and end-game from a non-VIP mid-game", () => {
    const h = makeRoom({ packs: [PACK_FAMILY] });
    const players = joinMany(h.room, ["Maya", "Leo", "Nia"], 0);
    startTap(h, idsOf(players));
    const nonVip = vip(h.room, at(players, 1).playerId);
    expect(errorCode(h.room.handle(nonVip, { t: "skip-phase" }, 0).reply)).toBe(
      "not-vip",
    );
    expect(errorCode(h.room.handle(nonVip, { t: "end-game" }, 0).reply)).toBe(
      "not-vip",
    );
    expect(h.room.hostView(0).phase).toBe("in-game");
  });
});

describe("picking a game and packs", () => {
  it("rejects an unknown game id", () => {
    const h = makeRoom({ packs: [PACK_FAMILY] });
    const [first] = joinMany(h.room, ["Maya", "Leo", "Nia"], 0);
    const res = h.room.handle(
      vip(h.room, first ? first.playerId : ""),
      { t: "pick-game", gameId: "nope" },
      0,
    );
    expect(errorCode(res.reply)).toBe("invalid-action");
  });

  it("moves the lobby screen to pick when the VIP picks", () => {
    const h = makeRoom({ packs: [PACK_FAMILY] });
    const first = join(h.room, "Maya", 0);
    expect(h.room.hostView(0).lobbyScreen).toBe("join");
    h.room.handle(
      vip(h.room, first.playerId),
      { t: "pick-game", gameId: tapGame.id },
      0,
    );
    expect(h.room.hostView(0).lobbyScreen).toBe("pick");
  });

  it("rejects a pack whose kind does not match the selected game", () => {
    const h = makeRoom({ packs: [PACK_FACTS] });
    const first = join(h.room, "Maya", 0);
    const res = h.room.handle(
      vip(h.room, first.playerId),
      { t: "set-pack", packId: PACK_FACTS.id, enabled: false },
      0,
    );
    expect(errorCode(res.reply)).toBe("invalid-action");
  });

  it("defaults family and teen packs on and adult packs off", () => {
    const h = makeRoom({ packs: [PACK_FAMILY, PACK_TEEN, PACK_ADULT] });
    const packs = h.room.hostView(0).packs;
    expect(packs.map((p) => [p.id, p.enabled])).toEqual([
      [PACK_FAMILY.id, true],
      [PACK_TEEN.id, true],
      [PACK_ADULT.id, false],
    ]);
  });

  it("keeps an explicit adult choice across a catalog refresh", () => {
    const h = makeRoom({ packs: [PACK_FAMILY, PACK_ADULT] });
    const first = join(h.room, "Maya", 0);
    h.room.handle(
      vip(h.room, first.playerId),
      { t: "set-pack", packId: PACK_ADULT.id, enabled: true },
      0,
    );
    h.room.setPackCatalog([PACK_FAMILY, PACK_ADULT], 0);
    const adult = h.room.hostView(0).packs.find((p) => p.id === PACK_ADULT.id);
    expect(adult?.enabled).toBe(true);
  });

  it("reports only packs that match the selected game's content kind", () => {
    const h = makeRoom({ packs: [PACK_FAMILY, PACK_FACTS] });
    expect(h.room.hostView(0).packs.map((p) => p.id)).toEqual([PACK_FAMILY.id]);
  });
});

describe("start-game", () => {
  it("refuses to start below the game's minimum", () => {
    const h = makeRoom({ packs: [PACK_FAMILY] });
    const players = joinMany(h.room, ["Maya", "Leo"], 0);
    const res = h.room.handle(
      vip(h.room, at(players, 0).playerId),
      { t: "start-game" },
      0,
    );
    expect(errorCode(res.reply)).toBe("not-enough-players");
    expect(h.room.hostView(0).phase).toBe("lobby");
  });

  it("refuses to start with no enabled packs", () => {
    const h = makeRoom({ packs: [PACK_ADULT, PACK_FACTS] });
    const players = joinMany(h.room, ["Maya", "Leo", "Nia"], 0);
    const res = h.room.handle(
      vip(h.room, at(players, 0).playerId),
      { t: "start-game" },
      0,
    );
    expect(errorCode(res.reply)).toBe("invalid-action");
    expect(hasLoadContent(res.effects)).toBe(false);
  });

  it("starts and asks for the enabled pack ids of the right kind", () => {
    const h = makeRoom({
      packs: [PACK_FAMILY, PACK_TEEN, PACK_ADULT, PACK_FACTS],
    });
    const players = joinMany(h.room, ["Maya", "Leo", "Nia"], 0);
    const res = h.room.handle(
      vip(h.room, at(players, 0).playerId),
      { t: "start-game" },
      0,
    );
    expect(res.effects).toContainEqual({
      type: "load-content",
      kind: "word-pairs" satisfies ContentKind,
      packIds: [PACK_FAMILY.id, PACK_TEEN.id],
    });
    expect(h.room.hostView(0).phase).toBe("starting");
  });

  it("honors a pack the VIP turned off", () => {
    const h = makeRoom({ packs: [PACK_FAMILY, PACK_TEEN] });
    const players = joinMany(h.room, ["Maya", "Leo", "Nia"], 0);
    const first = vip(h.room, at(players, 0).playerId);
    h.room.handle(
      first,
      { t: "set-pack", packId: PACK_TEEN.id, enabled: false },
      0,
    );
    const res = h.room.handle(first, { t: "start-game" }, 0);
    expect(res.effects).toContainEqual({
      type: "load-content",
      kind: "word-pairs" satisfies ContentKind,
      packIds: [PACK_FAMILY.id],
    });
  });
});

describe("content loading", () => {
  it("abandons a start when the content has no items", () => {
    const h = makeRoom({ packs: [PACK_FAMILY] });
    const players = joinMany(h.room, ["Maya", "Leo", "Nia"], 0);
    const first = vip(h.room, at(players, 0).playerId);
    h.room.handle(first, { t: "start-game" }, 0);
    expect(h.room.hostView(0).phase).toBe("starting");

    const res = h.room.beginGame(EMPTY_CONTENT, 0);
    expect(h.room.hostView(0).phase).toBe("lobby");
    expect(res.changed).toBe(true);
  });

  it("abortStart returns to the lobby", () => {
    const h = makeRoom({ packs: [PACK_FAMILY] });
    const players = joinMany(h.room, ["Maya", "Leo", "Nia"], 0);
    h.room.handle(vip(h.room, at(players, 0).playerId), { t: "start-game" }, 0);
    h.room.abortStart(0);
    expect(h.room.hostView(0).phase).toBe("lobby");
    expect(h.room.nextDeadline()).toBeNull();
  });

  it("ignores content that mismatches the pending game's kind", () => {
    const h = makeRoom({ packs: [PACK_FAMILY] });
    const players = joinMany(h.room, ["Maya", "Leo", "Nia"], 0);
    h.room.handle(vip(h.room, at(players, 0).playerId), { t: "start-game" }, 0);
    const facts: GameContent = {
      kind: "facts",
      items: [
        {
          id: "f1",
          prompt: "The ____ is blue.",
          answer: "sky",
          alternates: [],
          decoys: [],
          source: { title: "Example", url: "https://example.com" },
        },
      ],
    };
    h.room.beginGame(facts, 0);
    expect(h.room.hostView(0).phase).toBe("lobby");
  });
});

describe("game actions and phases", () => {
  it("starts the game with a fresh round deadline for every player", () => {
    const h = makeRoom({ packs: [PACK_FAMILY] });
    const players = joinMany(h.room, ["Maya", "Leo", "Nia"], 0);
    startTap(h, idsOf(players));
    const view = h.room.hostView(0);
    expect(view.phase).toBe("in-game");
    expect(view.game?.id).toBe(tapGame.id);
    expect(view.game?.deadline).toBe(10_000);
    for (const id of idsOf(players)) {
      expect(h.room.playerView(id, 0).game?.view).toMatchObject({
        round: 1,
        myScore: 0,
        over: false,
      });
    }
  });

  it("rejects a malformed game-action", () => {
    const h = makeRoom({ packs: [PACK_FAMILY] });
    const players = joinMany(h.room, ["Maya", "Leo", "Nia"], 0);
    startTap(h, idsOf(players));
    const res = h.room.handle(
      vip(h.room, at(players, 0).playerId),
      { t: "game-action", action: { type: "nope" } },
      0,
    );
    expect(errorCode(res.reply)).toBe("invalid-action");
  });

  it("rejects a game-action from a player who is not in the game", () => {
    const h = makeRoom({ packs: [PACK_FAMILY] });
    const players = joinMany(h.room, ["Maya", "Leo", "Nia"], 0);
    startTap(h, idsOf(players));
    const late = join(h.room, "Late", 0);
    const res = h.room.handle(
      vip(h.room, late.playerId),
      { t: "game-action", action: { type: "tap" } },
      0,
    );
    expect(errorCode(res.reply)).toBe("invalid-action");
    expect(h.room.hostView(0).game?.view).toMatchObject({ tappedIds: [] });
  });

  it("skip-phase runs the phase deadline for the VIP", () => {
    const h = makeRoom({ packs: [PACK_FAMILY] });
    const players = joinMany(h.room, ["Maya", "Leo", "Nia"], 0);
    startTap(h, idsOf(players));
    const res = h.room.handle(
      vip(h.room, at(players, 0).playerId),
      { t: "skip-phase" },
      0,
    );
    expect(res.changed).toBe(true);
    expect(h.room.hostView(0).game?.view).toMatchObject({ round: 2 });
    expect(h.room.nextDeadline()).toBe(10_000);
  });

  it("tick does nothing before the deadline and advances on it", () => {
    const h = makeRoom({ packs: [PACK_FAMILY] });
    const players = joinMany(h.room, ["Maya", "Leo", "Nia"], 0);
    startTap(h, idsOf(players));
    expect(h.room.tick(9_999).changed).toBe(false);
    expect(h.room.hostView(9_999).game?.view).toMatchObject({ round: 1 });
    expect(h.room.tick(10_000).changed).toBe(true);
    expect(h.room.hostView(10_000).game?.view).toMatchObject({ round: 2 });
  });

  it("tick applies one deadline per call and finishes the game across ticks", () => {
    const h = makeRoom({ packs: [PACK_FAMILY] });
    const players = joinMany(h.room, ["Maya", "Leo", "Nia"], 0);
    startTap(h, idsOf(players));
    h.room.tick(10_000);
    expect(h.room.hostView(10_000).game?.view).toMatchObject({ round: 2 });
    h.room.tick(20_000);
    expect(h.room.hostView(20_000).game?.view).toMatchObject({ round: 3 });
    h.room.tick(30_000);
    expect(h.room.hostView(30_000).phase).toBe("lobby");
    expect(h.room.hostView(30_000).lastResult?.winnerIds).toEqual([]);
  });
});

describe("ending a game", () => {
  it("end-game returns to the lobby with no crowns and completed false", () => {
    const h = makeRoom({ packs: [PACK_FAMILY] });
    const players = joinMany(h.room, ["Maya", "Leo", "Nia"], 0);
    startTap(h, idsOf(players));
    const first = at(players, 0).playerId;
    h.room.handle(
      vip(h.room, first),
      { t: "game-action", action: { type: "tap" } },
      0,
    );

    const res = h.room.handle(vip(h.room, first), { t: "end-game" }, 0);
    expect(res.effects).toContainEqual({
      type: "game-finished",
      gameId: tapGame.id,
      playerCount: 3,
      durationMs: 0,
      completed: false,
    });
    const view = h.room.hostView(0);
    expect(view.phase).toBe("lobby");
    expect(view.lobbyScreen).toBe("results");
    expect(view.lastResult?.winnerIds).toEqual([]);
    expect(view.lastResult?.scores[first]).toBe(100);
    expect(view.players.every((p) => p.crowns === 0)).toBe(true);
  });

  it("crowns the top scorer and clears waiting flags when a game completes", () => {
    const h = makeRoom({ packs: [PACK_FAMILY] });
    const players = joinMany(h.room, ["Maya", "Leo", "Nia"], 0);
    startTap(h, idsOf(players));
    const maya = at(players, 0).playerId;
    h.room.handle(
      vip(h.room, maya),
      { t: "game-action", action: { type: "tap" } },
      0,
    );
    h.room.tick(10_000);
    h.room.handle(
      vip(h.room, maya),
      { t: "game-action", action: { type: "tap" } },
      10_000,
    );
    h.room.tick(20_000);
    h.room.handle(
      vip(h.room, maya),
      { t: "game-action", action: { type: "tap" } },
      20_000,
    );
    const res = h.room.tick(30_000);

    expect(res.effects).toContainEqual({
      type: "game-finished",
      gameId: tapGame.id,
      playerCount: 3,
      durationMs: 30_000,
      completed: true,
    });
    const view = h.room.hostView(30_000);
    expect(view.phase).toBe("lobby");
    expect(view.lobbyScreen).toBe("results");
    expect(view.lastResult).toEqual({
      gameId: tapGame.id,
      scores: {
        [maya]: 300,
        [at(players, 1).playerId]: 0,
        [at(players, 2).playerId]: 0,
      },
      winnerIds: [maya],
      completed: true,
      finishedAt: 30_000,
      awards: [],
    });
    expect(view.players.find((p) => p.id === maya)?.crowns).toBe(1);
    expect(
      view.players.find((p) => p.id === at(players, 1).playerId)?.crowns,
    ).toBe(0);
    expect(view.players.every((p) => !p.waitingForNextGame)).toBe(true);
  });

  it("awards no crowns when nobody scored", () => {
    const h = makeRoom({ packs: [PACK_FAMILY] });
    const players = joinMany(h.room, ["Maya", "Leo", "Nia"], 0);
    startTap(h, idsOf(players));
    h.room.tick(10_000);
    h.room.tick(20_000);
    h.room.tick(30_000);
    const view = h.room.hostView(30_000);
    expect(view.lastResult?.winnerIds).toEqual([]);
    expect(view.players.every((p) => p.crowns === 0)).toBe(true);
  });
});

describe("waiting players", () => {
  it("marks a mid-game joiner as waiting and seats them next game", () => {
    const h = makeRoom({ packs: [PACK_FAMILY] });
    const players = joinMany(h.room, ["Maya", "Leo", "Nia"], 0);
    startTap(h, idsOf(players));

    const late = join(h.room, "Late", 0);
    expect(
      h.room.hostView(0).players.find((p) => p.id === late.playerId)
        ?.waitingForNextGame,
    ).toBe(true);
    expect(h.room.playerView(late.playerId, 0).game?.view).toBeNull();

    h.room.tick(10_000);
    h.room.tick(20_000);
    h.room.tick(30_000);
    expect(
      h.room.hostView(30_000).players.find((p) => p.id === late.playerId)
        ?.waitingForNextGame,
    ).toBe(false);

    const first = vip(h.room, at(players, 0).playerId);
    h.room.handle(first, { t: "start-game" }, 30_000);
    h.room.beginGame(CONTENT, 30_000);
    expect(h.room.playerView(late.playerId, 30_000).game?.view).not.toBeNull();
    expect(h.room.hostView(30_000).game?.view).toMatchObject({ tappedIds: [] });
    expect(h.room.playerIds()).toHaveLength(4);
  });

  it("counts only connected non-waiting players toward the minimum", () => {
    const h = makeRoom({ packs: [PACK_FAMILY] });
    const players = joinMany(h.room, ["Maya", "Leo", "Nia"], 0);
    h.room.setConnected(at(players, 2).playerId, false, 0);
    const res = h.room.handle(
      vip(h.room, at(players, 0).playerId),
      { t: "start-game" },
      0,
    );
    expect(errorCode(res.reply)).toBe("not-enough-players");
  });
});

describe("kicking", () => {
  it("removes a kicked player's tap and keeps a healthy game running", () => {
    const h = makeRoom({ packs: [PACK_FAMILY] });
    const players = joinMany(h.room, ["Maya", "Leo", "Nia", "Omar"], 0);
    startTap(h, idsOf(players));
    const maya = at(players, 0).playerId;
    const leo = at(players, 1).playerId;
    h.room.handle(
      vip(h.room, leo),
      { t: "game-action", action: { type: "tap" } },
      0,
    );

    const res = h.room.handle(
      vip(h.room, maya),
      { t: "kick", playerId: leo },
      0,
    );
    expect(res.effects).toContainEqual({
      type: "disconnect-player",
      playerId: leo,
    });
    expect(h.room.playerIds()).toHaveLength(3);
    expect(h.room.hostView(0).phase).toBe("in-game");
    expect(h.room.hostView(0).game?.view).toMatchObject({ tappedIds: [] });
  });

  it("ends the game when a kick drops below minPlayers", () => {
    const h = makeRoom({ packs: [PACK_FAMILY] });
    const players = joinMany(h.room, ["Maya", "Leo", "Nia"], 0);
    startTap(h, idsOf(players));
    const res = h.room.handle(
      vip(h.room, at(players, 0).playerId),
      { t: "kick", playerId: at(players, 1).playerId },
      0,
    );
    expect(res.effects).toContainEqual({
      type: "game-finished",
      gameId: tapGame.id,
      playerCount: 2,
      durationMs: 0,
      completed: false,
    });
    expect(h.room.hostView(0).phase).toBe("lobby");
    expect(h.room.hostView(0).lastResult?.winnerIds).toEqual([]);
  });

  it("rejects kicking yourself and unknown players", () => {
    const h = makeRoom();
    const first = join(h.room, "Maya", 0);
    expect(
      errorCode(
        h.room.handle(
          vip(h.room, first.playerId),
          { t: "kick", playerId: first.playerId },
          0,
        ).reply,
      ),
    ).toBe("invalid-action");
    expect(
      errorCode(
        h.room.handle(
          vip(h.room, first.playerId),
          { t: "kick", playerId: "ghost" },
          0,
        ).reply,
      ),
    ).toBe("invalid-action");
  });
});

describe("timerStartedAt", () => {
  it("anchors to the moment the game begins", () => {
    const h = makeRoom({ packs: [PACK_FAMILY] });
    const players = joinMany(h.room, ["Maya", "Leo", "Nia"], 0);
    startTap(h, idsOf(players));
    const game = h.room.hostView(0).game;
    expect(game?.deadline).toBe(10_000);
    expect(game?.timerStartedAt).toBe(0);
  });

  it("moves to the tick time when a deadline fires", () => {
    const h = makeRoom({ packs: [PACK_FAMILY] });
    const players = joinMany(h.room, ["Maya", "Leo", "Nia"], 0);
    startTap(h, idsOf(players));
    h.room.tick(10_000);
    const game = h.room.hostView(10_000).game;
    expect(game?.deadline).toBe(20_000);
    expect(game?.timerStartedAt).toBe(10_000);
  });

  it("keeps the old anchor when an action leaves the deadline alone", () => {
    const h = makeRoom({ packs: [PACK_FAMILY] });
    const players = joinMany(h.room, ["Maya", "Leo", "Nia"], 0);
    startTap(h, idsOf(players));
    h.room.handle(
      vip(h.room, at(players, 0).playerId),
      { t: "game-action", action: { type: "tap" } },
      2_000,
    );
    const game = h.room.hostView(2_000).game;
    expect(game?.deadline).toBe(10_000);
    expect(game?.timerStartedAt).toBe(0);
  });

  it("re-anchors when an action ends the phase early", () => {
    const h = makeRoom({ packs: [PACK_FAMILY] });
    const players = joinMany(h.room, ["Maya", "Leo", "Nia"], 0);
    startTap(h, idsOf(players));
    for (const player of players) {
      h.room.handle(
        vip(h.room, player.playerId),
        { t: "game-action", action: { type: "tap" } },
        2_000,
      );
    }
    const game = h.room.hostView(2_000).game;
    expect(game?.view).toMatchObject({ round: 2 });
    expect(game?.deadline).toBe(12_000);
    expect(game?.timerStartedAt).toBe(2_000);
  });

  it("re-anchors when the VIP skips the phase", () => {
    const h = makeRoom({ packs: [PACK_FAMILY] });
    const players = joinMany(h.room, ["Maya", "Leo", "Nia"], 0);
    startTap(h, idsOf(players));
    h.room.handle(
      vip(h.room, at(players, 0).playerId),
      { t: "skip-phase" },
      3_000,
    );
    const game = h.room.hostView(3_000).game;
    expect(game?.deadline).toBe(13_000);
    expect(game?.timerStartedAt).toBe(3_000);
  });

  it("re-anchors when a kick changes the deadline", () => {
    const h = makeRoom({ packs: [PACK_FAMILY] });
    const players = joinMany(h.room, ["Maya", "Leo", "Nia", "Omar"], 0);
    startTap(h, idsOf(players));
    const maya = at(players, 0).playerId;
    const leo = at(players, 1).playerId;
    h.room.handle(
      vip(h.room, leo),
      { t: "game-action", action: { type: "tap" } },
      4_000,
    );
    h.room.handle(vip(h.room, maya), { t: "kick", playerId: leo }, 4_000);
    const game = h.room.hostView(4_000).game;
    expect(game?.deadline).toBe(14_000);
    expect(game?.timerStartedAt).toBe(4_000);
  });

  it("restores a snapshot with no anchor and emits null", () => {
    const h = makeRoom({ packs: [PACK_FAMILY] });
    const players = joinMany(h.room, ["Maya", "Leo", "Nia"], 0);
    startTap(h, idsOf(players));
    // Simulate an older snapshot that predates the anchor field.
    const data = JSON.parse(h.room.snapshot().data);
    if (data.game) delete data.game.timerStartedAt;
    const restored = restoreRoom(
      { version: 1, data: JSON.stringify(data) },
      [tapGame],
      () => "r1",
    );
    const game = restored.hostView(0).game;
    expect(game?.deadline).toBe(10_000);
    expect(game?.timerStartedAt).toBeNull();
  });
});

describe("snapshot and restore", () => {
  it("round-trips through JSON with identical views and keeps playing", () => {
    const h = makeRoom({ packs: [PACK_FAMILY], seed: 7 });
    const players = joinMany(h.room, ["Maya", "Leo", "Nia"], 0);
    startTap(h, idsOf(players));
    const maya = at(players, 0).playerId;
    h.room.handle(
      vip(h.room, maya),
      { t: "game-action", action: { type: "tap" } },
      0,
    );

    const snapshot = h.room.snapshot();
    const clone = JSON.parse(JSON.stringify(snapshot));
    let seq = 100;
    const restored = restoreRoom(clone, [tapGame], () => {
      seq++;
      return `r${seq}`;
    });

    expect(restored.snapshot()).toEqual(snapshot);
    expect(restored.hostView(0)).toEqual(h.room.hostView(0));
    for (const id of idsOf(players)) {
      expect(restored.playerView(id, 0)).toEqual(h.room.playerView(id, 0));
    }

    restored.tick(10_000);
    expect(restored.hostView(10_000).game?.view).toMatchObject({ round: 2 });
    expect(h.room.tick(10_000).changed).toBe(true);
    expect(restored.hostView(10_000)).toEqual(h.room.hostView(10_000));
  });

  it("rejects an unknown snapshot version", () => {
    expect(() =>
      restoreRoom(JSON.parse('{"version":2}'), [tapGame], () => "x"),
    ).toThrow(/version/);
  });
});

describe("privacy", () => {
  it("never puts a token in any view", () => {
    const h = makeRoom({ packs: [PACK_FAMILY] });
    const players = joinMany(h.room, ["Maya", "Leo", "Nia"], 0);
    startTap(h, idsOf(players));
    const tokens = players.map((p) => p.token);
    const json = JSON.stringify([
      h.room.hostView(0),
      ...idsOf(players).map((id) => h.room.playerView(id, 0)),
    ]);
    for (const token of tokens) expect(json).not.toContain(token);
    expect(json).not.toContain(HOST_TOKEN);
    expect(tokens.every((t) => t.startsWith("t"))).toBe(true);
  });
});

describe("isIdleSince", () => {
  it("is idle only after a quiet empty lobby", () => {
    const h = makeRoom();
    expect(h.room.isIdleSince(0, 1_000)).toBe(false);
    expect(h.room.isIdleSince(1_000, 1_000)).toBe(true);

    h.room.handle(h.host, { t: "host-hello", hostToken: HOST_TOKEN }, 1_000);
    expect(h.room.isIdleSince(2_000, 1_000)).toBe(false);

    h.room.setHostConnected(false, 2_000);
    expect(h.room.isIdleSince(3_000, 1_000)).toBe(true);
  });

  it("is never idle while a game is running", () => {
    const h = makeRoom({ packs: [PACK_FAMILY] });
    const players = joinMany(h.room, ["Maya", "Leo", "Nia"], 0);
    startTap(h, idsOf(players));
    for (const id of idsOf(players)) h.room.setConnected(id, false, 0);
    h.room.setHostConnected(false, 0);
    expect(h.room.isIdleSince(0, 1)).toBe(false);
    h.room.tick(10_000);
    h.room.tick(20_000);
    h.room.tick(30_000);
    expect(h.room.isIdleSince(30_000, 1)).toBe(true);
  });
});

describe("awards", () => {
  it("sanitizeAwards filters unknown players, drops empty awards and caps at MAX_AWARDS", () => {
    const awards: Award[] = [
      { id: "a", playerIds: ["p1", "ghost"], value: 1 },
      { id: "b", playerIds: ["ghost"], value: 2 },
      { id: "c", playerIds: ["p2"], value: 3 },
      { id: "d", playerIds: ["p1"], value: 4 },
      { id: "e", playerIds: ["p2"], value: 5 },
    ];
    const kept = sanitizeAwards(awards, ["p1", "p2"]);
    expect(kept).toEqual([
      { id: "a", playerIds: ["p1"], value: 1 },
      { id: "c", playerIds: ["p2"], value: 3 },
      { id: "d", playerIds: ["p1"], value: 4 },
    ]);
  });

  it("stores awards and finishedAt when a game completes", () => {
    const h = makeRoom({ packs: [PACK_FAMILY], game: tapWithAwards });
    const players = joinMany(h.room, ["Maya", "Leo", "Nia"], 0);
    startTap(h, idsOf(players), tapWithAwards.id);
    const maya = at(players, 0).playerId;
    h.room.handle(
      vip(h.room, maya),
      { t: "game-action", action: { type: "tap" } },
      0,
    );
    h.room.tick(10_000);
    h.room.handle(
      vip(h.room, maya),
      { t: "game-action", action: { type: "tap" } },
      10_000,
    );
    h.room.tick(20_000);
    h.room.handle(
      vip(h.room, maya),
      { t: "game-action", action: { type: "tap" } },
      20_000,
    );
    h.room.tick(30_000);
    const view = h.room.hostView(30_000);
    expect(view.lastResult?.completed).toBe(true);
    expect(view.lastResult?.finishedAt).toBe(30_000);
    expect(view.lastResult?.awards).toEqual([
      { id: "high-scorer", playerIds: [maya], value: 300 },
    ]);
  });

  it("end-game stores completed false and no awards", () => {
    const h = makeRoom({ packs: [PACK_FAMILY], game: tapWithAwards });
    const players = joinMany(h.room, ["Maya", "Leo", "Nia"], 0);
    startTap(h, idsOf(players), tapWithAwards.id);
    const maya = at(players, 0).playerId;
    h.room.handle(
      vip(h.room, maya),
      { t: "game-action", action: { type: "tap" } },
      0,
    );
    h.room.handle(vip(h.room, maya), { t: "end-game" }, 0);
    const view = h.room.hostView(0);
    expect(view.lastResult?.completed).toBe(false);
    expect(view.lastResult?.awards).toEqual([]);
  });

  it("stores no awards for a game without an awards hook", () => {
    const h = makeRoom({ packs: [PACK_FAMILY] });
    const players = joinMany(h.room, ["Maya", "Leo", "Nia"], 0);
    startTap(h, idsOf(players));
    h.room.tick(10_000);
    h.room.tick(20_000);
    h.room.tick(30_000);
    expect(h.room.hostView(30_000).lastResult?.awards).toEqual([]);
  });

  it("defaults completed, finishedAt and awards when restoring an old snapshot's lastResult", () => {
    const h = makeRoom({ packs: [PACK_FAMILY] });
    const players = joinMany(h.room, ["Maya", "Leo", "Nia"], 0);
    startTap(h, idsOf(players));
    h.room.tick(10_000);
    h.room.tick(20_000);
    h.room.tick(30_000);
    const data = JSON.parse(h.room.snapshot().data);
    data.lastResult = {
      gameId: data.lastResult.gameId,
      scores: data.lastResult.scores,
      winnerIds: data.lastResult.winnerIds,
    };
    const restored = restoreRoom(
      { version: 1, data: JSON.stringify(data) },
      [tapGame],
      () => "r1",
    );
    const lastResult = restored.hostView(30_000).lastResult;
    expect(lastResult?.completed).toBe(false);
    expect(lastResult?.finishedAt).toBe(0);
    expect(lastResult?.awards).toEqual([]);
  });
});

describe("persisted presence", () => {
  it("reports a change when the host connects or disconnects", () => {
    const h = makeRoom();
    expect(h.room.setHostConnected(true, 0).changed).toBe(true);
    expect(h.room.setHostConnected(true, 0).changed).toBe(false);
    expect(h.room.setHostConnected(false, 0).changed).toBe(true);
    expect(h.room.setHostConnected(false, 0).changed).toBe(false);
  });

  it("starts the idle clock as a change, so the snapshot records it", () => {
    const h = makeRoom();
    const players = joinMany(h.room, ["Maya"], 0);
    const id = at(idsOf(players), 0);

    expect(h.room.setConnected(id, false, 0).changed).toBe(true);
    const stored: { emptySince: number | null } = JSON.parse(
      h.room.snapshot().data,
    );
    expect(stored.emptySince).toBe(0);
    // Nothing moved the second time, so the hub has nothing to write.
    expect(h.room.setConnected(id, false, 0).changed).toBe(false);
  });
});

describe("restore boundaries", () => {
  it("fills a lastResult that is missing the fields older snapshots never wrote", () => {
    const restored = restoreRoom(
      { version: 1, data: JSON.stringify({ lastResult: { gameId: "tap" } }) },
      [tapGame],
      () => "r1",
    );

    expect(restored.hostView(0).lastResult).toEqual({
      gameId: "tap",
      scores: {},
      winnerIds: [],
      completed: false,
      finishedAt: 0,
      awards: [],
    });
  });

  it("restarts blank instead of throwing on a corrupted snapshot", () => {
    const restored = restoreRoom({ version: 1, data: "{" }, [tapGame], () => "r1");
    expect(restored.hostView(0).lastResult).toBeNull();
  });
});
