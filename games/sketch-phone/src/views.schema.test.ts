// The view schemas are the wire contract for the web app: every server view must parse and
// round-trip unchanged, at every phase the real game can be in, and no unrevealed link may
// appear in any of them.
import { describe, expect, it } from "vitest";
import { createRng } from "@opg/sdk";
import type { DrawingPromptContent, GameContext, Rng } from "@opg/sdk";
import { onAction, onDeadline, setup, sketchPhone } from "./index";
import { buildHostView, buildPlayerView } from "./views";
import {
  sketchHostViewSchema,
  sketchPlayerViewSchema,
  type SketchPhase,
  type SketchState,
} from "./state";

const CONTENT: DrawingPromptContent = {
  kind: "drawing-prompts",
  items: [{ id: "cat", prompt: "a cat in a hat", houseTitles: ["a hat"] }],
};

function makeCtx(n: number, now = 1000): GameContext<DrawingPromptContent> {
  const players = Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `P${i + 1}`, avatar: null }));
  return { players, connectedIds: players.map((p) => p.id), rng: createRng(11), now, content: CONTENT };
}

function expectViewsParse(state: SketchState, ctx: GameContext<DrawingPromptContent>, seen: Set<SketchPhase>): void {
  seen.add(state.phase);
  const host = buildHostView(state);
  expect(sketchHostViewSchema.parse(host)).toStrictEqual(host);
  if (state.phase === "write" || state.phase === "draw" || state.phase === "describe") {
    expect(host.links).toBeNull();
  }
  for (const player of ctx.players) {
    const view = buildPlayerView(state, player.id);
    expect(sketchPlayerViewSchema.parse(view)).toStrictEqual(view);
    if (state.phase === "replay") expect(view.links?.length).toBe(state.revealed);
    if (view.myLinkId !== null) {
      expect(state.links[view.myLinkId]?.authorId).toBe(player.id);
    }
    for (const link of view.links ?? []) {
      expect(state.links[link.id]?.done).toBe(true);
    }
  }
}

/** Bots play, the clock runs and phases time out, until the game is over. */
function walk(start: SketchState, ctx: GameContext<DrawingPromptContent>): { state: SketchState; seen: Set<SketchPhase> } {
  const seen = new Set<SketchPhase>();
  let state = start;
  let now = ctx.now;
  const rng: Rng = createRng(5);
  expectViewsParse(state, ctx, seen);
  for (let step = 0; step < 3000 && !state.finished; step += 1) {
    now += 500;
    const context = { ...ctx, now };
    let acted = state;
    for (const player of ctx.players) {
      const action = sketchPhone.bot(buildPlayerView(acted, player.id), rng);
      if (action !== null) acted = onAction(acted, player.id, action, context);
    }
    const deadline = acted.deadline;
    if (deadline !== null && now >= deadline) acted = onDeadline(acted, { ...context, now: deadline });
    state = acted;
    expectViewsParse(state, context, seen);
  }
  return { state, seen };
}

describe("Sketch Phone views", () => {
  it("parse at every phase, in a 4-player game, and never leak an unrevealed link", () => {
    const ctx = makeCtx(4);
    const { state, seen } = walk(setup(ctx), ctx);
    expect(state.finished).toBe(true);
    expect([...seen].sort()).toEqual(["describe", "draw", "favourite", "replay", "vote", "write"]);
  });

  it("parse at every phase in a 8-player game too", () => {
    const ctx = makeCtx(8);
    const { state } = walk(setup(ctx), ctx);
    expect(state.finished).toBe(true);
  });
});
