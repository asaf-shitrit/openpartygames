import { describe, expect, it } from "vitest";
import type { DrawingPromptContent, GameContext, Stroke } from "@opg/sdk";
import { createRng } from "@opg/sdk";
import { onAction, onDeadline, onPlayerRemoved, setup, sketchPhone } from "./index";
import { canWork, chainLinks, chainOwner, currentChain, myLinkOf, votableLinks, withoutKey } from "./rules";
import {
  DRAW_MS,
  linkIdOf,
  POINTS_PER_VOTE,
  PRESENT_MS,
  VOTE_MS,
  WRITE_MS,
  type SketchState,
} from "./state";
import { buildHostView, buildPlayerView } from "./views";

const CONTENT: DrawingPromptContent = {
  kind: "drawing-prompts",
  items: [{ id: "cat", prompt: "a cat in a hat", houseTitles: [] }],
};

/** Four prompts, so a dealt window of three can be three different phrases. */
const MANY_PROMPTS: DrawingPromptContent = {
  kind: "drawing-prompts",
  items: ["a cat in a hat", "a pig on a bike", "a duck in a van", "a moon in a spoon"].map(
    (prompt, index) => ({ id: `prompt-${index}`, prompt, houseTitles: [] }),
  ),
};

const STROKE: Stroke = { c: 0, d: 20, g: 0, p: [10, 10, 30, 30] };
const NOW = 1000;

function makeCtx(n: number, now = NOW): GameContext<DrawingPromptContent> {
  const players = Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `P${i + 1}`, avatar: null }));
  return { players, connectedIds: players.map((p) => p.id), rng: createRng(9), now, content: CONTENT };
}

/** Every player hands in the round the state is in: words are sent, drawings get a stroke and a tap. */
function fillRound(state: SketchState, ctx: GameContext<DrawingPromptContent>): SketchState {
  const round = state.round;
  let next = state;
  for (const id of state.playerIds) {
    if (next.round !== round) break;
    const link = myLinkOf(next, id);
    if (link === null || link.done) continue;
    if (next.phase === "write" || next.phase === "describe") {
      next = onAction(next, id, { type: "words", text: `words ${next.round} from ${id}` }, ctx);
    } else {
      next = onAction(next, id, { type: "strokes", linkId: link.id, from: 0, strokes: [STROKE] }, ctx);
      next = onAction(next, id, { type: "done", linkId: link.id }, ctx);
    }
  }
  return next;
}

function voteRound(state: SketchState, ctx: GameContext<DrawingPromptContent>): SketchState {
  let next = state;
  for (const id of state.playerIds) {
    const choice = votableLinks(next, id)[0];
    if (choice === undefined) continue;
    next = onAction(next, id, { type: "vote", linkId: choice.id }, ctx);
  }
  return next;
}

/** Every player does their bit of the phase the state is in, then the phase moves on. */
function playPhase(state: SketchState, ctx: GameContext<DrawingPromptContent>): SketchState {
  if (state.phase === "replay" || state.phase === "favourite") {
    return onDeadline(state, { ...ctx, now: (state.deadline ?? 0) + PRESENT_MS });
  }
  if (state.phase === "vote") {
    const voted = voteRound(state, ctx);
    return voted.phase === "vote" ? onDeadline(voted, { ...ctx, now: (voted.deadline ?? 0) + 1 }) : voted;
  }
  return fillRound(state, ctx);
}

/** Runs replays and votes until the game is over or `until` says stop. */
function playOut(state: SketchState, ctx: GameContext<DrawingPromptContent>, until?: (s: SketchState) => boolean) {
  let next = state;
  for (let guard = 0; guard < 200; guard += 1) {
    if (next.finished || until?.(next) === true) return next;
    next = playPhase(next, ctx);
  }
  return next;
}

describe("setup", () => {
  it("deals one link per player per round and opens on writing", () => {
    const state = setup(makeCtx(4));
    expect(state.phase).toBe("write");
    expect(state.deadline).toBe(NOW + WRITE_MS);
    expect(state.playerIds).toEqual(["p1", "p2", "p3", "p4"]);
    expect(Object.keys(state.links)).toHaveLength(16);
    expect(new Set(state.replayOrder)).toEqual(new Set([0, 1, 2, 3]));
    expect(state.scores).toEqual({ p1: 0, p2: 0, p3: 0, p4: 0 });
  });

  it("gives each chain every player exactly once", () => {
    const state = setup(makeCtx(5));
    const links = { ...state.links };
    for (const [id, link] of Object.entries(links)) {
      links[id] = {
        ...link,
        done: true,
        text: link.kind === "words" ? `step ${link.step}` : "",
        doodle: link.kind === "drawing" ? { v: 1, s: [STROKE] } : link.doodle,
      };
    }
    for (let chain = 0; chain < 5; chain += 1) {
      const authors = chainLinks({ ...state, links }, chain).map((link) => link.authorId);
      expect(authors).toHaveLength(5);
      expect(new Set(authors).size).toBe(5);
    }
  });

  it("deals each phone three phrases from the room's packs, and none when there are none", () => {
    const state = setup(makeCtx(4));
    const mine = buildPlayerView(state, "p1").mySuggestions;
    // One item in the pack, so one chip: a phone never shows a phrase the packs do not carry.
    expect(mine).toEqual([CONTENT.items[0]?.prompt]);

    const many = setup({ ...makeCtx(4), content: MANY_PROMPTS });
    expect(many.suggestions.p1).toHaveLength(3);
    expect(new Set(many.suggestions.p1).size).toBe(3);
    // Different seats start at different prompts, so a table does not write the same phrase.
    expect(many.suggestions.p1).not.toEqual(many.suggestions.p2);

    // An empty pack, and a room restored before chips were dealt: the write screen offers none.
    const empty = setup({ ...makeCtx(4), content: { kind: "drawing-prompts", items: [] } });
    expect(buildPlayerView(empty, "p1").mySuggestions).toEqual([]);
    expect(buildPlayerView({ ...empty, suggestions: {} }, "p1").mySuggestions).toEqual([]);
  });
});

describe("writing and drawing", () => {
  it("rejects empty and over-long words, and the wrong phase", () => {
    const ctx = makeCtx(3);
    const state = setup(ctx);
    expect(onAction(state, "p1", { type: "words", text: "   " }, ctx)).toBe(state);
    expect(onAction(state, "p1", { type: "words", text: "x".repeat(51) }, ctx)).toBe(state);
    expect(onAction(state, "p1", { type: "done", linkId: linkIdOf(0, 0) }, ctx)).toBe(state);
  });

  it("marks a sent phrase done, and closes the write phase when everyone has", () => {
    const ctx = makeCtx(3);
    let state = setup(ctx);
    state = onAction(state, "p1", { type: "words", text: "  a  cat  " }, ctx);
    expect(state.links[linkIdOf(0, 0)]?.text).toBe("a cat");
    expect(state.links[linkIdOf(0, 0)]?.done).toBe(true);
    expect(buildHostView(state).doneIds).toEqual(["p1"]);
    state = fillRound(state, ctx);
    expect(state.phase).toBe("draw");
    expect(state.round).toBe(1);
    expect(state.deadline).toBe(NOW + DRAW_MS);
  });

  it("accepts one chunk at the room's own count and refuses a stale or oversized one", () => {
    const ctx = makeCtx(3);
    const write = fillRound(setup(ctx), ctx);
    const link = myLinkOf(write, "p1");
    if (link === null) throw new Error("expected a link to draw on");
    const drew = onAction(write, "p1", { type: "strokes", linkId: link.id, from: 0, strokes: [STROKE] }, ctx);
    expect(myLinkOf(drew, "p1")?.doodle.s).toHaveLength(1);
    expect(onAction(drew, "p1", { type: "strokes", linkId: link.id, from: 0, strokes: [STROKE] }, ctx)).toBe(drew);
    const tooMany = Array.from({ length: 65 }, () => STROKE);
    expect(onAction(drew, "p1", { type: "strokes", linkId: link.id, from: 1, strokes: tooMany }, ctx)).toBe(drew);
    // A chunk built for the round before names another link, and never lands on this one.
    const stale = linkIdOf(link.chain, 0);
    expect(onAction(drew, "p1", { type: "strokes", linkId: stale, from: 1, strokes: [STROKE] }, ctx)).toBe(drew);
  });

  it("truncates only a real shrink of the link it names", () => {
    const ctx = makeCtx(3);
    const write = fillRound(setup(ctx), ctx);
    const link = myLinkOf(write, "p1");
    if (link === null) throw new Error("expected a link to draw on");
    let state = onAction(write, "p1", { type: "strokes", linkId: link.id, from: 0, strokes: [STROKE, STROKE] }, ctx);
    expect(onAction(state, "p1", { type: "truncate", linkId: link.id, from: 1, to: 0 }, ctx)).toBe(state);
    expect(onAction(state, "p1", { type: "truncate", linkId: link.id, from: 2, to: 2 }, ctx)).toBe(state);
    state = onAction(state, "p1", { type: "truncate", linkId: link.id, from: 2, to: 1 }, ctx);
    expect(myLinkOf(state, "p1")?.doodle.s).toHaveLength(1);
  });

  it("hands a drawn link in, and nobody can draw on it afterwards", () => {
    const ctx = makeCtx(3);
    const write = fillRound(setup(ctx), ctx);
    const link = myLinkOf(write, "p1");
    if (link === null) throw new Error("expected a link to draw on");
    const drew = onAction(write, "p1", { type: "strokes", linkId: link.id, from: 0, strokes: [STROKE] }, ctx);
    const done = onAction(drew, "p1", { type: "done", linkId: link.id }, ctx);
    expect(myLinkOf(done, "p1")?.done).toBe(true);
    expect(onAction(done, "p1", { type: "done", linkId: link.id }, ctx)).toBe(done);
    expect(onAction(done, "p1", { type: "strokes", linkId: link.id, from: 1, strokes: [STROKE] }, ctx)).toBe(done);
  });

  it("runs every phase in order and pays every vote", () => {
    const ctx = makeCtx(3);
    let state = setup(ctx);
    const seen: string[] = [state.phase];
    state = fillRound(state, ctx);
    seen.push(state.phase);
    state = fillRound(state, ctx);
    seen.push(state.phase);
    state = fillRound(state, ctx);
    seen.push(state.phase);
    expect(seen).toEqual(["write", "draw", "describe", "replay"]);
    expect(currentChain(state)).not.toBeNull();

    const atVote = playOut(state, ctx, (s) => s.phase === "vote");
    expect(atVote.phase).toBe("vote");
    const voted = voteRound(atVote, ctx);
    expect(voted.phase).toBe("favourite");
    const paid = Object.values(voted.scores).reduce((sum, points) => sum + points, 0);
    expect(paid).toBe(3 * POINTS_PER_VOTE);
    expect(buildHostView(voted).favouriteId).not.toBeNull();

    const over = playOut(voted, ctx);
    expect(over.finished).toBe(true);
    expect(sketchPhone.isOver(over)).toBe(true);
    expect(sketchPhone.awards?.(over).length ?? 0).toBeGreaterThan(0);
  });

  it("replays only links that hold something", () => {
    const ctx = makeCtx(3);
    let state = setup(ctx);
    state = fillRound(state, ctx);
    state = fillRound(state, ctx);
    // The describe round times out with nothing sent: the chain keeps its two real links.
    const empty = onDeadline(state, { ...ctx, now: (state.deadline ?? 0) + 1 });
    expect(empty.phase).toBe("replay");
    const host = buildHostView(empty);
    const links = host.links ?? [];
    expect(links.length).toBeLessThan(3);
    const allHaveContent = links.every((link) =>
      link.kind === "words" ? link.text !== "" : (link.doodle?.s.length ?? 0) > 0,
    );
    expect(allHaveContent).toBe(true);
  });
});

describe("undoing", () => {
  it("drops the strokes after `from`, and only inside a draw round", () => {
    const ctx = makeCtx(3);
    let state = fillRound(setup(ctx), ctx);
    const link = myLinkOf(state, "p1");
    if (link === null || link.kind !== "drawing") throw new Error("expected p1 to be drawing");
    state = onAction(state, "p1", { type: "strokes", linkId: link.id, from: 0, strokes: [STROKE, STROKE] }, ctx);
    expect(state.links[link.id]?.doodle.s).toHaveLength(2);
    const undone = onAction(state, "p1", { type: "truncate", linkId: link.id, from: 2, to: 1 }, ctx);
    expect(undone.links[link.id]?.doodle.s).toHaveLength(1);
    const writing = setup(ctx);
    expect(onAction(writing, "p1", { type: "truncate", linkId: linkIdOf(0, 0), from: 1, to: 0 }, ctx)).toBe(writing);
  });
});

describe("secrets", () => {
  it("keeps unrevealed links off every view", () => {
    const ctx = makeCtx(3);
    let state = setup(ctx);
    state = fillRound(state, ctx);
    state = fillRound(state, ctx);
    state = fillRound(state, ctx);
    expect(state.phase).toBe("replay");
    const host = buildHostView(state);
    expect(host.links).toHaveLength(1);
    expect(host.revealed).toBe(1);
    const linkIds = new Set(chainLinks(state, currentChain(state) ?? 0).map((link) => link.id));
    for (const link of host.links ?? []) expect(linkIds.has(link.id)).toBe(true);
    for (const id of state.playerIds) {
      const view = buildPlayerView(state, id);
      expect(view.links).toHaveLength(1);
      // Nobody's in-progress work leaks either: the replay carries no `myLink`.
      expect(view.myLinkId).toBeNull();
    }
  });
});

describe("the next-link shortcut", () => {
  it("belongs to the chain's owner", () => {
    const ctx = makeCtx(3);
    let state = setup(ctx);
    state = fillRound(state, ctx);
    state = fillRound(state, ctx);
    state = fillRound(state, ctx);
    const owner = buildHostView(state).ownerId ?? "";
    const other = state.playerIds.find((id) => id !== owner) ?? "";
    expect(onAction(state, other, { type: "next-link" }, ctx)).toBe(state);
    const advanced = onAction(state, owner, { type: "next-link" }, ctx);
    expect(buildHostView(advanced).revealed).toBe(2);
  });
});

describe("voting", () => {
  function atVote() {
    const ctx = makeCtx(3);
    let state = setup(ctx);
    state = fillRound(state, ctx);
    state = fillRound(state, ctx);
    state = fillRound(state, ctx);
    return { state: playOut(state, ctx, (s) => s.phase === "vote"), ctx };
  }

  it("refuses a link of your own, and a second vote", () => {
    const { state, ctx } = atVote();
    const own = chainLinks(state, currentChain(state) ?? 0).find((link) => link.authorId === "p1");
    if (own === undefined) throw new Error("expected p1 to own a link");
    expect(onAction(state, "p1", { type: "vote", linkId: own.id }, ctx)).toBe(state);
    const allowed = votableLinks(state, "p1")[0];
    if (allowed === undefined) throw new Error("expected a link to vote for");
    const voted = onAction(state, "p1", { type: "vote", linkId: allowed.id }, ctx);
    expect(voted.votes.p1).toBe(allowed.id);
    expect(onAction(voted, "p1", { type: "vote", linkId: allowed.id }, ctx)).toBe(voted);
  });

  it("closes early when everyone still connected has voted", () => {
    const { state, ctx } = atVote();
    expect(voteRound(state, ctx).phase).toBe("favourite");
  });

  it("does not vote outside the vote phase", () => {
    const ctx = makeCtx(3);
    const state = setup(ctx);
    expect(onAction(state, "p1", { type: "vote", linkId: linkIdOf(0, 0) }, ctx)).toBe(state);
  });
});

describe("kicks and connections", () => {
  function atReplay() {
    const ctx = makeCtx(3);
    let state = setup(ctx);
    state = fillRound(state, ctx);
    state = fillRound(state, ctx);
    state = fillRound(state, ctx);
    return { state: playOut(state, ctx, (s) => s.phase === "replay"), ctx };
  }

  it("settles the vote when a voter leaves", () => {
    const ctx = makeCtx(3);
    let state = setup(ctx);
    state = fillRound(state, ctx);
    state = fillRound(state, ctx);
    state = fillRound(state, ctx);
    state = playOut(state, ctx, (s) => s.phase === "vote");
    for (const id of ["p1", "p2"]) {
      const choice = votableLinks(state, id)[0];
      if (choice !== undefined) state = onAction(state, id, { type: "vote", linkId: choice.id }, ctx);
    }
    const kicked = onPlayerRemoved(state, "p3", ctx);
    expect(kicked.playerIds).toEqual(["p1", "p2"]);
    expect(kicked.phase).toBe("favourite");
    expect(kicked.votes.p3).toBeUndefined();
  });

  it("skips a chain on stage that left with its author", () => {
    const { state, ctx } = atReplay();
    const chain = currentChain(state);
    if (chain === null) throw new Error("expected a chain on stage");
    const stripped: SketchState = {
      ...state,
      links: withoutKey(
        withoutKey(withoutKey(state.links, linkIdOf(chain, 0)), linkIdOf(chain, 1)),
        linkIdOf(chain, 2),
      ),
    };
    expect(currentChain(stripped)).toBe(chain);
    expect(chainLinks(stripped, chain)).toHaveLength(0);
    const kicked = onPlayerRemoved(stripped, "p1", ctx);
    expect(currentChain(kicked)).not.toBe(chain);
  });

  it("does nothing for a player who already left", () => {
    const ctx = makeCtx(3);
    const state = setup(ctx);
    expect(onPlayerRemoved(state, "ghost", ctx)).toBe(state);
  });

  it("plays every round the room dealt when a player is kicked mid-game", () => {
    const ctx = makeCtx(4);
    let state = fillRound(setup(ctx), ctx);
    // Four players, so four rounds: the seed and three hand-offs. p4 leaves during the first.
    expect(state.round).toBe(1);
    state = onPlayerRemoved(state, "p4", ctx);
    expect(state.playerIds).toEqual(["p1", "p2", "p3"]);

    const played = playOut(state, ctx, (s) => s.phase === "replay");
    expect(played.phase).toBe("replay");
    expect(played.round).toBe(3);
    // The last round was played and its links stay: three players held a chain in round 3.
    const lastSteps = [0, 1, 2, 3].map(
      (chain) => chainLinks(played, chain).filter((link) => link.step === 3).length,
    );
    expect(lastSteps.reduce((sum, count) => sum + count, 0)).toBe(3);
  });

  it("counts rounds and links by the deal, whatever the roster does", () => {
    const ctx = makeCtx(8);
    const state = setup(ctx);
    const atDraw = onDeadline(state, { ...ctx, now: (state.deadline ?? 0) + 1 });
    // Eight players are dealt eight rounds, the seed included, and every chain holds eight links.
    expect(buildHostView(atDraw).roundNumber).toBe(2);
    expect(buildHostView(atDraw).roundCount).toBe(8);
    expect(buildHostView(atDraw).linkCount).toBe(8);
    const kicked = onPlayerRemoved(atDraw, "p8", ctx);
    expect(buildPlayerView(kicked, "p1").roundCount).toBe(8);
    expect(buildPlayerView(kicked, "p1").linkCount).toBe(8);
  });

  it("counts the replay's links by the ones the chain shows, not the ones the deal made", () => {
    const { state } = atReplay();
    const chain = currentChain(state);
    if (chain === null) throw new Error("expected a chain on stage");
    const owner = chainOwner(state, chain);
    if (owner === null) throw new Error("expected the chain to have an owner");
    expect(buildPlayerView(state, owner).linkCount).toBe(3);

    // A link nobody filled — a phone that missed its deadline, or a kick — is skipped on stage,
    // so the presenter's phone counts up to the links the chain shows, not the deal's three.
    const missing = chainLinks(state, chain)[1];
    if (missing === undefined) throw new Error("expected a three-link chain");
    const stripped: SketchState = { ...state, links: withoutKey(state.links, missing.id) };
    const view = buildPlayerView(stripped, owner);
    expect(view.linkCount).toBe(2);
    expect(view.roundCount).toBe(3);
  });

  it("drops the removed player's unfinished link and forgets them", () => {
    const ctx = makeCtx(3);
    const state = fillRound(setup(ctx), ctx);
    const unfinished = myLinkOf(state, "p2");
    if (unfinished === null) throw new Error("expected p2 to have a link");
    const next = sketchPhone.onPlayerRemoved?.(state, "p2", ctx);
    if (next === undefined) throw new Error("expected onPlayerRemoved");
    expect(next.playerIds).not.toContain("p2");
    expect(next.links[unfinished.id]).toBeUndefined();
    expect(buildHostView(next).playerIds).toEqual(["p1", "p3"]);
    expect(buildHostView(next).totals.p2).toBeUndefined();
  });

  it("pulls the deadline in when only an absent player is left", () => {
    const ctx = makeCtx(3);
    let state = fillRound(setup(ctx), ctx);
    for (const id of ["p1", "p2"]) {
      const link = myLinkOf(state, id);
      if (link === null) continue;
      state = onAction(state, id, { type: "strokes", linkId: link.id, from: 0, strokes: [STROKE] }, ctx);
      state = onAction(state, id, { type: "done", linkId: link.id }, ctx);
    }
    const before = state.deadline ?? 0;
    const pulled = sketchPhone.onPlayersChanged?.(state, { ...ctx, connectedIds: ["p1", "p2"] });
    if (pulled === undefined) throw new Error("expected onPlayersChanged");
    expect(pulled.phase).toBe("draw");
    expect(pulled.deadline).toBeLessThan(before);
    expect(pulled.deadline ?? 0).toBeGreaterThan(ctx.now);
  });

  it("pulls the vote's deadline in when an absent voter is all that is left", () => {
    const ctx = makeCtx(3);
    let state = setup(ctx);
    state = fillRound(state, ctx);
    state = fillRound(state, ctx);
    state = fillRound(state, ctx);
    state = playOut(state, ctx, (s) => s.phase === "vote");
    for (const id of ["p1", "p2"]) {
      const choice = votableLinks(state, id)[0];
      if (choice !== undefined) state = onAction(state, id, { type: "vote", linkId: choice.id }, ctx);
    }
    expect(state.phase).toBe("vote");
    const before = state.deadline ?? 0;
    const pushed = sketchPhone.onPlayersChanged?.(state, { ...ctx, connectedIds: ["p1", "p2"] });
    if (pushed === undefined) throw new Error("expected onPlayersChanged");
    expect(pushed.phase).toBe("vote");
    expect(pushed.deadline).toBeLessThan(before);
    expect(onDeadline(pushed, { ...ctx, now: (pushed.deadline ?? 0) + 1 }).phase).toBe("favourite");
  });
});

describe("deadlines", () => {
  it("closes the write phase on whatever the room has, empty links included", () => {
    const ctx = makeCtx(3);
    const state = setup(ctx);
    const next = onDeadline(state, { ...ctx, now: (state.deadline ?? 0) + 1 });
    expect(next.phase).toBe("draw");
    expect(Object.values(next.links).filter((link) => link.step === 0 && link.done)).toHaveLength(3);
  });

  it("starts the draw phase at DRAW_MS", () => {
    const ctx = makeCtx(3);
    const at = WRITE_MS + 1;
    const state = onDeadline(setup(ctx), { ...ctx, now: at });
    expect(state.deadline).toBe(at + DRAW_MS);
  });

  it("gives a vote VOTE_MS once the replay is done", () => {
    const ctx = makeCtx(3);
    let state = setup(ctx);
    state = fillRound(state, ctx);
    state = fillRound(state, ctx);
    state = fillRound(state, ctx);
    const atVote = playOut(state, ctx, (s) => s.phase === "vote");
    expect(atVote.deadline).not.toBeNull();
  });

  it("advances a replay that nobody taps", () => {
    const ctx = makeCtx(3);
    let state = setup(ctx);
    state = fillRound(state, ctx);
    state = fillRound(state, ctx);
    state = fillRound(state, ctx);
    const first = state.revealed;
    const advanced = onDeadline(state, { ...ctx, now: (state.deadline ?? 0) + 1 });
    expect(advanced.revealed).toBe(first + 1);
    expect(advanced.deadline).toBe((state.deadline ?? 0) + 1 + PRESENT_MS);
  });
});

describe("no-TV mode", () => {
  it("opts in, so the phone carries the stage", () => {
    expect(sketchPhone.noTv).toBe(true);
  });

  it("leaves every player with a link to fill in every round they are dealt", () => {
    const ctx = makeCtx(4);
    let state = setup(ctx);
    for (let round = 0; round < 4; round += 1) {
      for (const id of state.playerIds) expect(canWork(state, id)).toBe(true);
      state = fillRound(state, ctx);
      if (state.phase === "replay") break;
    }
    expect(state.phase).toBe("replay");
  });
});

describe("advertised details", () => {
  it("sits inside the platform's player and length limits", () => {
    expect(sketchPhone.minPlayers).toBe(3);
    expect(sketchPhone.maxPlayers).toBe(8);
    expect(sketchPhone.minutes).toBe(15);
    expect(sketchPhone.contentKind).toBe("drawing-prompts");
    expect(VOTE_MS).toBeLessThan(DRAW_MS);
  });
});
