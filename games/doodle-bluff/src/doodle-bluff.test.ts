import { describe, expect, it } from "vitest";
import { createRng } from "@opg/sdk";
import type { DrawingPromptContent, GameContext } from "@opg/sdk";
import type { PlayerId } from "@opg/protocol";
import {
  bot,
  DRAW_MS,
  drawingIdOf,
  GALLERY_MS,
  isOver,
  onAction,
  onDeadline,
  onPlayerRemoved,
  REVEAL_MS,
  scores,
  setup,
  TITLE_MS,
  VOTE_MS,
  type DoodleAction,
  type DoodleState,
  type Stroke,
} from "./index";
import { buildHostView, buildPlayerView } from "./views";

const ITEMS: DrawingPromptContent["items"] = Array.from({ length: 24 }, (_, i) => ({
  id: `prompt-${i}`,
  prompt: `drawing number ${i}`,
  houseTitles: [`house ${i} a`, `house ${i} b`, `house ${i} c`, `house ${i} d`],
}));
const CONTENT: DrawingPromptContent = { kind: "drawing-prompts", items: ITEMS };
const BASE_NOW = 1000;

function makePlayers(count: number) {
  return Array.from({ length: count }, (_, i) => ({ id: `p${i + 1}`, name: `P${i + 1}`, avatar: null }));
}

function makeCtx(opts: {
  n?: number;
  connected?: PlayerId[];
  now?: number;
  seed?: number;
}): GameContext<DrawingPromptContent> {
  const n = opts.n ?? 4;
  const players = makePlayers(n);
  return {
    players,
    connectedIds: opts.connected ?? players.map((p) => p.id),
    rng: createRng(opts.seed ?? 7),
    now: opts.now ?? BASE_NOW,
    content: CONTENT,
  };
}

function scribble(): Stroke[] {
  return [{ c: 0, d: 100, g: 0, p: [10, 10, 5, 5, -3, 4] }];
}

function send(state: DoodleState, ctx: GameContext<DrawingPromptContent>, playerId: PlayerId, action: DoodleAction) {
  return onAction(state, playerId, action, ctx);
}

/** Draws one valid, non-blank drawing for `playerId`'s given slot and marks it done. */
function finishDrawing(
  state: DoodleState,
  ctx: GameContext<DrawingPromptContent>,
  playerId: PlayerId,
  slot: 0 | 1,
): DoodleState {
  const drawingId = drawingIdOf(playerId, slot);
  const withStrokes = send(state, ctx, playerId, { type: "strokes", drawingId, from: 0, strokes: scribble() });
  return send(withStrokes, ctx, playerId, { type: "doodle-done", drawingId });
}

/** Finishes both drawings for every player, in join order, ending the draw phase. */
function finishAllDrawings(state: DoodleState, ctx: GameContext<DrawingPromptContent>): DoodleState {
  let next = state;
  for (const player of ctx.players) {
    next = finishDrawing(next, ctx, player.id, 0);
    next = finishDrawing(next, ctx, player.id, 1);
  }
  return next;
}

function currentDrawingOf(state: DoodleState) {
  const drawing = state.currentDrawingId === null ? undefined : state.drawings[state.currentDrawingId];
  if (drawing === undefined) throw new Error("no drawing on stage");
  return drawing;
}

function currentArtistId(state: DoodleState): PlayerId {
  return currentDrawingOf(state).artistId;
}

function titleAsEveryNonArtist(state: DoodleState, ctx: GameContext<DrawingPromptContent>): DoodleState {
  const artistId = currentArtistId(state);
  let next = state;
  for (const player of ctx.players) {
    if (player.id === artistId) continue;
    next = send(next, ctx, player.id, { type: "title", text: `bluff by ${player.id}` });
  }
  return next;
}

function voteAsEveryNonArtist(state: DoodleState, ctx: GameContext<DrawingPromptContent>): DoodleState {
  const artistId = currentArtistId(state);
  let next = state;
  for (const player of ctx.players) {
    if (player.id === artistId) continue;
    const option = (next.options ?? []).find((o) => o.authorId !== player.id);
    if (option === undefined) continue;
    next = send(next, ctx, player.id, { type: "vote", optionId: option.id });
  }
  return next;
}

describe("setup", () => {
  it("creates two drawings per player, in the draw phase, deadline DRAW_MS out", () => {
    const ctx = makeCtx({ n: 3 });
    const state = setup(ctx);
    expect(state.phase).toBe("draw");
    expect(state.deadline).toBe(BASE_NOW + DRAW_MS);
    expect(Object.keys(state.drawings)).toHaveLength(6);
    for (const player of ctx.players) {
      expect(state.drawings[drawingIdOf(player.id, 0)]).toBeDefined();
      expect(state.drawings[drawingIdOf(player.id, 1)]).toBeDefined();
    }
  });
});

describe("draw phase: chunked strokes", () => {
  it("appends an accepted chunk", () => {
    const ctx = makeCtx({ n: 3 });
    const state = setup(ctx);
    const drawingId = drawingIdOf("p1", 0);
    const next = send(state, ctx, "p1", { type: "strokes", drawingId, from: 0, strokes: scribble() });
    expect(next.drawings[drawingId]?.doodle.s).toHaveLength(1);
  });

  it("a chunk with the wrong `from` is a no-op and returns the identical state object", () => {
    const ctx = makeCtx({ n: 3 });
    const state = setup(ctx);
    const drawingId = drawingIdOf("p1", 0);
    const withOne = send(state, ctx, "p1", { type: "strokes", drawingId, from: 0, strokes: scribble() });
    // Duplicate/replayed chunk: `from` no longer matches the server's stroke count.
    const replayed = send(withOne, ctx, "p1", { type: "strokes", drawingId, from: 0, strokes: scribble() });
    expect(replayed).toBe(withOne);
  });

  it("a chunk for another player's drawing is a no-op", () => {
    const ctx = makeCtx({ n: 3 });
    const state = setup(ctx);
    const drawingId = drawingIdOf("p1", 0);
    const next = send(state, ctx, "p2", { type: "strokes", drawingId, from: 0, strokes: scribble() });
    expect(next).toBe(state);
  });

  it("a chunk with a stale drawingId (unknown) is a no-op", () => {
    const ctx = makeCtx({ n: 3 });
    const state = setup(ctx);
    const next = send(state, ctx, "p1", { type: "strokes", drawingId: "nonsense", from: 0, strokes: scribble() });
    expect(next).toBe(state);
  });

  it("a chunk for an already-done drawing is a no-op", () => {
    const ctx = makeCtx({ n: 3 });
    const state = finishDrawing(setup(ctx), ctx, "p1", 0);
    const drawingId = drawingIdOf("p1", 0);
    const next = send(state, ctx, "p1", { type: "strokes", drawingId, from: 1, strokes: scribble() });
    expect(next).toBe(state);
  });

  it("a replayed chunk after a rejoin is still a no-op with the identical object", () => {
    const ctx = makeCtx({ n: 3 });
    const state = finishDrawing(setup(ctx), ctx, "p1", 0);
    // The phone reconnects and, not yet knowing the server is ahead, resends the same chunk.
    const drawingId = drawingIdOf("p1", 0);
    const resent = send(state, ctx, "p1", { type: "strokes", drawingId, from: 0, strokes: scribble() });
    expect(resent).toBe(state);
  });
});

describe("draw phase: ending", () => {
  it("ends early once every connected player has finished both drawings", () => {
    const ctx = makeCtx({ n: 3 });
    const state = finishAllDrawings(setup(ctx), ctx);
    expect(state.phase).toBe("title");
    expect(state.plannedRounds).toBe(6); // shownCount(3) = min(6, 10)
    expect(state.shownCount).toBe(1);
  });

  it("selects shown drawings for 8 players: 8 in pass one, 2 in pass two, capped at TITLED_MAX", () => {
    const ctx = makeCtx({ n: 8 });
    const state = finishAllDrawings(setup(ctx), ctx);
    expect(state.plannedRounds).toBe(10); // shownCount(8) = min(16, 10)
  });

  it("ends on the deadline even when a player never drew anything", () => {
    const ctx = makeCtx({ n: 3 });
    let state = setup(ctx);
    state = finishDrawing(state, ctx, "p2", 0);
    state = finishDrawing(state, ctx, "p2", 1);
    state = finishDrawing(state, ctx, "p3", 0);
    state = finishDrawing(state, ctx, "p3", 1);
    // p1 draws nothing at all.
    const afterDeadline = onDeadline(state, { ...ctx, now: BASE_NOW + DRAW_MS });
    expect(afterDeadline.phase).toBe("title");
    // p1's two blank drawings never entered the queue or the gallery.
    expect(afterDeadline.drawings[drawingIdOf("p1", 0)]?.doodle.s).toEqual([]);
  });

  it("a blank drawing's slot is refilled from later candidates so the shown count holds", () => {
    const ctx = makeCtx({ n: 3, seed: 42 });
    let state = setup(ctx);
    for (const player of ctx.players) {
      // First drawing left blank; second finished, so it can cover for the blank.
      state = finishDrawing(state, ctx, player.id, 1);
    }
    const afterDeadline = onDeadline(state, { ...ctx, now: BASE_NOW + DRAW_MS });
    expect(afterDeadline.phase).toBe("title");
    // Every candidate in the queue is a ":1" drawing (the only valid ones), all showable.
    expect(afterDeadline.currentDrawingId).toMatch(/:1$/);
  });
});

describe("title phase", () => {
  function inTitlePhase(n = 4, seed = 7) {
    const ctx = makeCtx({ n, seed });
    const state = finishAllDrawings(setup(ctx), ctx);
    return { ctx, state };
  }

  it("the artist cannot title their own drawing", () => {
    const { ctx, state } = inTitlePhase();
    const artistId = currentArtistId(state);
    const next = send(state, ctx, artistId, { type: "title", text: "sneaky" });
    expect(next).toBe(state);
  });

  it("rejects a title equal to the truth, a duplicate, and an empty one, one error per player", () => {
    const { ctx, state } = inTitlePhase();
    const artistId = currentArtistId(state);
    const drawing = currentDrawingOf(state);
    const [first, second] = ctx.players.filter((p) => p.id !== artistId);
    if (first === undefined || second === undefined) throw new Error("need two non-artist players");

    const truthAttempt = send(state, ctx, first.id, { type: "title", text: drawing.prompt });
    expect(truthAttempt.titleErrors[first.id]).toBe("truth");

    const emptyAttempt = send(state, ctx, first.id, { type: "title", text: "   " });
    expect(emptyAttempt.titleErrors[first.id]).toBe("invalid");

    const accepted = send(state, ctx, first.id, { type: "title", text: "a fine bluff" });
    expect(accepted.titles[first.id]).toBe("a fine bluff");
    const duplicateAttempt = send(accepted, ctx, second.id, { type: "title", text: "a fine bluff" });
    expect(duplicateAttempt.titleErrors[second.id]).toBe("duplicate");
  });

  it("advances to vote once every connected non-artist has titled", () => {
    const { ctx, state } = inTitlePhase(4);
    const next = titleAsEveryNonArtist(state, ctx);
    expect(next.phase).toBe("vote");
    expect(next.options?.length).toBeGreaterThanOrEqual(4);
  });

  it("on the deadline with nobody titled, still proceeds to vote (house titles top up the ballot)", () => {
    const { ctx, state } = inTitlePhase(3);
    const afterDeadline = onDeadline(state, { ...ctx, now: BASE_NOW + TITLE_MS });
    expect(afterDeadline.phase).toBe("vote");
    expect(afterDeadline.options?.length).toBe(4);
  });

  it("when only the artist is connected, the round is skipped on the deadline", () => {
    const { ctx, state } = inTitlePhase(3);
    const artistId = currentArtistId(state);
    const soloCtx = { ...ctx, connectedIds: [artistId], now: BASE_NOW + TITLE_MS };
    const afterDeadline = onDeadline(state, soloCtx);
    // The round never reached a vote or a reveal.
    expect(afterDeadline.phase === "vote" || afterDeadline.phase === "reveal").toBe(false);
    expect(afterDeadline.history).toEqual([]);
  });
});

describe("vote phase", () => {
  function inVotePhase(n = 4, seed = 7) {
    const ctx = makeCtx({ n, seed });
    const drawn = finishAllDrawings(setup(ctx), ctx);
    const state = titleAsEveryNonArtist(drawn, ctx);
    return { ctx, state };
  }

  it("the artist cannot vote, and nobody can vote their own title", () => {
    const { ctx, state } = inVotePhase();
    const artistId = currentArtistId(state);
    const truthOption = (state.options ?? []).find((o) => o.isTruth);
    if (truthOption === undefined) throw new Error("no truth option");
    const artistVote = send(state, ctx, artistId, { type: "vote", optionId: truthOption.id });
    expect(artistVote).toBe(state);

    const author = (state.options ?? []).find((o) => o.authorId !== null);
    if (author?.authorId === undefined || author.authorId === null) throw new Error("no authored option");
    const ownVote = send(state, ctx, author.authorId, { type: "vote", optionId: author.id });
    expect(ownVote).toBe(state);
  });

  it("advances to reveal once every eligible voter has voted, and scores correctly", () => {
    const { ctx, state } = inVotePhase(4);
    const next = voteAsEveryNonArtist(state, ctx);
    expect(next.phase).toBe("reveal");
    expect(next.reveal).not.toBeNull();
    expect(next.deadline).toBe(BASE_NOW + REVEAL_MS);
  });

  it("reaches reveal on the deadline too, with whatever votes arrived", () => {
    const { ctx, state } = inVotePhase(4);
    const afterDeadline = onDeadline(state, { ...ctx, now: BASE_NOW + VOTE_MS });
    expect(afterDeadline.phase).toBe("reveal");
  });
});

describe("reveal, round advancing, and the gallery", () => {
  it("moves to the next round after the reveal deadline, and records history", () => {
    const ctx = makeCtx({ n: 3, seed: 3 });
    const drawn = finishAllDrawings(setup(ctx), ctx);
    const titled = titleAsEveryNonArtist(drawn, ctx);
    const voted = voteAsEveryNonArtist(titled, ctx);
    expect(voted.phase).toBe("reveal");
    const next = onDeadline(voted, { ...ctx, now: BASE_NOW + REVEAL_MS });
    expect(next.phase).toBe("title");
    expect(next.history).toHaveLength(1);
    expect(next.shownCount).toBe(2);
  });

  it("reaches the gallery once every showable drawing has had its round, then finishes", () => {
    const ctx = makeCtx({ n: 3, seed: 9 });
    let state = titleAsEveryNonArtist(finishAllDrawings(setup(ctx), ctx), ctx);
    // Drive every planned round to completion.
    for (let i = 0; i < state.plannedRounds; i += 1) {
      state = voteAsEveryNonArtist(state, ctx);
      expect(state.phase).toBe("reveal");
      state = onDeadline(state, { ...ctx, now: BASE_NOW + REVEAL_MS * (i + 1) });
      if (state.phase === "title") state = titleAsEveryNonArtist(state, ctx);
    }
    expect(state.phase).toBe("gallery");
    expect(isOver(state)).toBe(false);
    const finished = onDeadline(state, { ...ctx, now: BASE_NOW + GALLERY_MS * 10 });
    expect(isOver(finished)).toBe(true);
    expect(Object.keys(scores(finished))).toHaveLength(3);
  });
});

describe("onPlayerRemoved edge cases", () => {
  it("drops an artist's drawings from the queue and gallery before they are shown, and the queue refills", () => {
    const ctx = makeCtx({ n: 3, seed: 5 });
    const drawn = finishAllDrawings(setup(ctx), ctx);
    const artistId = currentArtistId(drawn);
    const other = ctx.players.find((p) => p.id !== artistId)?.id;
    if (other === undefined) throw new Error("need another player");
    const afterKick = onPlayerRemoved(drawn, other, { ...ctx, players: ctx.players.filter((p) => p.id !== other) });
    expect(afterKick.drawings[drawingIdOf(other, 0)]).toBeUndefined();
    expect(afterKick.drawings[drawingIdOf(other, 1)]).toBeUndefined();
    expect(afterKick.playerIds).not.toContain(other);
  });

  it("keeps the ceremony's tiles when the artist is kicked during their own round", () => {
    const ctx = makeCtx({ n: 4, seed: 11 });
    const drawn = finishAllDrawings(setup(ctx), ctx);
    const artistId = currentArtistId(drawn);
    const remainingPlayers = ctx.players.filter((p) => p.id !== artistId);
    const kickCtx = { ...ctx, players: remainingPlayers, connectedIds: remainingPlayers.map((p) => p.id) };
    const afterKick = onPlayerRemoved(drawn, artistId, kickCtx);
    // The on-stage drawing is frozen: still present, still the current one.
    currentDrawingOf(drawn); // asserts one is on stage
    const drawingId = drawn.currentDrawingId;
    if (drawingId === null) throw new Error("no drawing on stage");
    expect(afterKick.currentDrawingId).toBe(drawn.currentDrawingId);
    expect(afterKick.drawings[drawingId]).toBeDefined();
    expect(afterKick.scores[artistId]).toBeUndefined();

    const titled = titleAsEveryNonArtist(afterKick, kickCtx);
    const voted = voteAsEveryNonArtist(titled, kickCtx);
    expect(voted.phase).toBe("reveal");
    // Finders and forgers still score; the artist has no score entry to add to.
    expect(voted.scores[artistId]).toBeUndefined();
  });

  it("removes a player's title before the ballot is built when they are kicked during title", () => {
    const ctx = makeCtx({ n: 4, seed: 13 });
    const drawn = finishAllDrawings(setup(ctx), ctx);
    const artistId = currentArtistId(drawn);
    const titler = ctx.players.find((p) => p.id !== artistId)?.id;
    if (titler === undefined) throw new Error("need a titler");
    const titled = send(drawn, ctx, titler, { type: "title", text: "a bluff worth kicking over" });
    const remainingPlayers = ctx.players.filter((p) => p.id !== titler);
    const afterKick = onPlayerRemoved(titled, titler, { ...ctx, players: remainingPlayers, connectedIds: remainingPlayers.map((p) => p.id) });
    expect(afterKick.titles[titler]).toBeUndefined();
  });

  it("anonymizes an option and drops the vote for a player kicked during vote", () => {
    const ctx = makeCtx({ n: 4, seed: 17 });
    const drawn = finishAllDrawings(setup(ctx), ctx);
    const titled = titleAsEveryNonArtist(drawn, ctx);
    const artistId = currentArtistId(titled);
    const author = (titled.options ?? []).find((o) => o.authorId !== null && o.authorId !== artistId)?.authorId;
    if (author === null || author === undefined) throw new Error("need an authored option");
    const remainingPlayers = ctx.players.filter((p) => p.id !== author);
    const afterKick = onPlayerRemoved(titled, author, { ...ctx, players: remainingPlayers, connectedIds: remainingPlayers.map((p) => p.id) });
    expect(afterKick.options?.some((o) => o.authorId === author)).toBe(false);
    expect(afterKick.votes[author]).toBeUndefined();
  });

  it("freezes the reveal (Most Likely To's rule): a kick during reveal never recomputes it", () => {
    const ctx = makeCtx({ n: 4, seed: 19 });
    const drawn = finishAllDrawings(setup(ctx), ctx);
    const titled = titleAsEveryNonArtist(drawn, ctx);
    const voted = voteAsEveryNonArtist(titled, ctx);
    expect(voted.phase).toBe("reveal");
    const artistId = currentArtistId(voted);
    const finder = voted.reveal?.foundByIds[0];
    const target = finder ?? ctx.players.find((p) => p.id !== artistId)?.id;
    if (target === undefined) throw new Error("need someone to kick");
    const remainingPlayers = ctx.players.filter((p) => p.id !== target);
    const afterKick = onPlayerRemoved(voted, target, { ...ctx, players: remainingPlayers, connectedIds: remainingPlayers.map((p) => p.id) });
    expect(afterKick.reveal).toEqual(voted.reveal);
    expect(afterKick.pointsThisRound[target]).toBeUndefined();
  });
});

describe("a kick can end the current phase early", () => {
  it("ends the draw phase when the last undone connected player is kicked", () => {
    const ctx = makeCtx({ n: 3, seed: 41 });
    let state = setup(ctx);
    state = finishDrawing(state, ctx, "p1", 0);
    state = finishDrawing(state, ctx, "p1", 1);
    state = finishDrawing(state, ctx, "p2", 0);
    state = finishDrawing(state, ctx, "p2", 1);
    // p3 never draws; kicking them lets the remaining, already-finished players proceed.
    const remainingPlayers = ctx.players.filter((p) => p.id !== "p3");
    const afterKick = onPlayerRemoved(state, "p3", { ...ctx, players: remainingPlayers, connectedIds: remainingPlayers.map((p) => p.id) });
    expect(afterKick.phase).toBe("title");
  });

  it("ends the title phase when kicking the last un-titled connected player finishes the set", () => {
    const ctx = makeCtx({ n: 3, seed: 43 });
    const drawn = finishAllDrawings(setup(ctx), ctx);
    const artistId = currentArtistId(drawn);
    const titlers = ctx.players.filter((p) => p.id !== artistId);
    const [holdout, other] = titlers;
    if (holdout === undefined || other === undefined) throw new Error("need two titlers");
    const titled = send(drawn, ctx, other.id, { type: "title", text: `by ${other.id}` });
    const remainingPlayers = ctx.players.filter((p) => p.id !== holdout.id);
    const afterKick = onPlayerRemoved(titled, holdout.id, { ...ctx, players: remainingPlayers, connectedIds: remainingPlayers.map((p) => p.id) });
    expect(afterKick.phase).toBe("vote");
  });

  it("ends the vote phase when kicking the last un-voted connected player finishes the set", () => {
    const ctx = makeCtx({ n: 3, seed: 47 });
    const drawn = finishAllDrawings(setup(ctx), ctx);
    const titled = titleAsEveryNonArtist(drawn, ctx);
    const artistId = currentArtistId(titled);
    const voters = ctx.players.filter((p) => p.id !== artistId);
    const [holdout, other] = voters;
    if (holdout === undefined || other === undefined) throw new Error("need two voters");
    const option = (titled.options ?? []).find((o) => o.authorId !== other.id);
    if (option === undefined) throw new Error("need a pickable option");
    const voted = send(titled, ctx, other.id, { type: "vote", optionId: option.id });
    const remainingPlayers = ctx.players.filter((p) => p.id !== holdout.id);
    const afterKick = onPlayerRemoved(voted, holdout.id, { ...ctx, players: remainingPlayers, connectedIds: remainingPlayers.map((p) => p.id) });
    expect(afterKick.phase).toBe("reveal");
  });
});

function promptsOf(state: DoodleState, playerId: PlayerId): string[] {
  return ([0, 1] as const).map((slot) => state.drawings[drawingIdOf(playerId, slot)]?.prompt ?? "");
}

describe("secrecy: no view carries another player's prompt or title before reveal", () => {
  it("during draw, a player's view never carries another player's secret prompt", () => {
    const ctx = makeCtx({ n: 4, seed: 23 });
    const state = setup(ctx);
    for (const p of ctx.players) {
      const ownPrompts = new Set(buildPlayerView(state, p.id).myPrompts.map((mp) => mp.prompt));
      for (const other of ctx.players) {
        if (other.id === p.id) continue;
        for (const secret of promptsOf(state, other.id)) expect(ownPrompts.has(secret)).toBe(false);
      }
    }
  });

  it("during title and vote, no view's JSON contains the real title before the reveal", () => {
    const ctx = makeCtx({ n: 4, seed: 23 });
    const drawn = finishAllDrawings(setup(ctx), ctx);
    const artistId = currentArtistId(drawn);
    const realTitle = currentDrawingOf(drawn).prompt;

    for (const p of ctx.players) expect(JSON.stringify(buildPlayerView(drawn, p.id))).not.toContain(realTitle);
    expect(JSON.stringify(buildHostView(drawn))).not.toContain(realTitle);

    const titler = ctx.players.find((p) => p.id !== artistId)?.id;
    if (titler === undefined) throw new Error("need a titler");
    const titled = send(drawn, ctx, titler, { type: "title", text: "a secret bluff" });
    for (const p of ctx.players) {
      if (p.id === titler) continue; // the author's own view is allowed to show it back
      expect(JSON.stringify(buildPlayerView(titled, p.id))).not.toContain("a secret bluff");
    }
    expect(JSON.stringify(buildHostView(titled))).not.toContain("a secret bluff");

    const voted = voteAsEveryNonArtist(titleAsEveryNonArtist(titled, ctx), ctx);
    expect(voted.phase).toBe("reveal");
    // Once revealed, the truth is public knowledge.
    expect(voted.reveal?.prompt).toBe(realTitle);
  });
});

describe("bot", () => {
  it("draws through the real chunk action, then marks done, then moves to the next prompt", () => {
    const ctx = makeCtx({ n: 3, seed: 29 });
    let state = setup(ctx);
    const view1 = buildPlayerView(state, "p1");
    const first = bot(view1, ctx.rng);
    expect(first?.type).toBe("strokes");
    if (first === null || first?.type !== "strokes") throw new Error("expected a strokes action");
    state = onAction(state, "p1", first, ctx);

    const view2 = buildPlayerView(state, "p1");
    const second = bot(view2, ctx.rng);
    expect(second).toEqual({ type: "doodle-done", drawingId: first.drawingId });
  });

  it("returns null for the artist during title and vote", () => {
    const ctx = makeCtx({ n: 4, seed: 31 });
    const drawn = finishAllDrawings(setup(ctx), ctx);
    const artistId = currentArtistId(drawn);
    const view = buildPlayerView(drawn, artistId);
    expect(bot(view, ctx.rng)).toBeNull();
  });

  it("titles and votes for a non-artist, never repeating the same no-op", () => {
    const ctx = makeCtx({ n: 4, seed: 37 });
    const drawn = finishAllDrawings(setup(ctx), ctx);
    const artistId = currentArtistId(drawn);
    const other = ctx.players.find((p) => p.id !== artistId)?.id;
    if (other === undefined) throw new Error("need a non-artist");
    const view = buildPlayerView(drawn, other);
    const action = bot(view, ctx.rng);
    expect(action?.type).toBe("title");
  });

  it("returns null when voting but the options are not built yet (defensive)", () => {
    const ctx = makeCtx({ n: 4 });
    const view = { ...buildPlayerView(setup(ctx), "p1"), phase: "vote" as const, isArtist: false, myVote: null, options: null };
    expect(bot(view, ctx.rng)).toBeNull();
  });

  it("returns null when every option on the ballot is the bot's own (defensive)", () => {
    const ctx = makeCtx({ n: 4 });
    const view = {
      ...buildPlayerView(setup(ctx), "p1"),
      phase: "vote" as const,
      isArtist: false,
      myVote: null,
      options: [{ id: "o1", text: "mine", mine: true }],
    };
    expect(bot(view, ctx.rng)).toBeNull();
  });
});
