// The view schemas are the wire contract for the web app: every server view must parse and
// round-trip unchanged, at every phase the real game can be in.
import { describe, expect, it } from "vitest";
import { createRng } from "@opg/sdk";
import type { DrawingPromptContent, GameContext } from "@opg/sdk";
import {
  doodleHostViewSchema,
  doodlePlayerViewSchema,
  drawingIdOf,
  onAction,
  onDeadline,
  setup,
  TITLE_MS,
  VOTE_MS,
  type DoodlePhase,
  type DoodleState,
} from "./index";
import { buildHostView, buildPlayerView } from "./views";

const ITEMS: DrawingPromptContent["items"] = Array.from({ length: 24 }, (_, i) => ({
  id: `prompt-${i}`,
  prompt: `drawing number ${i}`,
  houseTitles: [`house ${i} a`, `house ${i} b`, `house ${i} c`, `house ${i} d`],
}));
const CONTENT: DrawingPromptContent = { kind: "drawing-prompts", items: ITEMS };

function makeCtx(n = 4): GameContext<DrawingPromptContent> {
  const players = Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `P${i + 1}`, avatar: null }));
  return { players, connectedIds: players.map((p) => p.id), rng: createRng(11), now: 1000, content: CONTENT };
}

function currentDrawingId(state: DoodleState): string {
  const id = state.currentDrawingId;
  if (id === null) throw new Error("no drawing on stage");
  return id;
}

function expectViewsParse(state: DoodleState, ctx: GameContext<DrawingPromptContent>, seen: Set<DoodlePhase>): void {
  seen.add(state.phase);
  const host = buildHostView(state);
  expect(doodleHostViewSchema.parse(host)).toStrictEqual(host);
  for (const player of ctx.players) {
    const view = buildPlayerView(state, player.id);
    expect(doodlePlayerViewSchema.parse(view)).toStrictEqual(view);
  }
}

describe("view schemas", () => {
  it("parses every phase's host and player views, unchanged", () => {
    const ctx = makeCtx(4);
    const seen = new Set<DoodlePhase>();
    let state = setup(ctx);
    expectViewsParse(state, ctx, seen);

    for (const player of ctx.players) {
      for (const slot of [0, 1] as const) {
        const drawingId = drawingIdOf(player.id, slot);
        state = onAction(state, player.id, { type: "strokes", drawingId, from: 0, strokes: [{ c: 0, d: 10, g: 0, p: [1, 1, 1, 1] }] }, ctx);
        state = onAction(state, player.id, { type: "doodle-done", drawingId }, ctx);
      }
    }
    expect(state.phase).toBe("title");
    expectViewsParse(state, ctx, seen);

    // Nobody titles; the deadline still moves it to vote with a house-topped ballot.
    state = onDeadline(state, { ...ctx, now: 1000 + TITLE_MS });
    expect(state.phase).toBe("vote");
    expectViewsParse(state, ctx, seen);

    state = onDeadline(state, { ...ctx, now: 1000 + TITLE_MS + VOTE_MS });
    expect(state.phase).toBe("reveal");
    expectViewsParse(state, ctx, seen);

    expect(seen).toEqual(new Set<DoodlePhase>(["draw", "title", "vote", "reveal"]));
  });

  it("parses the gallery phase's host view, with every drawing included", () => {
    const ctx = makeCtx(3);
    let state = setup(ctx);
    for (const player of ctx.players) {
      for (const slot of [0, 1] as const) {
        const drawingId = drawingIdOf(player.id, slot);
        state = onAction(state, player.id, { type: "strokes", drawingId, from: 0, strokes: [{ c: 0, d: 10, g: 0, p: [1, 1] }] }, ctx);
        state = onAction(state, player.id, { type: "doodle-done", drawingId }, ctx);
      }
    }
    let now = 1000;
    while (state.phase !== "gallery") {
      now += 100000;
      state = onDeadline(state, { ...ctx, now });
    }
    const host = buildHostView(state);
    expect(doodleHostViewSchema.parse(host)).toStrictEqual(host);
    expect(host.gallery?.length).toBe(6);
    for (const player of ctx.players) {
      const view = buildPlayerView(state, player.id);
      expect(doodlePlayerViewSchema.parse(view)).toStrictEqual(view);
    }
  });

  it("round-trips a reveal that includes a house title fooling someone", () => {
    const ctx = makeCtx(4);
    let state = setup(ctx);
    for (const player of ctx.players) {
      for (const slot of [0, 1] as const) {
        const drawingId = drawingIdOf(player.id, slot);
        state = onAction(state, player.id, { type: "strokes", drawingId, from: 0, strokes: [{ c: 0, d: 10, g: 0, p: [1, 1] }] }, ctx);
        state = onAction(state, player.id, { type: "doodle-done", drawingId }, ctx);
      }
    }
    state = onDeadline(state, { ...ctx, now: 1000 + TITLE_MS }); // no titles: house-only ballot
    const houseOption = (state.options ?? []).find((o) => o.authorId === null && !o.isTruth);
    expect(houseOption).toBeDefined();
    const artistId = state.drawings[currentDrawingId(state)]?.artistId;
    for (const player of ctx.players) {
      if (player.id === artistId || houseOption === undefined) continue;
      state = onAction(state, player.id, { type: "vote", optionId: houseOption.id }, ctx);
    }
    expect(state.phase).toBe("reveal");
    const host = buildHostView(state);
    expect(doodleHostViewSchema.parse(host)).toStrictEqual(host);
  });
});
