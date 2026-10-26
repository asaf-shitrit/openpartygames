import { createRng, doodleSchema, GRID, MAX_POINTS_PER_STROKE, type DrawingPromptContent, type GameContext, type Stroke } from "@opg/sdk";
import { describe, expect, it } from "vitest";
import { botDoodle } from "./bot";
import { chunkFits } from "./rules";
import { onAction, onDeadline, setup, sketchPhone } from "./index";
import { buildPlayerView } from "./views";
import { myLinkOf, votableLinks, currentChain } from "./rules";
import type { SketchAction } from "./state";

const SEEDS = [1, 2, 3, 7, 11, 29, 101, 977];

function pointCount(strokes: readonly Stroke[]): number {
  return strokes.reduce((sum, s) => sum + s.p.length / 2, 0);
}

describe("botDoodle", () => {
  it.each(SEEDS)("stays on the grid and under every cap (seed %i)", (seed) => {
    const strokes = botDoodle(createRng(seed));
    expect(doodleSchema.safeParse({ v: 1, s: strokes }).success).toBe(true);
    expect(chunkFits({ v: 1, s: [] }, strokes)).toBe(true);
    for (const s of strokes) {
      expect(s.p.length / 2).toBeLessThanOrEqual(MAX_POINTS_PER_STROKE);
      let x = s.p[0] ?? 0;
      let y = s.p[1] ?? 0;
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      for (let i = 2; i < s.p.length; i += 2) {
        x += s.p[i] ?? 0;
        y += s.p[i + 1] ?? 0;
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThan(GRID);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThan(GRID);
      }
    }
    expect(pointCount(strokes)).toBeGreaterThan(0);
  });
});

const CONTENT: DrawingPromptContent = { kind: "drawing-prompts", items: [] };

function makeCtx(n: number): GameContext<DrawingPromptContent> {
  const players = Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `P${i + 1}`, avatar: null }));
  return { players, connectedIds: players.map((p) => p.id), rng: createRng(4), now: 0, content: CONTENT };
}

function botAt(state: Parameters<typeof buildPlayerView>[0], playerId: string, seed = 1): SketchAction | null {
  return sketchPhone.bot(buildPlayerView(state, playerId), createRng(seed));
}

/** Bots play and the clock runs until `stop` holds. */
function driveUntil(
  start: ReturnType<typeof setup>,
  ctx: GameContext<DrawingPromptContent>,
  stop: (state: ReturnType<typeof setup>) => boolean,
) {
  let state = start;
  let now = ctx.now;
  const rng = createRng(31);
  for (let step = 0; step < 3000 && !stop(state); step += 1) {
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
  }
  return state;
}

describe("the bot's policy", () => {
  it("writes a phrase when it has none, and stops once it has", () => {
    const ctx = makeCtx(3);
    let state = setup(ctx);
    const action = botAt(state, "p1");
    expect(action?.type).toBe("words");
    if (action?.type !== "words") throw new Error("expected words");
    expect(action.text.length).toBeGreaterThan(0);
    expect(action.text.length).toBeLessThanOrEqual(50);
    state = onAction(state, "p1", action, ctx);
    expect(botAt(state, "p1")).toBeNull();
  });

  it("draws one chunk, then hands the drawing in", () => {
    const ctx = makeCtx(3);
    let state = setup(ctx);
    for (const id of state.playerIds) {
      const action = botAt(state, id);
      if (action?.type === "words") state = onAction(state, id, action, ctx);
    }
    expect(state.phase).toBe("draw");
    const first = botAt(state, "p1");
    expect(first?.type).toBe("strokes");
    if (first?.type !== "strokes") throw new Error("expected strokes");
    state = onAction(state, "p1", first, ctx);
    expect(botAt(state, "p1")?.type).toBe("done");
  });

  it("votes for somebody else's link", () => {
    const ctx = makeCtx(3);
    const atVote = driveUntil(setup(ctx), ctx, (state) => state.phase === "vote");
    expect(atVote.phase).toBe("vote");
    const vote = botAt(atVote, "p1");
    expect(vote?.type).toBe("vote");
    if (vote?.type !== "vote") throw new Error("expected a vote");
    const own = myLinkOf(atVote, "p1");
    expect(vote.linkId).not.toBe(own?.id);
  });

  it("stays quiet once it has voted", () => {
    const ctx = makeCtx(3);
    const atVote = driveUntil(setup(ctx), ctx, (state) => state.phase === "vote");
    const choice = votableLinks(atVote, "p1")[0];
    if (choice === undefined) throw new Error("expected a link to vote for");
    const voted = onAction(atVote, "p1", { type: "vote", linkId: choice.id }, ctx);
    expect(botAt(voted, "p1")).toBeNull();
  });

  it("has no vote to cast when every option on stage is its own", () => {
    const ctx = makeCtx(3);
    const atVote = driveUntil(setup(ctx), ctx, (state) => state.phase === "vote");
    const chain = currentChain(atVote) ?? 0;
    const links = Object.fromEntries(
      Object.entries(atVote.links).map(([id, link]) => [
        id,
        link.chain === chain ? { ...link, authorId: "p1" } : link,
      ]),
    );
    expect(botAt({ ...atVote, links }, "p1")).toBeNull();
  });

  it("has nothing to send outside its turn", () => {
    const ctx = makeCtx(3);
    const state = { ...setup(ctx), phase: "favourite" as const };
    expect(botAt(state, "p1")).toBeNull();
  });
});
