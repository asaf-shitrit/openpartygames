import { describe, expect, it } from "vitest";
import type { Fact, FactContent, GameContext, Rng } from "@opg/sdk";
import type { PlayerId } from "@opg/protocol";
import {
  FACTS_PER_GAME,
  LIE_MAX_LENGTH,
  POINTS_PER_FOOL,
  POINTS_TRUTH,
  REVEAL_MS,
  VOTE_MS,
  WRITE_MS,
  bot,
  buildHostView,
  buildPlayerView,
  isOver,
  nextDeadline,
  onAction,
  onDeadline,
  onPlayerRemoved,
  ronActionSchema,
  realOrNah,
  setup,
  type RonState,
  type RonAction,
} from "./index";

// ---------- Fixtures ----------

function fact(
  id: string,
  answer: string,
  alternates: string[],
  decoys: string[],
): Fact {
  return {
    id,
    prompt: `${id} is ____.`,
    answer,
    alternates,
    decoys,
    source: { title: `${id} source`, url: `https://example.com/${id}` },
  };
}

const EMU = fact(
  "emu",
  "emus",
  ["emu"],
  ["kangaroos", "rabbits", "cane toads"],
);
const SCOTLAND = fact(
  "scotland",
  "unicorn",
  ["unicorns"],
  ["red deer", "golden eagle", "highland cow"],
);

const MANY_FACTS: FactContent = {
  kind: "facts",
  items: [
    EMU,
    SCOTLAND,
    fact("f3", "cubes", ["cube"], ["stars", "spirals", "pyramids"]),
    fact("f4", "three", ["3"], ["two", "five", "nine"]),
    fact("f5", "year", [], ["decade", "century", "month"]),
    fact("f6", "trees", ["tree"], ["jellyfish", "sponges", "the Moon"]),
    fact("f7", "radioactive", [], ["magnetic", "electric", "glowing"]),
    fact("f8", "BackRub", ["back rub"], ["Googol", "PageFinder", "LinkLoop"]),
  ],
};

const ONE_FACT: FactContent = { kind: "facts", items: [EMU] };
const TWO_FACTS: FactContent = { kind: "facts", items: [EMU, SCOTLAND] };

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
        const a = copy[i];
        const b = copy[j];
        if (a === undefined || b === undefined) continue;
        copy[i] = b;
        copy[j] = a;
      }
      return copy;
    },
    pick: <T>(items: readonly T[]): T => {
      if (items.length === 0) throw new Error("pick from empty");
      const item = items[Math.floor(next() * items.length)];
      if (item === undefined) throw new Error("pick out of range");
      return item;
    },
  };
}

function makePlayers(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i + 1}`,
    name: `P${i + 1}`,
    avatar: null,
  }));
}

function makeCtx(
  opts: {
    n?: number;
    connected?: PlayerId[];
    content?: FactContent;
    now?: number;
    seed?: number;
  } = {},
): GameContext<FactContent> {
  const n = opts.n ?? 4;
  const players = makePlayers(n);
  return {
    players,
    connectedIds: opts.connected ?? players.map((p) => p.id),
    rng: makeRng(opts.seed ?? 7),
    now: opts.now ?? BASE_NOW,
    content: opts.content ?? ONE_FACT,
  };
}

function lie(
  state: RonState,
  playerId: PlayerId,
  text: string,
  ctx: GameContext<FactContent>,
): RonState {
  const action = ronActionSchema.safeParse({ type: "lie", text }).data ?? null;
  if (action === null) throw new Error("bad test action");
  return onAction(state, playerId, action, ctx);
}

function pick(
  state: RonState,
  playerId: PlayerId,
  optionId: string,
  ctx: GameContext<FactContent>,
): RonState {
  const action =
    ronActionSchema.safeParse({ type: "pick", optionId }).data ?? null;
  if (action === null) throw new Error("bad test action");
  return onAction(state, playerId, action, ctx);
}

function optionIdByText(state: RonState, text: string): string {
  const option = (state.options ?? []).find((o) => o.text === text);
  if (option === undefined) throw new Error(`no option ${text}`);
  return option.id;
}

/** Fails loudly instead of asserting conditionally when a bot answers wrongly. */
function lieText(action: RonAction | null): string {
  if (action === null || action.type !== "lie")
    throw new Error("expected a lie action");
  return action.text;
}

function pickedOptionId(action: RonAction | null): string {
  if (action === null || action.type !== "pick")
    throw new Error("expected a pick action");
  return action.optionId;
}

// ---------- Tests ----------

describe("setup", () => {
  it("picks min(6, items) distinct facts", () => {
    const ctx = makeCtx({ content: MANY_FACTS });
    const state = setup(ctx);
    expect(state.facts).toHaveLength(FACTS_PER_GAME);
    expect(new Set(state.facts.map((f) => f.id)).size).toBe(FACTS_PER_GAME);
    expect(state.phase).toBe("write");
    expect(state.deadline).toBe(BASE_NOW + WRITE_MS);
    expect(state.scores).toEqual({ p1: 0, p2: 0, p3: 0, p4: 0 });
  });

  it("uses every item when the pack is smaller than the cap", () => {
    const state = setup(makeCtx({ content: TWO_FACTS }));
    expect(state.facts).toHaveLength(2);
  });
});

describe("lie validation", () => {
  it("rejects the truth and its alternates with a new state carrying lieError", () => {
    const ctx = makeCtx();
    const state = setup(ctx);
    for (const text of ["emus", "emu", "The Emus!", "  EMU "]) {
      const next = lie(state, "p1", text, ctx);
      expect(next).not.toBe(state);
      expect(next.lieErrors.p1).toBe("truth");
      expect(next.lies.p1).toBeUndefined();
    }
  });

  it("accepts a cleaned lie and clears a previous error", () => {
    const ctx = makeCtx();
    const rejected = lie(setup(ctx), "p1", "emus", ctx);
    expect(rejected.lieErrors.p1).toBe("truth");
    const accepted = lie(rejected, "p1", "  a   giant   bird  ", ctx);
    expect(accepted.lies.p1).toBe("a giant bird");
    expect(accepted.lieErrors.p1).toBeUndefined();
  });

  it("rejects another player's lie as duplicate after normalization", () => {
    const ctx = makeCtx();
    let state = setup(ctx);
    state = lie(state, "p1", "giraffe", ctx);
    const dup = lie(state, "p2", "  GIRAFFE!  ", ctx);
    expect(dup).not.toBe(state);
    expect(dup.lieErrors.p2).toBe("duplicate");
    expect(dup.lies.p2).toBeUndefined();
  });

  it("rejects empty and too-long lies as invalid", () => {
    const ctx = makeCtx();
    const state = setup(ctx);
    for (const text of ["", "   ", "x".repeat(LIE_MAX_LENGTH + 1)]) {
      const next = lie(state, "p1", text, ctx);
      expect(next).not.toBe(state);
      expect(next.lieErrors.p1).toBe("invalid");
    }
    const ok = lie(state, "p1", "x".repeat(LIE_MAX_LENGTH), ctx);
    expect(ok.lies.p1).toHaveLength(LIE_MAX_LENGTH);
  });

  it("rejects a second lie from the same player with the same state object", () => {
    const ctx = makeCtx();
    let state = setup(ctx);
    state = lie(state, "p1", "giraffe", ctx);
    expect(lie(state, "p1", "hippos", ctx)).toBe(state);
  });

  it("rejects a lie in the wrong phase with the same state object", () => {
    const ctx = makeCtx({ content: TWO_FACTS });
    const state = onDeadline(setup(ctx), ctx);
    expect(state.phase).toBe("vote");
    expect(lie(state, "p1", "giraffe", ctx)).toBe(state);
  });
});

describe("options", () => {
  it("fills with decoys up to MIN_OPTIONS, skipping decoys equal to a lie", () => {
    const ctx = makeCtx({ n: 3, content: ONE_FACT });
    let state = lie(setup(ctx), "p1", "kangaroos", ctx); // same word as a decoy
    state = onDeadline(state, ctx);
    expect(state.phase).toBe("vote");
    const options = state.options ?? [];
    expect(options).toHaveLength(4);
    expect(options.map((o) => o.id)).toEqual(["o1", "o2", "o3", "o4"]);
    const texts = options.map((o) => o.text.toLowerCase());
    expect(new Set(texts).size).toBe(texts.length);
    expect(texts).toContain("emus"); // truth
    expect(texts).toContain("kangaroos"); // the lie
    expect(
      texts.filter((t) =>
        ["emus", "kangaroos", "rabbits", "cane toads"].includes(t),
      ),
    ).toHaveLength(4);
  });

  it("skips decoys that normalize equal to a lie", () => {
    const ctx = makeCtx({
      n: 3,
      content: {
        kind: "facts",
        items: [fact("x", "cat", [], ["The Dog", "a horse", "bird"])],
      },
    });
    let state = lie(setup(ctx), "p1", "dog", ctx);
    state = onDeadline(state, ctx);
    const texts = (state.options ?? []).map((o) => o.text);
    expect(texts.filter((t) => /dog/i.test(t))).toHaveLength(1);
    expect(texts).toHaveLength(4);
  });
});

describe("early phase ends", () => {
  it("ends write when every connected player has submitted", () => {
    const ctx = makeCtx({ n: 4, connected: ["p1", "p2"] });
    let state = setup(ctx);
    state = lie(state, "p1", "giraffe", ctx);
    expect(state.phase).toBe("write");
    state = lie(state, "p2", "hippos", ctx);
    expect(state.phase).toBe("vote");
    expect(state.deadline).toBe(BASE_NOW + VOTE_MS);
  });

  it("ends vote when every connected player who can pick has picked", () => {
    const ctx = makeCtx({ n: 4, connected: ["p1", "p2"] });
    let state = setup(ctx);
    state = lie(state, "p1", "giraffe", ctx);
    state = onDeadline(state, ctx);
    expect(state.phase).toBe("vote");
    const truthId = optionIdByText(state, "emus");
    state = pick(state, "p1", truthId, ctx);
    expect(state.phase).toBe("vote");
    state = pick(state, "p2", truthId, ctx);
    expect(state.phase).toBe("reveal");
    expect(state.deadline).toBe(BASE_NOW + REVEAL_MS);
  });
});

describe("picking", () => {
  it("rejects a player's own lie with the same state object", () => {
    const ctx = makeCtx({ n: 3, content: TWO_FACTS });
    let state = lie(setup(ctx), "p1", "giraffe", ctx);
    state = onDeadline(state, ctx);
    const own = state.options?.find((o) => o.authorId === "p1");
    expect(own).toBeDefined();
    expect(pick(state, "p1", own?.id ?? "", ctx)).toBe(state);
  });

  it("rejects a second pick and an unknown option with the same state object", () => {
    const ctx = makeCtx({ n: 3 });
    let state = lie(setup(ctx), "p1", "giraffe", ctx);
    state = onDeadline(state, ctx);
    const truthId = optionIdByText(state, "emus");
    state = pick(state, "p1", truthId, ctx);
    expect(pick(state, "p1", truthId, ctx)).toBe(state);
    expect(pick(state, "p2", "nope", ctx)).toBe(state);
  });
});

describe("scoring", () => {
  it("awards truth and fool points, accumulating across facts and finishing", () => {
    const ctx = makeCtx({ n: 3, content: TWO_FACTS });
    let state = setup(ctx);

    // --- Fact 1: p1 + p2 lie, p3 waits for the deadline ---
    state = lie(state, "p1", "aaa", ctx);
    state = lie(state, "p2", "bbb", ctx);
    const answer1 = state.facts[0]?.answer ?? "";
    const answer2 = state.facts[1]?.answer ?? "";
    state = onDeadline(state, ctx);
    expect(state.phase).toBe("vote");
    const truth1 = optionIdByText(state, answer1);
    const p1Lie = optionIdByText(state, "aaa");
    const p2Lie = optionIdByText(state, "bbb");
    state = pick(state, "p1", truth1, ctx); // p1 finds truth
    state = pick(state, "p2", p1Lie, ctx); // p2 fooled by p1
    state = pick(state, "p3", p2Lie, ctx); // p3 fooled by p2
    expect(state.phase).toBe("reveal");
    expect(state.reveal?.foundByIds).toEqual(["p1"]);
    expect(state.pointsThisFact).toEqual({
      p1: POINTS_TRUTH + POINTS_PER_FOOL,
      p2: POINTS_PER_FOOL,
      p3: 0,
    });
    expect(state.scores).toEqual({
      p1: POINTS_TRUTH + POINTS_PER_FOOL,
      p2: POINTS_PER_FOOL,
      p3: 0,
    });

    // --- Fact 2: same pattern, scores accumulate, then the game ends ---
    state = onDeadline(state, ctx);
    expect(state.phase).toBe("write");
    expect(state.factIndex).toBe(1);
    state = lie(state, "p1", "ccc", ctx);
    state = lie(state, "p2", "ddd", ctx);
    state = onDeadline(state, ctx);
    const truth2 = optionIdByText(state, answer2);
    const p1Lie2 = optionIdByText(state, "ccc");
    const p2Lie2 = optionIdByText(state, "ddd");
    state = pick(state, "p1", truth2, ctx);
    state = pick(state, "p2", p1Lie2, ctx);
    state = pick(state, "p3", p2Lie2, ctx);
    expect(state.phase).toBe("reveal");
    expect(state.scores.p1).toBe(2 * (POINTS_TRUTH + POINTS_PER_FOOL));
    expect(state.scores.p2).toBe(2 * POINTS_PER_FOOL);

    state = onDeadline(state, ctx);
    expect(state.finished).toBe(true);
    expect(isOver(state)).toBe(true);
    expect(nextDeadline(state)).toBeNull();
    expect(realOrNah.scores(state)).toEqual(state.scores);
  });
});

describe("view secrecy", () => {
  it("never serializes the truth flag or author ids before reveal", () => {
    const ctx = makeCtx({ n: 3 });
    let state = lie(setup(ctx), "p1", "giraffe", ctx);

    const writeHost = JSON.stringify(buildHostView(state));
    const writePlayer = JSON.stringify(buildPlayerView(state, "p2"));
    for (const json of [writeHost, writePlayer]) {
      expect(json).not.toContain("isTruth");
      expect(json).not.toContain("authorId");
      expect(json).not.toContain("truthOptionId");
      expect(json).not.toContain('"reveal":{');
    }
    expect(JSON.parse(writePlayer).options).toBeNull();

    state = onDeadline(state, ctx);
    const voteHost = JSON.stringify(buildHostView(state));
    const votePlayer = JSON.stringify(buildPlayerView(state, "p2"));
    for (const json of [voteHost, votePlayer]) {
      expect(json).not.toContain("isTruth");
      expect(json).not.toContain("authorId");
      expect(json).not.toContain("truthOptionId");
    }
    expect(JSON.parse(voteHost).options.length).toBeGreaterThanOrEqual(4);

    const truthId = optionIdByText(state, "emus");
    state = pick(state, "p1", truthId, ctx);
    state = pick(state, "p2", truthId, ctx);
    state = pick(state, "p3", truthId, ctx);
    expect(state.phase).toBe("reveal");
    const revealPlayer = JSON.parse(
      JSON.stringify(buildPlayerView(state, "p1")),
    );
    expect(revealPlayer.reveal.truthOptionId).toBe(truthId);
    expect(revealPlayer.myPoints).toBe(POINTS_TRUTH);
  });
});

describe("parseAction", () => {
  it("rejects malformed payloads", () => {
    for (const raw of [
      null,
      42,
      "lie",
      [],
      {},
      { type: "lie" },
      { type: "lie", text: 5 },
      { type: "lie", text: "x".repeat(201) },
      { type: "pick" },
      { type: "pick", optionId: "" },
      { type: "pick", optionId: 5 },
      { type: "pick", optionId: "x".repeat(65) },
      { type: "nope" },
    ]) {
      expect(ronActionSchema.safeParse(raw).data ?? null).toBeNull();
    }
  });

  it("accepts only the valid shapes", () => {
    expect(
      ronActionSchema.safeParse({ type: "lie", text: "" }).data ?? null,
    ).toEqual({
      type: "lie",
      text: "",
    });
    expect(
      ronActionSchema.safeParse({ type: "lie", text: "x".repeat(200) }).data ??
        null,
    ).toEqual({
      type: "lie",
      text: "x".repeat(200),
    });
    expect(
      ronActionSchema.safeParse({ type: "pick", optionId: "o1" }).data ?? null,
    ).toEqual({
      type: "pick",
      optionId: "o1",
    });
  });
});

describe("onPlayerRemoved", () => {
  it("drops the lie and pick, anonymizes their option and scores nothing for it", () => {
    const ctx = makeCtx({ n: 4, connected: ["p1", "p3", "p4"] });
    let state = lie(setup(ctx), "p1", "aaa", ctx);
    state = lie(state, "p2", "bbb", ctx);
    state = onDeadline(state, ctx);
    expect(state.phase).toBe("vote");

    const removed = onPlayerRemoved(state, "p2", ctx);
    expect(removed.playerIds).toEqual(["p1", "p3", "p4"]);
    expect(removed.lies.p2).toBeUndefined();
    expect(removed.votes.p2).toBeUndefined();
    expect(removed.scores.p2).toBeUndefined();
    expect(removed.options?.find((o) => o.text === "bbb")?.authorId).toBeNull();
    expect(removed.options?.find((o) => o.text === "aaa")?.authorId).toBe("p1");

    // p1 finds the truth; p3 is fooled by p1; p4 picks p2's now-anonymous option.
    const truthId = optionIdByText(removed, "emus");
    const p1Lie = optionIdByText(removed, "aaa");
    const anonOption = removed.options?.find((o) => o.text === "bbb");
    let next = pick(removed, "p1", truthId, ctx);
    next = pick(next, "p3", p1Lie, ctx);
    next = pick(next, "p4", anonOption?.id ?? "", ctx);
    expect(next.phase).toBe("reveal");
    expect(next.reveal?.lies.map((l) => l.authorId)).toEqual(["p1"]);
    expect(next.scores.p1).toBe(POINTS_TRUTH + POINTS_PER_FOOL);
    expect(Object.keys(next.scores)).toEqual(["p1", "p3", "p4"]);
    expect(next.pointsThisFact.p2).toBeUndefined();
  });
});

describe("onPlayerRemoved edges", () => {
  it("ignores a player who is not in the game", () => {
    const ctx = makeCtx({ n: 3 });
    const state = setup(ctx);
    expect(onPlayerRemoved(state, "ghost", ctx)).toBe(state);
  });

  it("starts the vote when the removed player was the last one writing", () => {
    const ctx = makeCtx({ n: 4, connected: ["p1", "p2"] });
    let state = lie(setup(ctx), "p1", "giraffe", ctx);
    expect(state.phase).toBe("write");
    state = onPlayerRemoved(state, "p2", ctx);
    expect(state.phase).toBe("vote");
    expect(state.options?.some((o) => o.text === "giraffe")).toBe(true);
  });

  it("starts the reveal when the removed player was the last one voting", () => {
    const ctx = makeCtx({ n: 4, connected: ["p1", "p2"] });
    let state = lie(setup(ctx), "p1", "giraffe", ctx);
    state = onDeadline(state, ctx);
    state = pick(state, "p1", optionIdByText(state, "emus"), ctx);
    expect(state.phase).toBe("vote");
    state = onPlayerRemoved(state, "p2", ctx);
    expect(state.phase).toBe("reveal");
    expect(state.reveal?.lies.map((l) => l.authorId)).toEqual(["p1"]);
  });

  it("recomputes the reveal when a player leaves after the vote", () => {
    const ctx = makeCtx({ n: 4 });
    let state = lie(setup(ctx), "p1", "aaa", ctx);
    state = onDeadline(state, ctx);
    const truthId = optionIdByText(state, "emus");
    state = pick(state, "p1", truthId, ctx);
    state = pick(state, "p2", truthId, ctx);
    state = pick(state, "p3", optionIdByText(state, "aaa"), ctx);
    state = pick(state, "p4", truthId, ctx);
    expect(state.phase).toBe("reveal");
    expect(state.reveal?.foundByIds).toEqual(["p1", "p2", "p4"]);

    const after = onPlayerRemoved(state, "p1", ctx);
    expect(after.playerIds).toEqual(["p2", "p3", "p4"]);
    expect(after.reveal?.foundByIds).toEqual(["p2", "p4"]);
    expect(after.reveal?.lies).toEqual([]);
    expect(after.scores.p1).toBeUndefined();
  });
});

describe("finished game", () => {
  it("ignores actions and deadlines once every fact is done", () => {
    const ctx = makeCtx({ content: ONE_FACT });
    const done = onDeadline(onDeadline(onDeadline(setup(ctx), ctx), ctx), ctx);
    expect(done.finished).toBe(true);
    expect(onAction(done, "p1", { type: "lie", text: "giraffe" }, ctx)).toBe(
      done,
    );
    expect(onDeadline(done, ctx)).toBe(done);
  });

  it("finishes straight away when the pack has no facts", () => {
    const ctx = makeCtx({ content: { kind: "facts", items: [] } });
    const state = setup(ctx);
    expect(state.finished).toBe(true);
    expect(state.deadline).toBeNull();
    expect(buildHostView(state).prompt).toBe("");
  });
});

describe("bot", () => {
  it("submits a bounded lie during write", () => {
    const ctx = makeCtx({ n: 3 });
    const view = buildPlayerView(setup(ctx), "p2");
    const action = bot(view, makeRng(1));
    expect(action?.type).toBe("lie");
    expect(lieText(action).length).toBeLessThanOrEqual(LIE_MAX_LENGTH);
  });

  it("does not lie twice and picks a random option that is not its own", () => {
    const ctx = makeCtx({ n: 3 });
    let state = lie(setup(ctx), "p1", "giraffe", ctx);
    state = onDeadline(state, ctx);
    const view = buildPlayerView(state, "p2");
    expect(view.myLie).toBeNull();
    const action = bot(view, makeRng(2));
    expect(action?.type).toBe("pick");
    const option = view.options?.find((o) => o.id === pickedOptionId(action));
    expect(option?.mine).toBe(false);
  });

  it("waits during reveal", () => {
    const ctx = makeCtx({ n: 3 });
    let state = lie(setup(ctx), "p1", "giraffe", ctx);
    state = onDeadline(state, ctx);
    const truthId = optionIdByText(state, "emus");
    state = pick(state, "p1", truthId, ctx);
    state = pick(state, "p2", truthId, ctx);
    state = pick(state, "p3", truthId, ctx);
    expect(state.phase).toBe("reveal");
    expect(bot(buildPlayerView(state, "p1"), makeRng(3))).toBeNull();
  });
});

describe("deadlines", () => {
  it("advances exactly one transition per deadline", () => {
    const ctx = makeCtx({ content: ONE_FACT });
    const state = setup(ctx);
    expect(nextDeadline(state)).toBe(BASE_NOW + WRITE_MS);
    const afterWrite = onDeadline(state, ctx);
    expect(afterWrite.phase).toBe("vote");

    const afterVote = onDeadline(afterWrite, ctx);
    expect(afterVote.phase).toBe("reveal");

    const afterReveal = onDeadline(afterVote, ctx);
    expect(afterReveal.finished).toBe(true);
  });
});
