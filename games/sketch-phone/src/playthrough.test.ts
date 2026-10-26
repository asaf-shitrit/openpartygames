// Full-room playthroughs through the SDK's bot harness: 3 and 8 players, with a shared screen
// and without one, plus a snapshot round-trip through the real Room engine.
import { describe, expect, it } from "vitest";
import type { DrawingPromptContent, PlayerId } from "@opg/sdk";
import { createRoom, restoreRoom } from "@opg/sdk";
import { createMemoryContentSource, runBotPlaythrough } from "@opg/sdk/testing";
import type { Caller, ServerMessage } from "@opg/protocol";
import { sketchPhone } from "./index";
import { sketchPlayerViewSchema, type SketchAction } from "./state";

const ITEMS: DrawingPromptContent["items"] = Array.from({ length: 24 }, (_, i) => ({
  id: `prompt-${i}`,
  prompt: `drawing number ${i}`,
  houseTitles: [`house ${i} a`],
}));
const PACK: DrawingPromptContent = { kind: "drawing-prompts", items: ITEMS };

const CONTENT_SOURCE = createMemoryContentSource([
  {
    meta: {
      id: "pack-sketch-phone",
      name: "Sketch Phone Pack",
      kind: "drawing-prompts",
      rating: "family",
      language: "en",
      itemCount: PACK.items.length,
    },
    content: PACK,
  },
]);

const AWARD_IDS = ["favourite", "sharpest-pencil", "wordsmith"];

describe("sketch phone bot playthroughs", () => {
  for (const players of [3, 8]) {
    for (const sharedScreen of [true, false]) {
      it(`finishes a ${players}-player game with a mid-game disconnect and rejoin (sharedScreen=${sharedScreen})`, async () => {
        const content = await CONTENT_SOURCE.loadContent("drawing-prompts", ["pack-sketch-phone"]);
        expect(content.kind).toBe("drawing-prompts");

        const result = runBotPlaythrough({
          game: sketchPhone,
          content,
          players,
          seed: 5000 + players,
          disconnectRejoin: true,
          maxSteps: 6000,
          sharedScreen,
        });

        expect(result.finished).toBe(true);
        expect(result.steps).toBeGreaterThan(0);
        expect(Object.keys(result.scores)).toHaveLength(players);
        expect(result.rejoinedPlayerId).not.toBeNull();
        expect(result.hostConnected).toBe(sharedScreen);
        for (const award of result.awards) expect(AWARD_IDS).toContain(award.id);
      });
    }
  }
});

type PlayerWelcome = Extract<ServerMessage, { t: "welcome"; role: "player" }>;

function welcomeOf(reply: readonly ServerMessage[]): PlayerWelcome {
  const found = reply.find((m): m is PlayerWelcome => m.t === "welcome" && m.role === "player");
  if (!found) throw new Error(`no player welcome in ${JSON.stringify(reply)}`);
  return found;
}

function send(room: ReturnType<typeof createRoom>, playerId: PlayerId, action: SketchAction, now: number): void {
  room.handle({ kind: "player", playerId }, { t: "game-action", action }, now);
}

describe("snapshot round-trip mid-game", () => {
  it("restores the same views and carries on identically", () => {
    let clock = 1000;
    let seq = 0;
    const room = createRoom({
      code: "BCDF",
      hostToken: "host-secret",
      games: [sketchPhone],
      seed: 5,
      now: clock,
      newToken: () => `t${(seq += 1)}`,
    });
    const host: Caller = { kind: "host" };
    room.handle(host, { t: "host-hello", hostToken: "host-secret" }, clock);
    room.setPackCatalog(
      [
        {
          id: "pack-sketch-phone",
          name: "Sketch Phone Pack",
          kind: "drawing-prompts",
          rating: "family",
          language: "en",
          itemCount: PACK.items.length,
        },
      ],
      clock,
    );

    const playerIds: PlayerId[] = [];
    for (let i = 0; i < 6; i += 1) {
      const res = room.handle({ kind: "anonymous" }, { t: "join", name: `Bot${i + 1}` }, clock);
      playerIds.push(welcomeOf(res.reply).playerId);
    }
    const vip: Caller = { kind: "player", playerId: playerIds[0] ?? "" };
    room.handle(vip, { t: "pick-game", gameId: sketchPhone.id }, clock);
    const startRes = room.handle(vip, { t: "start-game" }, clock);
    expect(startRes.effects.some((e) => e.type === "load-content")).toBe(true);
    room.beginGame(PACK, clock);

    for (const playerId of playerIds) {
      clock += 1;
      send(room, playerId, { type: "words", text: `phrase for ${playerId}` }, clock);
    }

    const snapshot = room.snapshot();
    const clone = JSON.parse(JSON.stringify(snapshot));
    let restoreSeq = 100;
    const restored = restoreRoom(clone, [sketchPhone], () => {
      restoreSeq += 1;
      return `r${restoreSeq}`;
    });

    expect(restored.snapshot()).toEqual(snapshot);
    expect(restored.hostView(clock)).toEqual(room.hostView(clock));
    for (const playerId of playerIds) {
      expect(restored.playerView(playerId, clock)).toEqual(room.playerView(playerId, clock));
    }

    // A restored room keeps playing: the same chunk lands on the same link in both rooms.
    for (const playerId of playerIds) {
      const parsed = sketchPlayerViewSchema.parse(restored.playerView(playerId, clock).game?.view);
      const linkId = parsed.myLinkId;
      if (linkId === null) throw new Error("expected a link to draw on");
      const strokes = [{ c: 0, d: 10, g: 0, p: [10, 10, 20, 20] }];
      clock += 1;
      send(restored, playerId, { type: "strokes", linkId, from: 0, strokes }, clock);
      clock += 1;
      send(room, playerId, { type: "strokes", linkId, from: 0, strokes }, clock);
      expect(restored.hostView(clock)).toEqual(room.hostView(clock));
    }
  });
});
