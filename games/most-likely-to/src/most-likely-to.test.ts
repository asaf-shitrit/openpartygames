import { describe, expect, it } from "vitest";
import type { GameContext, Rng, SuperlativeContent } from "@opg/sdk";
import type { PlayerId } from "@opg/protocol";
import {
  MIN_VOTES_FOR_PICK,
  POINTS_PER_MATCH,
  REVEAL_MS,
  ROUNDS_PER_GAME,
  VOTE_MS,
  isOver,
  mltActionSchema,
  mostLikelyTo,
  onAction,
  onDeadline,
  onPlayerRemoved,
  scores,
  setup,
  bot,
  type MltAction,
  type MltState,
} from "./index";
import { buildHostView, buildPlayerView } from "./views";

const PROMPTS: SuperlativeContent["items"] = Array.from(
  { length: 20 },
  (_, i) => ({ id: `prompt-${i}`, prompt: `do thing number ${i}` }),
);
const ALL_PROMPTS: SuperlativeContent = { kind: "superlatives", items: PROMPTS };
const NO_PROMPTS: SuperlativeContent = { kind: "superlatives", items: [] };
const BASE_NOW = 1000;

/** Deterministic LCG so every expectation is reproducible. */
function makeRng(seed: number): Rng {
  let state = seed >>> 0;
  const next = (): number => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  return {
    next,
    int: (maxExclusive) => Math.floor(next() * maxExclusive),
    shuffle: <T>(items: readonly T[]): T[] => {
      const copy = [...items];
      for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = Math.floor(next() * (i + 1));
        const a = at(copy, i);
        copy[i] = at(copy, j);
        copy[j] = a;
      }
      return copy;
    },
    pick: <T>(items: readonly T[]): T =>
      at(items, Math.floor(next() * items.length)),
  };
}

function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) {
    throw new Error(`test fixture has no item at index ${index}`);
  }
  return item;
}

function makePlayers(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i + 1}`,
    name: `P${i + 1}`,
    avatar: null,
  }));
}

function makeCtx(opts: {
  n?: number;
  connected?: PlayerId[];
  content?: SuperlativeContent;
  now?: number;
  seed?: number;
}): GameContext<SuperlativeContent> {
  const n = opts.n ?? 4;
  const players = makePlayers(n);
  return {
    players,
    connectedIds: opts.connected ?? players.map((p) => p.id),
    rng: makeRng(opts.seed ?? 1),
    now: opts.now ?? BASE_NOW,
    content: opts.content ?? ALL_PROMPTS,
  };
}

function withCtx(
  c: GameContext<SuperlativeContent>,
  patch: Partial<GameContext<SuperlativeContent>>,
) {
  return { ...c, ...patch };
}

/** Casts one vote from every id in `votes`, stopping early if the reveal starts. */
function castVotes(
  state: MltState,
  c: GameContext<SuperlativeContent>,
  votes: Record<PlayerId, PlayerId>,
): MltState {
  let s = state;
  for (const [voter, target] of Object.entries(votes)) {
    if (s.phase !== "vote") break;
    s = onAction(s, voter, { type: "vote", target }, c);
  }
  return s;
}

describe("setup", () => {
  it("deals ROUNDS_PER_GAME prompts, zero scores and a vote deadline", () => {
    const c = makeCtx({ n: 4, seed: 42 });
    const state = setup(c);
    expect(state.prompts).toHaveLength(ROUNDS_PER_GAME);
    expect(new Set(state.prompts.map((p) => p.id)).size).toBe(ROUNDS_PER_GAME);
    expect(state.playerIds).toEqual(["p1", "p2", "p3", "p4"]);
    expect(state.scores).toEqual({ p1: 0, p2: 0, p3: 0, p4: 0 });
    expect(state.phase).toBe("vote");
    expect(state.deadline).toBe(BASE_NOW + VOTE_MS);
    expect(state.finished).toBe(false);
    expect(state.history).toEqual([]);
  });

  it("keeps the pool size when the pack is smaller than ROUNDS_PER_GAME", () => {
    const c = makeCtx({
      content: { kind: "superlatives", items: PROMPTS.slice(0, 5) },
    });
    expect(setup(c).prompts).toHaveLength(5);
  });

  it("finishes immediately with a null deadline when the pack has no items", () => {
    const c = makeCtx({ content: NO_PROMPTS });
    const state = setup(c);
    expect(state.finished).toBe(true);
    expect(state.deadline).toBeNull();
    expect(state.prompts).toEqual([]);
  });
});

describe("onAction rejects an invalid vote by returning the same state", () => {
  it("rejects once the game is finished", () => {
    const c = makeCtx({});
    const state = { ...setup(c), finished: true };
    const result = onAction(state, "p1", { type: "vote", target: "p2" }, c);
    expect(result).toBe(state);
  });

  it("rejects outside the vote phase", () => {
    const c = makeCtx({ n: 3 });
    let state = setup(c);
    state = castVotes(state, c, { p1: "p1", p2: "p1", p3: "p1" });
    expect(state.phase).toBe("reveal");
    const result = onAction(state, "p1", { type: "vote", target: "p2" }, c);
    expect(result).toBe(state);
  });

  it("rejects a voter who is not in the roster", () => {
    const c = makeCtx({});
    const state = setup(c);
    const result = onAction(state, "ghost", { type: "vote", target: "p1" }, c);
    expect(result).toBe(state);
  });

  it("rejects a second vote from the same player", () => {
    const c = makeCtx({});
    const state = onAction(setup(c), "p1", { type: "vote", target: "p2" }, c);
    const result = onAction(state, "p1", { type: "vote", target: "p3" }, c);
    expect(result).toBe(state);
  });

  it("rejects a target who is not in the roster", () => {
    const c = makeCtx({});
    const state = setup(c);
    const result = onAction(state, "p1", { type: "vote", target: "ghost" }, c);
    expect(result).toBe(state);
  });
});

describe("onAction accepts a valid vote", () => {
  it("allows a self-vote", () => {
    const c = makeCtx({});
    const state = onAction(setup(c), "p1", { type: "vote", target: "p1" }, c);
    expect(state.votes.p1).toBe("p1");
  });

  it("records the vote without advancing the phase early", () => {
    const c = makeCtx({ n: 4 });
    const state = onAction(setup(c), "p1", { type: "vote", target: "p2" }, c);
    expect(state.phase).toBe("vote");
    expect(state.votes).toEqual({ p1: "p2" });
  });
});

describe("early reveal", () => {
  it("starts the reveal once every connected roster player has voted", () => {
    const c = makeCtx({ n: 3 });
    const state = castVotes(setup(c), c, { p1: "p2", p2: "p2", p3: "p1" });
    expect(state.phase).toBe("reveal");
    expect(state.deadline).toBe(BASE_NOW + REVEAL_MS);
  });

  it("a disconnected roster player does not block the early reveal", () => {
    const c = makeCtx({ n: 3, connected: ["p1", "p2"] });
    const state = castVotes(setup(c), c, { p1: "p2", p2: "p2" });
    expect(state.phase).toBe("reveal");
  });

  it("never advances when nobody is connected", () => {
    const c = makeCtx({ n: 3, connected: [] });
    const state = onAction(setup(c), "p1", { type: "vote", target: "p2" }, c);
    expect(state.phase).toBe("vote");
  });
});

describe("scoring and outcomes", () => {
  it("picked: matched voters split POINTS_PER_MATCH each, others get 0", () => {
    const c = makeCtx({ n: 4 });
    const state = castVotes(setup(c), c, {
      p1: "p2",
      p2: "p2",
      p3: "p1",
      p4: "p2",
    });
    expect(state.reveal?.outcome).toEqual({ kind: "picked", pickedId: "p2" });
    expect(state.pointsThisRound).toEqual({
      p1: POINTS_PER_MATCH,
      p2: POINTS_PER_MATCH,
      p3: 0,
      p4: POINTS_PER_MATCH,
    });
    expect(state.scores).toEqual({
      p1: POINTS_PER_MATCH,
      p2: POINTS_PER_MATCH,
      p3: 0,
      p4: POINTS_PER_MATCH,
    });
  });

  it("tie: every voter for a tied player scores", () => {
    const c = makeCtx({ n: 4 });
    const state = castVotes(setup(c), c, {
      p1: "p2",
      p2: "p3",
      p3: "p2",
      p4: "p3",
    });
    expect(state.reveal?.outcome).toEqual({
      kind: "tie",
      tiedIds: ["p2", "p3"],
    });
    expect(state.scores).toEqual({
      p1: POINTS_PER_MATCH,
      p2: POINTS_PER_MATCH,
      p3: POINTS_PER_MATCH,
      p4: POINTS_PER_MATCH,
    });
  });

  it("split: nobody reaches MIN_VOTES_FOR_PICK, so nobody scores", () => {
    const c = makeCtx({ n: 4 });
    const state = castVotes(setup(c), c, {
      p1: "p2",
      p2: "p3",
      p3: "p4",
      p4: "p1",
    });
    expect(MIN_VOTES_FOR_PICK).toBeGreaterThan(1);
    expect(state.reveal?.outcome).toEqual({ kind: "split" });
    expect(state.scores).toEqual({ p1: 0, p2: 0, p3: 0, p4: 0 });
  });

  it("no-votes: the reveal fires at the deadline with an empty tally", () => {
    const c = makeCtx({ n: 4 });
    const state = onDeadline(setup(c), c);
    expect(state.phase).toBe("reveal");
    expect(state.reveal?.outcome).toEqual({ kind: "no-votes" });
    expect(state.scores).toEqual({ p1: 0, p2: 0, p3: 0, p4: 0 });
  });

  it("adds points across rounds instead of replacing them", () => {
    const c = makeCtx({ n: 3 });
    let state = castVotes(setup(c), c, { p1: "p2", p2: "p2", p3: "p1" });
    expect(state.scores.p1).toBe(POINTS_PER_MATCH);
    state = onDeadline(state, c); // -> next vote
    state = castVotes(state, c, { p1: "p2", p2: "p2", p3: "p1" });
    expect(state.scores.p1).toBe(POINTS_PER_MATCH * 2);
  });
});

describe("phase transitions", () => {
  it("vote -> reveal -> vote for a non-final round", () => {
    const c = makeCtx({ n: 3 });
    let state = castVotes(setup(c), c, { p1: "p2", p2: "p2", p3: "p1" });
    expect(state.phase).toBe("reveal");
    state = onDeadline(state, c);
    expect(state.phase).toBe("vote");
    expect(state.roundIndex).toBe(1);
    expect(state.votes).toEqual({});
    expect(state.reveal).toBeNull();
    expect(state.pointsThisRound).toEqual({});
    expect(state.deadline).toBe(BASE_NOW + VOTE_MS);
  });

  it("finishes with a null deadline after the last round's reveal ends", () => {
    const c = makeCtx({
      n: 3,
      content: { kind: "superlatives", items: PROMPTS.slice(0, 1) },
    });
    let state = castVotes(setup(c), c, { p1: "p2", p2: "p2", p3: "p1" });
    expect(state.phase).toBe("reveal");
    state = onDeadline(state, c);
    expect(state.finished).toBe(true);
    expect(state.deadline).toBeNull();
    expect(state.phase).toBe("reveal");
  });

  it("finished game ignores onDeadline and onAction", () => {
    const c = makeCtx({
      n: 3,
      content: { kind: "superlatives", items: PROMPTS.slice(0, 1) },
    });
    let state = castVotes(setup(c), c, { p1: "p2", p2: "p2", p3: "p1" });
    state = onDeadline(state, c);
    expect(state.finished).toBe(true);
    const afterDeadline = onDeadline(state, c);
    expect(afterDeadline).toBe(state);
    const afterAction = onAction(
      state,
      "p1",
      { type: "vote", target: "p2" },
      c,
    );
    expect(afterAction).toBe(state);
  });
});

describe("history", () => {
  it("records one entry per completed round, including the last", () => {
    const c = makeCtx({
      n: 3,
      content: { kind: "superlatives", items: PROMPTS.slice(0, 2) },
    });
    let state = castVotes(setup(c), c, { p1: "p2", p2: "p2", p3: "p1" });
    state = onDeadline(state, c); // round 1 recorded, -> vote round 2
    expect(state.history).toHaveLength(1);
    expect(state.history[0]).toEqual({
      votes: { p1: "p2", p2: "p2", p3: "p1" },
      matchedIds: ["p1", "p2"],
    });
    state = castVotes(state, c, { p1: "p3", p2: "p3", p3: "p1" });
    state = onDeadline(state, c); // round 2 recorded, game finishes
    expect(state.history).toHaveLength(2);
    expect(state.finished).toBe(true);
  });

  it("records a round even when the reveal is skipped instead of timing out", () => {
    const c = makeCtx({ n: 3 });
    let state = castVotes(setup(c), c, { p1: "p2", p2: "p2", p3: "p1" });
    expect(state.phase).toBe("reveal");
    // A VIP skip calls onDeadline just like a timeout.
    state = onDeadline(state, c);
    expect(state.history).toHaveLength(1);
  });
});

describe("kicks during the vote", () => {
  it("drops the kicked player's own vote and votes for them", () => {
    const c = makeCtx({ n: 4 });
    let state = castVotes(setup(c), c, { p1: "p2", p2: "p3", p4: "p2" });
    state = onPlayerRemoved(state, "p2", c);
    expect(state.playerIds).toEqual(["p1", "p3", "p4"]);
    expect(state.votes).toEqual({});
    expect(state.scores).toEqual({ p1: 0, p3: 0, p4: 0 });
  });

  it("can trigger the reveal once the remaining connected roster has voted", () => {
    const c = makeCtx({ n: 4 });
    let state = onAction(setup(c), "p1", { type: "vote", target: "p1" }, c);
    state = onAction(state, "p3", { type: "vote", target: "p1" }, c);
    state = onAction(state, "p4", { type: "vote", target: "p1" }, c);
    expect(state.phase).toBe("vote"); // p2 has not voted yet
    state = onPlayerRemoved(state, "p2", c);
    expect(state.phase).toBe("reveal");
  });

  it("removing an unknown id is a no-op", () => {
    const c = makeCtx({});
    const state = setup(c);
    expect(onPlayerRemoved(state, "ghost", c)).toBe(state);
  });
});

describe("kicks during the reveal", () => {
  it("keeps the reveal object and deadline frozen, but drops scores", () => {
    const c = makeCtx({ n: 4 });
    let state = castVotes(setup(c), c, {
      p1: "p2",
      p2: "p2",
      p3: "p1",
      p4: "p2",
    });
    expect(state.phase).toBe("reveal");
    const revealBefore = state.reveal;
    const deadlineBefore = state.deadline;
    state = onPlayerRemoved(state, "p2", withCtx(c, { now: c.now + 5000 }));
    expect(state.reveal).toBe(revealBefore);
    expect(state.deadline).toBe(deadlineBefore);
    expect(state.playerIds).toEqual(["p1", "p3", "p4"]);
    expect(state.scores).toEqual({ p1: POINTS_PER_MATCH, p3: 0, p4: POINTS_PER_MATCH });
  });
});

describe("view secrecy", () => {
  it("the host view never exposes any voter -> target pair during the vote", () => {
    const c = makeCtx({ n: 4 });
    let state = onAction(setup(c), "p1", { type: "vote", target: "p3" }, c);
    state = onAction(state, "p2", { type: "vote", target: "p4" }, c);
    expect(state.phase).toBe("vote");

    const host = buildHostView(state);
    expect(host.reveal).toBeNull();
    expect(host.pointsThisRound).toBeNull();
    expect(host.votedIds).toEqual(["p1", "p2"]);
    // The host view type carries no votes map at all -- nothing to serialize that
    // could pair a voter with a target.
    expect(Object.keys(host)).not.toContain("votes");
    expect(JSON.stringify(host)).not.toContain('"votes"');
  });

  it("each player view exposes only that player's own vote during the vote", () => {
    const c = makeCtx({ n: 4 });
    let state = onAction(setup(c), "p1", { type: "vote", target: "p3" }, c);
    state = onAction(state, "p2", { type: "vote", target: "p4" }, c);
    expect(state.phase).toBe("vote");

    for (const id of state.playerIds) {
      const view = buildPlayerView(state, id);
      expect(view.reveal).toBeNull();
      expect(view.myPoints).toBeNull();
      expect(view.myVote).toBe(state.votes[id] ?? null);
      expect(Object.keys(view)).not.toContain("votes");
      expect(JSON.stringify(view)).not.toContain('"votes"');
    }
    // p1 and p2 voted differently; their views must disagree on myVote.
    expect(buildPlayerView(state, "p1").myVote).toBe("p3");
    expect(buildPlayerView(state, "p2").myVote).toBe("p4");
  });
});

describe("mltActionSchema", () => {
  it("accepts a well-formed vote", () => {
    const parsed = mltActionSchema.safeParse({ type: "vote", target: "p1" });
    expect(parsed.success).toBe(true);
  });

  it("rejects an unknown type, empty target, and a too-long target", () => {
    expect(mltActionSchema.safeParse({ type: "shrug" }).success).toBe(false);
    expect(
      mltActionSchema.safeParse({ type: "vote", target: "" }).success,
    ).toBe(false);
    expect(
      mltActionSchema.safeParse({ type: "vote", target: "x".repeat(129) })
        .success,
    ).toBe(false);
  });
});

describe("bot", () => {
  it("votes for a candidate when unvoted", () => {
    const c = makeCtx({ n: 3 });
    const state = setup(c);
    const view = buildPlayerView(state, "p1");
    const action = bot(view, makeRng(5));
    expect(action).toEqual({ type: "vote", target: expect.any(String) });
  });

  it("does nothing once the player has voted", () => {
    const c = makeCtx({ n: 3 });
    const state = onAction(setup(c), "p1", { type: "vote", target: "p2" }, c);
    const view = buildPlayerView(state, "p1");
    expect(bot(view, makeRng(5))).toBeNull();
  });

  it("does nothing outside the vote phase", () => {
    const c = makeCtx({ n: 3 });
    const state = castVotes(setup(c), c, { p1: "p2", p2: "p2", p3: "p1" });
    const view = buildPlayerView(state, "p1");
    expect(bot(view, makeRng(5))).toBeNull();
  });
});

describe("mostLikelyTo definition", () => {
  it("exposes isOver and scores over the underlying state", () => {
    const c = makeCtx({ n: 3 });
    const state = setup(c);
    expect(isOver(state)).toBe(false);
    expect(scores(state)).toBe(state.scores);
  });

  it("carries the expected identity and limits", () => {
    expect(mostLikelyTo.id).toBe("most-likely-to");
    expect(mostLikelyTo.contentKind).toBe("superlatives");
  });

  it("never proposes an action the game would reject for a self-vote-only bot", () => {
    const c = makeCtx({ n: 3 });
    let state = setup(c);
    for (const id of state.playerIds) {
      const view = buildPlayerView(state, id);
      const action: MltAction | null = bot(view, makeRng(1));
      if (action === null) continue;
      const before = state;
      state = onAction(state, id, action, c);
      expect(state).not.toBe(before);
    }
  });
});
