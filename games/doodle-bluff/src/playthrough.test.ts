// Full-room playthroughs through the SDK's bot harness, plus a direct snapshot round-trip
// through the real Room engine with every one of an 8-player game's 16 drawings in it.
import { describe, expect, it } from "vitest";
import type { Caller, DrawingPromptContent, PackMeta } from "@opg/sdk";
import { createMemoryContentSource, runBotPlaythrough } from "@opg/sdk/testing";
import { createRoom, restoreRoom } from "@opg/sdk";
import type { ServerMessage } from "@opg/protocol";
import { doodleBluff, drawingIdOf } from "./index";

const ITEMS: DrawingPromptContent["items"] = Array.from({ length: 24 }, (_, i) => ({
  id: `prompt-${i}`,
  prompt: `drawing number ${i}`,
  houseTitles: [`house ${i} a`, `house ${i} b`, `house ${i} c`, `house ${i} d`],
}));
const PACK: DrawingPromptContent = { kind: "drawing-prompts", items: ITEMS };

const CONTENT_SOURCE = createMemoryContentSource([
  {
    meta: {
      id: "pack-doodle-bluff",
      name: "Doodle Bluff Pack",
      kind: "drawing-prompts",
      rating: "family",
      language: "en",
      itemCount: PACK.items.length,
    },
    content: PACK,
  },
]);

const AWARD_IDS = ["pen-of-the-people", "master-forger", "sharp-eye", "abstract-artist"];

describe("doodle bluff bot playthroughs", () => {
  for (const players of [3, 8]) {
    it(`finishes a ${players}-player game with a mid-game disconnect and rejoin`, async () => {
      const content = await CONTENT_SOURCE.loadContent("drawing-prompts", ["pack-doodle-bluff"]);
      expect(content.kind).toBe("drawing-prompts");

      const result = runBotPlaythrough({
        game: doodleBluff,
        content,
        players,
        seed: 4000 + players,
        disconnectRejoin: true,
        maxSteps: 4000,
      });

      expect(result.finished).toBe(true);
      expect(result.steps).toBeGreaterThan(0);
      expect(Object.keys(result.scores)).toHaveLength(players);
      expect(result.rejoinedPlayerId).not.toBeNull();
      for (const award of result.awards) {
        expect(AWARD_IDS).toContain(award.id);
      }
    });
  }
});

type PlayerWelcome = Extract<ServerMessage, { t: "welcome"; role: "player" }>;

function welcomeOf(reply: readonly ServerMessage[]): PlayerWelcome {
  const found = reply.find((m): m is PlayerWelcome => m.t === "welcome" && m.role === "player");
  if (!found) throw new Error(`no player welcome in ${JSON.stringify(reply)}`);
  return found;
}

describe("snapshot round-trip with 16 drawings", () => {
  it("round-trips through JSON with identical views once every drawing is submitted", async () => {
    let clock = 0;
    let seq = 0;
    const room = createRoom({
      code: "BCDF",
      hostToken: "host-secret",
      games: [doodleBluff],
      seed: 5,
      now: clock,
      newToken: () => `t${(seq += 1)}`,
    });
    const host: Caller = { kind: "host" };
    room.handle(host, { t: "host-hello", hostToken: "host-secret" }, clock);
    const pack: PackMeta = {
      id: "pack-doodle-bluff",
      name: "Doodle Bluff Pack",
      kind: "drawing-prompts",
      rating: "family",
      language: "en",
      itemCount: PACK.items.length,
    };
    room.setPackCatalog([pack], clock);

    const playerIds: string[] = [];
    for (let i = 0; i < 8; i += 1) {
      const res = room.handle({ kind: "anonymous" }, { t: "join", name: `Bot${i + 1}` }, clock);
      playerIds.push(welcomeOf(res.reply).playerId);
    }
    const vip: Caller = { kind: "player", playerId: playerIds[0] ?? "" };
    room.handle(vip, { t: "pick-game", gameId: doodleBluff.id }, clock);
    const startRes = room.handle(vip, { t: "start-game" }, clock);
    expect(startRes.effects.some((e) => e.type === "load-content")).toBe(true);
    room.beginGame(PACK, clock);

    // Every one of the 8 players' 2 drawings: a single chunk, then doodle-done.
    for (const playerId of playerIds) {
      for (const slot of [0, 1] as const) {
        const drawingId = drawingIdOf(playerId, slot);
        clock += 1;
        room.handle(
          { kind: "player", playerId },
          { t: "game-action", action: { type: "strokes", drawingId, from: 0, strokes: [{ c: 0, d: 10, g: 0, p: [1, 1, 2, 2] }] } },
          clock,
        );
        clock += 1;
        room.handle({ kind: "player", playerId }, { t: "game-action", action: { type: "doodle-done", drawingId } }, clock);
      }
    }

    const snapshot = room.snapshot();
    const persisted = JSON.parse(snapshot.data);
    expect(Object.keys(persisted.game.state.drawings)).toHaveLength(16);

    const clone = JSON.parse(JSON.stringify(snapshot));
    let restoreSeq = 100;
    const restored = restoreRoom(clone, [doodleBluff], () => {
      restoreSeq += 1;
      return `r${restoreSeq}`;
    });

    expect(restored.snapshot()).toEqual(snapshot);
    expect(restored.hostView(clock)).toEqual(room.hostView(clock));
    for (const playerId of playerIds) {
      expect(restored.playerView(playerId, clock)).toEqual(room.playerView(playerId, clock));
    }

    // The restored room keeps playing identically to the original past this point.
    expect(persisted.game.state.phase).toBe("title"); // every drawing finished early, past `draw`
    const deadline = restored.nextDeadline();
    if (deadline === null) throw new Error("expected a title deadline");
    restored.tick(deadline);
    room.tick(deadline);
    expect(restored.hostView(deadline)).toEqual(room.hostView(deadline));
    expect(restored.hostView(deadline).game?.view).toMatchObject({ phase: "vote" });
  });
});
