import { describe, expect, it } from "vitest";
import type { GameContext, Rng, WordPairContent } from "@opg/sdk";
import type { PlayerId } from "@opg/protocol";
import {
  LAST_CHANCE_MS,
  RESULT_CANCELLED_MS,
  RESULT_CAUGHT_MS,
  RESULT_ESCAPED_MS,
  REVEAL_MS,
  TYPING_MIN_INTERVAL_MS,
  VOTE_MS,
  WORD_CHECK_MS,
  resultDurationMs,
  buildClueOrder,
  imposter,
  isOver,
  onAction,
  onDeadline,
  onPlayerRemoved,
  onPlayersChanged,
  imposterActionSchema,
  setup,
  type ImposterAction,
  type ImposterState,
  type ImposterWord,
} from "./index";
import { buildHostView, buildPlayerView } from "./views";

const PAIRS: WordPairContent["items"] = [
  { crew: "apple", decoy: "apricot" },
  { crew: "bridge", decoy: "tunnel" },
  { crew: "coffee", decoy: "cocoa" },
  { crew: "dolphin", decoy: "whale" },
  { crew: "guitar", decoy: "violin" },
  { crew: "mountain", decoy: "hill" },
  { crew: "pizza", decoy: "calzone" },
  { crew: "winter", decoy: "autumn" },
];

const ALL_PAIRS: WordPairContent = { kind: "word-pairs", items: PAIRS };
const ONE_PAIR: WordPairContent = {
  kind: "word-pairs",
  items: [{ crew: "apple", decoy: "apricot" }],
};
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

/** Indexes a fixture, failing loudly instead of silently reading undefined. */
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
  content?: WordPairContent;
  now?: number;
  seed?: number;
}): GameContext<WordPairContent> {
  const n = opts.n ?? 4;
  const players = makePlayers(n);
  return {
    players,
    connectedIds: opts.connected ?? players.map((p) => p.id),
    rng: makeRng(opts.seed ?? 1),
    now: opts.now ?? BASE_NOW,
    content: opts.content ?? ALL_PAIRS,
  };
}

function withCtx(
  c: GameContext<WordPairContent>,
  patch: Partial<GameContext<WordPairContent>>,
) {
  return { ...c, ...patch };
}

function viewCtx(c: GameContext<WordPairContent>) {
  return { now: c.now };
}

function currentSpeaker(state: ImposterState): PlayerId | null {
  if (state.phase !== "clues") return null;
  return state.clueOrder[state.clueIndex] ?? null;
}

function requiredSpeaker(state: ImposterState): PlayerId {
  const speaker = currentSpeaker(state);
  if (speaker === null) throw new Error("expected the clues phase");
  return speaker;
}

function wordAt(
  state: ImposterState,
  wordIndex = state.wordIndex,
): ImposterWord {
  const word = state.words[wordIndex];
  if (word === undefined) throw new Error(`no word at index ${wordIndex}`);
  return word;
}

function imposterOf(
  state: ImposterState,
  wordIndex = state.wordIndex,
): PlayerId {
  return wordAt(state, wordIndex).imposterId;
}

function otherPlayer(ids: readonly PlayerId[], exclude: PlayerId): PlayerId {
  const found = ids.find((id) => id !== exclude);
  if (found === undefined) throw new Error("expected another player");
  return found;
}

function playerExcept(
  ids: readonly PlayerId[],
  exclude: readonly PlayerId[],
): PlayerId {
  const found = ids.find((id) => !exclude.includes(id));
  if (found === undefined) throw new Error("expected another player");
  return found;
}

function crewIds(ids: readonly PlayerId[], imposterId: PlayerId): PlayerId[] {
  return ids.filter((id) => id !== imposterId);
}

function voteTargetOf(action: ImposterAction | null): PlayerId {
  if (action === null || action.type !== "vote") {
    throw new Error("expected a vote action");
  }
  return action.target;
}

/** word-check -> clues, then every speaker stands up until the vote opens. */
function toVotePhase(
  state: ImposterState,
  c: GameContext<WordPairContent>,
): ImposterState {
  let s = onDeadline(state, c);
  while (s.phase === "clues") {
    s = onAction(s, requiredSpeaker(s), { type: "done" }, c);
  }
  return s;
}

/** Plays one complete word and returns the state in `result`. */
function playWord(
  state: ImposterState,
  c: GameContext<WordPairContent>,
  votes: Record<PlayerId, PlayerId>,
  guess: string | null,
): ImposterState {
  let s = onDeadline(state, c); // word-check -> clues
  while (s.phase === "clues") {
    s = onAction(s, requiredSpeaker(s), { type: "done" }, c);
  }
  for (const [voter, target] of Object.entries(votes)) {
    if (s.phase !== "vote") break;
    s = onAction(s, voter, { type: "vote", target }, c);
  }
  if (s.phase === "vote") s = onDeadline(s, c); // -> reveal
  if (s.phase === "reveal") s = onDeadline(s, c); // -> last-chance or result
  if (s.phase === "last-chance") {
    s =
      guess === null
        ? onDeadline(s, c)
        : onAction(s, imposterOf(s), { type: "guess", text: guess }, c);
  }
  return s;
}

/** Everyone votes the imposter out; the imposter dumps a vote somewhere safe. */
function votesCaught(state: ImposterState) {
  const imp = imposterOf(state);
  const other = otherPlayer(state.playerIds, imp);
  const votes: Record<PlayerId, PlayerId> = {};
  for (const id of state.playerIds) votes[id] = id === imp ? other : imp;
  return votes;
}

/** The imposter loses: all votes land on one crew member. */
function votesNotCaught(state: ImposterState) {
  const imp = imposterOf(state);
  const target = otherPlayer(state.playerIds, imp);
  const votes: Record<PlayerId, PlayerId> = {};
  for (const id of state.playerIds) votes[id] = id === target ? imp : target;
  return votes;
}

/** Two crew targets tie at the top, so nobody is caught. */
function votesTied(state: ImposterState) {
  const imp = imposterOf(state);
  const crew = crewIds(state.playerIds, imp);
  const c0 = at(crew, 0);
  const c1 = at(crew, 1);
  const c2 = at(crew, 2);
  return { [imp]: c0, [c0]: imp, [c1]: c0, [c2]: imp };
}

describe("setup", () => {
  it("picks min(6, items) distinct pairs and never makes the imposter the first speaker", () => {
    const c = makeCtx({ n: 5, seed: 42 });
    const state = setup(c);

    expect(state.words).toHaveLength(6);
    expect(new Set(state.words.map((w) => w.crew)).size).toBe(6);
    expect(state.playerIds).toEqual(["p1", "p2", "p3", "p4", "p5"]);
    expect(new Set(state.clueOrder)).toEqual(new Set(state.playerIds));
    expect(state.clueOrder[0]).not.toBe(imposterOf(state));
    expect(state.phase).toBe("word-check");
    expect(state.deadline).toBe(BASE_NOW + WORD_CHECK_MS);
    expect(state.scores).toEqual({ p1: 0, p2: 0, p3: 0, p4: 0, p5: 0 });
  });

  it("keeps the same word count when the pack is smaller than six", () => {
    const c = makeCtx({
      n: 4,
      content: { kind: "word-pairs", items: PAIRS.slice(0, 3) },
    });
    expect(setup(c).words).toHaveLength(3);
  });

  it("rotates the clue order per word and gives a previous imposter a break", () => {
    const c = makeCtx({ n: 4, seed: 7 });
    let state = setup(c);
    const snapshots: { order: PlayerId[]; imp: PlayerId }[] = [];
    for (let i = 0; i < state.words.length; i += 1) {
      snapshots.push({ order: [...state.clueOrder], imp: imposterOf(state) });
      state = onDeadline(playWord(state, c, votesNotCaught(state), null), c);
    }
    expect(isOver(state)).toBe(true);

    const playerIds: PlayerId[] = ["p1", "p2", "p3", "p4"];
    const n = playerIds.length;
    for (let i = 0; i < snapshots.length; i += 1) {
      const { order, imp } = at(snapshots, i);
      const start = i % n;
      const rotated = [...playerIds.slice(start), ...playerIds.slice(0, start)];
      // The imposter may never open the round, so they swap with the runner-up.
      const expected =
        rotated[0] === imp
          ? [at(rotated, 1), at(rotated, 0), ...rotated.slice(2)]
          : rotated;
      expect(order).toEqual(expected);
      expect(order[0]).not.toBe(imp);
    }
  });

  it("never picks the same imposter two words in a row when it can avoid it", () => {
    const c = makeCtx({ n: 4, seed: 9 });
    let state = setup(c);
    const imps: PlayerId[] = [imposterOf(state)];
    for (let i = 1; i < state.words.length; i += 1) {
      state = onDeadline(playWord(state, c, votesNotCaught(state), null), c);
      imps.push(imposterOf(state));
    }
    for (let i = 1; i < imps.length; i += 1) {
      expect(at(imps, i)).not.toBe(at(imps, i - 1));
    }
  });

  it("buildClueOrder wraps and keeps the imposter out of first place", () => {
    expect(buildClueOrder(["a", "b", "c"], "a", 0)).toEqual(["b", "a", "c"]);
    expect(buildClueOrder(["a", "b", "c"], "b", 1)).toEqual(["c", "b", "a"]);
    expect(buildClueOrder(["a", "b", "c"], "c", 2)).toEqual(["a", "c", "b"]);
  });
});

describe("happy path and scoring", () => {
  it("runs every phase and finishes after the last word", () => {
    const c = makeCtx({ n: 6, seed: 3 });
    let state = setup(c);
    const seen = new Set<string>();
    for (let i = 0; i < state.words.length; i += 1) {
      seen.add(state.phase);
      state = toVotePhase(state, c);
      seen.add("clues");
      expect(state.phase).toBe("vote");
      seen.add(state.phase);
      state = onDeadline(state, c);
      expect(state.phase).toBe("reveal");
      seen.add(state.phase);
      state = onDeadline(state, c);
      seen.add(state.phase);
      if (state.phase === "last-chance") state = onDeadline(state, c);
      expect(state.phase).toBe("result");
      seen.add(state.phase);
      state = onDeadline(state, c);
    }

    expect([...seen]).toEqual(
      expect.arrayContaining([
        "word-check",
        "clues",
        "vote",
        "reveal",
        "result",
      ]),
    );
    expect(isOver(state)).toBe(true);
    expect(state.deadline).toBeNull();
    expect(state.wordIndex).toBe(5);
  });

  it("caught + wrong guess: imposter voters get 500 each", () => {
    const c = makeCtx({ n: 4, seed: 11, content: ONE_PAIR });
    const state = setup(c);
    const imp = imposterOf(state);
    const result = playWord(state, c, votesCaught(state), "definitely wrong");

    expect(result.caught).toBe(true);
    expect(result.guessCorrect).toBe(false);
    for (const id of result.playerIds) {
      expect(result.scores[id]).toBe(id === imp ? 0 : 500);
    }
  });

  it("caught + right guess: imposter gets 1000 and voters get nothing", () => {
    const c = makeCtx({ n: 4, seed: 12, content: ONE_PAIR });
    const state = setup(c);
    const imp = imposterOf(state);
    const result = playWord(state, c, votesCaught(state), "  The APPLE! ");

    expect(result.caught).toBe(true);
    expect(result.guessCorrect).toBe(true);
    for (const id of result.playerIds) {
      expect(result.scores[id]).toBe(id === imp ? 1000 : 0);
    }
  });

  it("caught + missing guess counts as wrong", () => {
    const c = makeCtx({ n: 4, seed: 13, content: ONE_PAIR });
    const state = setup(c);
    const result = playWord(state, c, votesCaught(state), null);

    expect(result.guessCorrect).toBe(false);
    expect(result.guess).toBeNull();
  });

  it("not caught: imposter gets 1000", () => {
    const c = makeCtx({ n: 4, seed: 14, content: ONE_PAIR });
    const state = setup(c);
    const imp = imposterOf(state);
    const result = playWord(state, c, votesNotCaught(state), null);

    expect(result.caught).toBe(false);
    for (const id of result.playerIds) {
      expect(result.scores[id]).toBe(id === imp ? 1000 : 0);
    }
  });

  it("a tie at the top is not caught", () => {
    const c = makeCtx({ n: 4, seed: 15, content: ONE_PAIR });
    const state = setup(c);
    const imp = imposterOf(state);
    const result = playWord(state, c, votesTied(state), null);

    const tally = result.tally;
    const counts = Object.values(tally).map((v) => v.length);
    expect(Math.max(...counts)).toBe(2);
    expect(counts.filter((n) => n === 2)).toHaveLength(2);
    expect(result.caught).toBe(false);
    expect(result.scores[imp]).toBe(1000);
  });
});

describe("turn order and actions", () => {
  it("only the current speaker can end their turn", () => {
    const c = makeCtx({ n: 4, seed: 21 });
    const state = onDeadline(setup(c), c);
    expect(state.phase).toBe("clues");
    const speaker = requiredSpeaker(state);
    const other = otherPlayer(state.playerIds, speaker);

    expect(onAction(state, other, { type: "done" }, c)).toBe(state);
    const next = onAction(state, speaker, { type: "done" }, c);
    expect(next).not.toBe(state);
    expect(next.doneSpeakerIds).toContain(speaker);
    expect(currentSpeaker(next)).not.toBe(speaker);
  });

  it("rejects done outside the clues phase and finished games", () => {
    const c = makeCtx({ n: 4, seed: 22, content: ONE_PAIR });
    const wordCheck = setup(c);
    expect(onAction(wordCheck, "p1", { type: "done" }, c)).toBe(wordCheck);
    const result = playWord(wordCheck, c, votesNotCaught(wordCheck), null);
    const over = onDeadline(result, c);
    expect(isOver(over)).toBe(true);
    expect(onAction(over, "p1", { type: "done" }, c)).toBe(over);
  });

  it("skips disconnected speakers immediately", () => {
    const c = makeCtx({ n: 4, seed: 23 });
    const base = setup(c);
    const firstSpeaker = at(base.clueOrder, 0);
    const connected = base.playerIds.filter((id) => id !== firstSpeaker);
    const dc = withCtx(c, { connectedIds: connected });

    const clues = onDeadline(base, dc);
    expect(clues.phase).toBe("clues");
    expect(connected).toContain(currentSpeaker(clues));

    // The next speaker also dropped out: the turn skips them.
    const next = at(clues.clueOrder, clues.clueIndex + 1);
    const dc2 = withCtx(c, {
      connectedIds: connected.filter((id) => id !== next),
    });
    const after = onAction(
      clues,
      requiredSpeaker(clues),
      { type: "done" },
      dc2,
    );
    expect(currentSpeaker(after)).not.toBe(next);
  });

  it("goes straight to the vote when nobody is connected", () => {
    const c = makeCtx({ n: 4, seed: 24 });
    const dc = withCtx(c, { connectedIds: [] });
    expect(onDeadline(setup(c), dc).phase).toBe("vote");
  });

  it("closes the vote early once every connected player voted", () => {
    const c = makeCtx({ n: 4, seed: 25 });
    let state = toVotePhase(setup(c), c);
    const imp = imposterOf(state);
    const connected = crewIds(state.playerIds, imp);
    const dc = withCtx(c, { connectedIds: connected });

    for (const voter of connected) {
      expect(state.phase).toBe("vote");
      state = onAction(state, voter, { type: "vote", target: imp }, dc);
    }
    expect(state.phase).toBe("reveal");
  });

  it("ignores self votes, unknown targets, second votes and wrong-phase votes", () => {
    const c = makeCtx({ n: 4, seed: 26 });
    let state = toVotePhase(setup(c), c);
    const imp = imposterOf(state);
    const voter = otherPlayer(state.playerIds, imp);

    expect(onAction(state, voter, { type: "vote", target: voter }, c)).toBe(
      state,
    );
    expect(onAction(state, voter, { type: "vote", target: "nobody" }, c)).toBe(
      state,
    );

    state = onAction(state, voter, { type: "vote", target: imp }, c);
    expect(state.votes[voter]).toBe(imp);
    expect(onAction(state, voter, { type: "vote", target: imp }, c)).toBe(
      state,
    );

    const wordCheck = setup(c);
    expect(onAction(wordCheck, "p1", { type: "vote", target: "p2" }, c)).toBe(
      wordCheck,
    );
  });

  it("advances exactly one phase per deadline and sets the next deadline", () => {
    const c = makeCtx({ n: 4, seed: 27 });
    let state = setup(c);
    expect(state.deadline).toBe(c.now + WORD_CHECK_MS);

    const t1 = withCtx(c, { now: c.now + WORD_CHECK_MS });
    state = onDeadline(state, t1);
    expect(state.phase).toBe("clues");
    expect(state.deadline).toBeNull();

    // The clue phase has no deadline at all: a VIP skip (onDeadline) still moves the
    // speaker along, same as before, but nothing here is time-based any more.
    const t2 = withCtx(c, { now: t1.now + 1 });
    state = onDeadline(state, t2);
    expect(state.phase).toBe("clues");
    expect(state.deadline).toBeNull();
  });

  it("uses the phase deadlines for vote, reveal, last chance and result", () => {
    const c = makeCtx({ n: 4, seed: 28, content: ONE_PAIR });
    let state = setup(c);
    state = toVotePhase(state, c);
    expect(state.deadline).toBe(c.now + VOTE_MS);

    state = onDeadline(state, c);
    expect(state.phase).toBe("reveal");
    expect(state.deadline).toBe(c.now + REVEAL_MS);

    // Force a caught reveal so the last-chance phase appears.
    state = toVotePhase(
      setup(makeCtx({ n: 4, seed: 28, content: ONE_PAIR })),
      c,
    );
    for (const [voter, target] of Object.entries(votesCaught(state))) {
      state = onAction(state, voter, { type: "vote", target }, c);
    }
    expect(state.phase).toBe("reveal");
    state = onDeadline(state, c);
    expect(state.phase).toBe("last-chance");
    expect(state.deadline).toBe(c.now + LAST_CHANCE_MS);

    state = onDeadline(state, c);
    expect(state.phase).toBe("result");
    expect(state.caught).toBe(true);
    expect(state.deadline).toBe(c.now + RESULT_CAUGHT_MS);
    expect(state.deadline).toBe(c.now + resultDurationMs(true));
  });

  it("uses the escaped result duration when the imposter got away", () => {
    const c = makeCtx({ n: 4, seed: 61, content: ONE_PAIR });
    let state = toVotePhase(setup(c), c);
    for (const [voter, target] of Object.entries(votesNotCaught(state))) {
      state = onAction(state, voter, { type: "vote", target }, c);
    }
    if (state.phase === "vote") state = onDeadline(state, c); // -> reveal
    expect(state.phase).toBe("reveal");
    state = onDeadline(state, c); // reveal -> result (not caught skips last-chance)
    expect(state.phase).toBe("result");
    expect(state.caught).toBe(false);
    expect(state.deadline).toBe(c.now + RESULT_ESCAPED_MS);
    expect(state.deadline).toBe(c.now + resultDurationMs(false));
  });

  it("only the imposter can guess, and only once", () => {
    const c = makeCtx({ n: 4, seed: 29, content: ONE_PAIR });
    let state = toVotePhase(setup(c), c);
    const imp = imposterOf(state);
    for (const [voter, target] of Object.entries(votesCaught(state))) {
      state = onAction(state, voter, { type: "vote", target }, c);
    }
    if (state.phase === "reveal") state = onDeadline(state, c);
    expect(state.phase).toBe("last-chance");
    const crew = otherPlayer(state.playerIds, imp);

    expect(onAction(state, crew, { type: "guess", text: "apple" }, c)).toBe(
      state,
    );
    const guessed = onAction(state, imp, { type: "guess", text: "apple" }, c);
    expect(guessed.phase).toBe("result");
    expect(guessed.guessCorrect).toBe(true);
  });
});

describe("onPlayersChanged", () => {
  it("advances past the current speaker when they disconnect", () => {
    const c = makeCtx({ n: 4, seed: 40 });
    const clues = onDeadline(setup(c), c);
    const speaker = requiredSpeaker(clues);
    const stillConnected = clues.playerIds.filter((id) => id !== speaker);
    const dc = withCtx(c, { connectedIds: stillConnected });

    const after = onPlayersChanged(clues, dc);
    expect(after).not.toBe(clues);
    expect(after.phase).toBe("clues");
    expect(after.doneSpeakerIds).toContain(speaker);
    expect(currentSpeaker(after)).not.toBe(speaker);
    expect(stillConnected).toContain(currentSpeaker(after));
  });

  it("ends the clue phase when the last connected speaker disconnects", () => {
    const c = makeCtx({ n: 4, seed: 41 });
    const base = setup(c);
    // Only two of the four players are connected, so clues visits just them.
    const connectedTwo = base.playerIds.slice(0, 2);
    const dc = withCtx(c, { connectedIds: connectedTwo });
    let clues = onDeadline(base, dc);
    expect(clues.phase).toBe("clues");

    const first = requiredSpeaker(clues);
    clues = onAction(clues, first, { type: "done" }, dc);
    expect(clues.phase).toBe("clues");
    const last = requiredSpeaker(clues);
    expect(connectedTwo).toContain(last);

    const after = onPlayersChanged(
      clues,
      withCtx(c, { connectedIds: connectedTwo.filter((id) => id !== last) }),
    );
    expect(after.phase).toBe("vote");
  });

  it("does nothing when someone other than the current speaker disconnects or reconnects", () => {
    const c = makeCtx({ n: 4, seed: 42 });
    const clues = onDeadline(setup(c), c);
    const speaker = requiredSpeaker(clues);
    const bystander = otherPlayer(clues.playerIds, speaker);
    const dc = withCtx(c, {
      connectedIds: clues.playerIds.filter((id) => id !== bystander),
    });
    expect(onPlayersChanged(clues, dc)).toBe(clues);
  });

  it("does not rewind or double-advance when the skipped speaker reconnects", () => {
    const c = makeCtx({ n: 4, seed: 43 });
    const clues = onDeadline(setup(c), c);
    const speaker = requiredSpeaker(clues);
    const withoutSpeaker = clues.playerIds.filter((id) => id !== speaker);
    const advanced = onPlayersChanged(
      clues,
      withCtx(c, { connectedIds: withoutSpeaker }),
    );
    expect(currentSpeaker(advanced)).not.toBe(speaker);

    const reconnected = onPlayersChanged(advanced, c);
    expect(reconnected).toBe(advanced);
  });

  it("is a no-op outside the clues phase", () => {
    const c = makeCtx({ n: 4, seed: 44 });
    const wordCheck = setup(c);
    const dc = withCtx(c, { connectedIds: [] });
    expect(onPlayersChanged(wordCheck, dc)).toBe(wordCheck);
  });
});

describe("word history for awards", () => {
  it("records one entry per scored word and skips a cancelled word", () => {
    const c = makeCtx({ n: 4, seed: 71, content: ONE_PAIR });
    const state = setup(c);
    const imp = imposterOf(state);
    const result = playWord(state, c, votesCaught(state), "apple");

    expect(result.history).toHaveLength(1);
    const [entry] = result.history ?? [];
    expect(entry?.imposterId).toBe(imp);
    expect(entry?.caught).toBe(true);
    expect(entry?.guessCorrect).toBe(true);
    expect(entry?.playerIds).toEqual(result.playerIds);
    expect(entry?.votes).toEqual(votesCaught(state));
  });

  it("does not record history when the imposter is kicked mid-word", () => {
    const c = makeCtx({ n: 4, seed: 72, content: ONE_PAIR });
    const state = onDeadline(setup(c), c); // clues
    const imp = imposterOf(state);
    const after = onPlayerRemoved(state, imp, c);
    expect(after.phase).toBe("result");
    expect(after.history ?? []).toEqual([]);
  });

  it("accumulates history across every word, including the last", () => {
    const c = makeCtx({
      n: 4,
      seed: 73,
      content: { kind: "word-pairs", items: PAIRS.slice(0, 2) },
    });
    let state = setup(c);
    state = playWord(state, c, votesNotCaught(state), null);
    state = onDeadline(state, c); // -> next word-check
    expect(state.history).toHaveLength(1);
    state = playWord(state, c, votesNotCaught(state), null);
    expect(state.history).toHaveLength(2);
    expect(isOver(onDeadline(state, c))).toBe(true);
  });
});

describe("resultDurationMs", () => {
  it("maps caught, escaped and cancelled to their durations", () => {
    expect(resultDurationMs(true)).toBe(RESULT_CAUGHT_MS);
    expect(resultDurationMs(false)).toBe(RESULT_ESCAPED_MS);
    expect(resultDurationMs(null)).toBe(RESULT_CANCELLED_MS);
  });
});

/** Drives a fresh caught last-chance phase for the given ctx. */
function toLastChance(c: GameContext<WordPairContent>): ImposterState {
  let state = toVotePhase(setup(c), c);
  for (const [voter, target] of Object.entries(votesCaught(state))) {
    state = onAction(state, voter, { type: "vote", target }, c);
  }
  if (state.phase === "vote") state = onDeadline(state, c);
  if (state.phase === "reveal") state = onDeadline(state, c);
  return state;
}

describe("typing action", () => {
  it("accepts a length change and records the length and timestamp", () => {
    const c = makeCtx({ n: 4, seed: 61, content: ONE_PAIR });
    const state = toLastChance(c);
    expect(state.phase).toBe("last-chance");
    const imp = imposterOf(state);

    const next = onAction(state, imp, { type: "typing", length: 3 }, c);
    expect(next).not.toBe(state);
    expect(next.guessLength).toBe(3);
    expect(next.guessLengthAt).toBe(c.now);
  });

  it("rejects typing outside the last-chance phase", () => {
    const c = makeCtx({ n: 4, seed: 62, content: ONE_PAIR });
    const state = toVotePhase(setup(c), c);
    expect(state.phase).not.toBe("last-chance");
    expect(onAction(state, "p1", { type: "typing", length: 2 }, c)).toBe(state);
  });

  it("rejects typing from anyone but the imposter", () => {
    const c = makeCtx({ n: 4, seed: 63, content: ONE_PAIR });
    const state = toLastChance(c);
    const imp = imposterOf(state);
    const crew = otherPlayer(state.playerIds, imp);
    expect(onAction(state, crew, { type: "typing", length: 2 }, c)).toBe(state);
  });

  it("rejects typing once a guess is already in", () => {
    const c = makeCtx({ n: 4, seed: 64, content: ONE_PAIR });
    const state = toLastChance(c);
    const imp = imposterOf(state);
    const guessed = onAction(state, imp, { type: "guess", text: "apple" }, c);
    expect(guessed.phase).toBe("result");
    expect(onAction(guessed, imp, { type: "typing", length: 2 }, c)).toBe(
      guessed,
    );

    // A guess submitted mid-phase (defensive: normal play always leaves
    // last-chance the moment a guess lands) still blocks further typing.
    const stillLastChance = { ...state, guess: "apple" };
    expect(
      onAction(stillLastChance, imp, { type: "typing", length: 2 }, c),
    ).toBe(stillLastChance);
  });

  it("rejects a length unchanged from the current one", () => {
    const c = makeCtx({ n: 4, seed: 65, content: ONE_PAIR });
    const state = toLastChance(c);
    const imp = imposterOf(state);
    expect(state.guessLength ?? 0).toBe(0);
    expect(onAction(state, imp, { type: "typing", length: 0 }, c)).toBe(state);
  });

  it("treats a missing guessLength (an old snapshot) as zero", () => {
    const c = makeCtx({ n: 4, seed: 68, content: ONE_PAIR });
    const state = toLastChance(c);
    const imp = imposterOf(state);
    const legacy: ImposterState = { ...state };
    delete legacy.guessLength;
    delete legacy.guessLengthAt;

    expect(onAction(legacy, imp, { type: "typing", length: 0 }, c)).toBe(
      legacy,
    );
    const typed = onAction(legacy, imp, { type: "typing", length: 3 }, c);
    expect(typed.guessLength).toBe(3);
  });

  it("rejects an update sent before the throttle interval elapses", () => {
    const c = makeCtx({ n: 4, seed: 66, content: ONE_PAIR });
    const state = toLastChance(c);
    const imp = imposterOf(state);
    const first = onAction(state, imp, { type: "typing", length: 3 }, c);
    expect(first.guessLength).toBe(3);

    const soon = withCtx(c, {
      now: c.now + TYPING_MIN_INTERVAL_MS - 1,
    });
    expect(onAction(first, imp, { type: "typing", length: 5 }, soon)).toBe(
      first,
    );

    const later = withCtx(c, { now: c.now + TYPING_MIN_INTERVAL_MS });
    const second = onAction(first, imp, { type: "typing", length: 5 }, later);
    expect(second).not.toBe(first);
    expect(second.guessLength).toBe(5);
    expect(second.guessLengthAt).toBe(later.now);
  });

  it("rejects a length above the schema max", () => {
    expect(
      imposterActionSchema.safeParse({ type: "typing", length: 41 }).success,
    ).toBe(false);
    expect(
      imposterActionSchema.safeParse({ type: "typing", length: -1 }).success,
    ).toBe(false);
    expect(
      imposterActionSchema.safeParse({ type: "typing", length: 40 }).success,
    ).toBe(true);
    expect(
      imposterActionSchema.safeParse({ type: "typing", length: 0 }).success,
    ).toBe(true);
  });

  it("resets the guess length when the next word's last-chance starts", () => {
    const c = makeCtx({
      n: 4,
      seed: 67,
      content: { kind: "word-pairs", items: PAIRS.slice(0, 2) },
    });
    const state = toLastChance(c);
    const imp = imposterOf(state);
    const typed = onAction(state, imp, { type: "typing", length: 4 }, c);
    expect(typed.guessLength).toBe(4);

    const result = onDeadline(typed, c); // last-chance timeout -> result
    expect(result.phase).toBe("result");
    const nextWord = onDeadline(result, c); // result -> next word-check
    expect(nextWord.phase).toBe("word-check");
    expect(nextWord.guessLength).toBe(0);
    expect(nextWord.guessLengthAt).toBeNull();
  });
});

describe("view secrecy", () => {
  const c = makeCtx({ n: 4, seed: 31 });
  const state = setup(c);
  const imp = imposterOf(state);
  const { crew: crewWord, decoy } = wordAt(state, 0);

  function crewJsons(s: ImposterState): string[] {
    return crewIds(s.playerIds, imp).map((id) =>
      JSON.stringify(imposter.playerView(s, id, viewCtx(c))),
    );
  }

  it("hides the decoy word and the imposter identity during word-check", () => {
    for (const json of crewJsons(state)) {
      expect(json).not.toContain(decoy);
      expect(json).not.toContain(`"imposterId":"${imp}"`);
      expect(json).toContain(crewWord);
    }
    const impView = imposter.playerView(state, imp, viewCtx(c));
    expect(impView.role).toBe("imposter");
    expect(impView.word).toBe(decoy);
    expect(JSON.stringify(impView)).not.toContain(crewWord);
  });

  it("hides the decoy word and the imposter identity during clues", () => {
    const clues = onDeadline(state, c);
    for (const json of crewJsons(clues)) {
      expect(json).not.toContain(decoy);
      expect(json).not.toContain(`"imposterId":"${imp}"`);
    }
    for (const id of clues.playerIds) {
      expect(imposter.playerView(clues, id, viewCtx(c)).imposterId).toBeNull();
    }
    for (const id of crewIds(clues.playerIds, imp)) {
      expect(imposter.playerView(clues, id, viewCtx(c)).role).toBe("crew");
    }
  });

  it("hides the decoy word and the imposter identity during the vote", () => {
    const vote = toVotePhase(state, c);
    expect(vote.phase).toBe("vote");
    for (const json of crewJsons(vote)) {
      expect(json).not.toContain(decoy);
      expect(json).not.toContain(`"imposterId":"${imp}"`);
    }
  });

  it("keeps the host view free of secrets before the reveal", () => {
    const wordCheck = imposter.hostView(state, viewCtx(c));
    expect(wordCheck.imposterId).toBeNull();
    expect(wordCheck.decoyWord).toBeNull();
    expect(wordCheck.tally).toBeNull();
    expect(wordCheck.crewWord).toBeNull();

    const vote = toVotePhase(state, c);
    const hostVote = imposter.hostView(vote, viewCtx(c));
    expect(hostVote.imposterId).toBeNull();
    expect(hostVote.decoyWord).toBeNull();
    expect(hostVote.caught).toBeNull();
  });

  it("reveals the imposter only from the reveal on, and the crew word only in the result", () => {
    const oneCtx = makeCtx({ n: 4, seed: 31, content: ONE_PAIR });
    const start = setup(oneCtx);
    const oneImp = imposterOf(start);
    const revealed = onDeadline(toVotePhase(start, oneCtx), oneCtx);
    expect(revealed.phase).toBe("reveal");

    const hostReveal = imposter.hostView(revealed, viewCtx(oneCtx));
    expect(hostReveal.imposterId).toBe(oneImp);
    expect(hostReveal.decoyWord).toBe("apricot");
    expect(hostReveal.caught).toBe(false);
    expect(hostReveal.tally).not.toBeNull();
    expect(hostReveal.crewWord).toBeNull();

    const playerReveal = imposter.playerView(revealed, oneImp, viewCtx(oneCtx));
    expect(playerReveal.imposterId).toBe(oneImp);
    expect(playerReveal.crewWord).toBeNull();

    const result = onDeadline(revealed, oneCtx);
    expect(result.phase).toBe("result");
    const hostResult = imposter.hostView(result, viewCtx(oneCtx));
    expect(hostResult.crewWord).toBe("apple");
    expect(hostResult.pointsThisWord).not.toBeNull();
  });

  it("gives the imposter their decoy word back only during last chance", () => {
    const oneCtx = makeCtx({ n: 4, seed: 32, content: ONE_PAIR });
    let s = setup(oneCtx);
    s = toVotePhase(s, oneCtx);
    const lastChanceImposter = imposterOf(s);
    for (const [voter, target] of Object.entries(votesCaught(s))) {
      s = onAction(s, voter, { type: "vote", target }, oneCtx);
    }
    if (s.phase === "vote") s = onDeadline(s, oneCtx);
    if (s.phase === "reveal") s = onDeadline(s, oneCtx);
    expect(s.phase).toBe("last-chance");
    expect(
      imposter.playerView(s, lastChanceImposter, viewCtx(oneCtx)).decoyWord,
    ).toBe("apricot");
    expect(
      imposter.playerView(s, lastChanceImposter, viewCtx(oneCtx))
        .isMyLastChance,
    ).toBe(true);

    s = onDeadline(s, oneCtx);
    expect(s.phase).toBe("result");
    expect(
      imposter.playerView(s, lastChanceImposter, viewCtx(oneCtx)).decoyWord,
    ).toBeNull();
  });

  it("gives the host the guess LENGTH only during last chance, and never the letters", () => {
    const lcCtx = makeCtx({ n: 4, seed: 33, content: ONE_PAIR });
    const lcState = toLastChance(lcCtx);
    expect(lcState.phase).toBe("last-chance");
    const lcImp = imposterOf(lcState);
    const typed = onAction(
      lcState,
      lcImp,
      { type: "typing", length: 5 },
      lcCtx,
    );

    const hostDuring = imposter.hostView(typed, viewCtx(lcCtx));
    expect(hostDuring.guessLength).toBe(5);
    expect(hostDuring.guess).toBeNull();
    const { crew } = wordAt(typed);
    expect(JSON.stringify(hostDuring)).not.toContain(crew);

    const hostWordCheck = imposter.hostView(setup(lcCtx), viewCtx(lcCtx));
    expect(hostWordCheck.guessLength).toBeNull();

    const guessed = onAction(
      typed,
      lcImp,
      { type: "guess", text: "apple" },
      lcCtx,
    );
    expect(guessed.phase).toBe("result");
    expect(imposter.hostView(guessed, viewCtx(lcCtx)).guessLength).toBeNull();
  });
});

describe("awards wiring", () => {
  it("exposes imposterAwards as the game's awards hook", () => {
    const c = makeCtx({ n: 4, seed: 74, content: ONE_PAIR });
    const state = setup(c);
    const result = playWord(state, c, votesCaught(state), "apple");
    expect(imposter.awards?.(result)).toEqual([
      { id: "word-thief", playerIds: [imposterOf(state)], value: 1 },
    ]);
  });
});

describe("parseAction", () => {
  it("accepts the three valid shapes", () => {
    expect(
      imposterActionSchema.safeParse({ type: "done" }).data ?? null,
    ).toEqual({ type: "done" });
    expect(
      imposterActionSchema.safeParse({ type: "vote", target: "p1" }).data ??
        null,
    ).toEqual({
      type: "vote",
      target: "p1",
    });
    expect(
      imposterActionSchema.safeParse({ type: "guess", text: "  apple  " })
        .data ?? null,
    ).toEqual({
      type: "guess",
      text: "apple",
    });
  });

  it("rejects malformed payloads", () => {
    const bad: unknown[] = [
      null,
      undefined,
      42,
      "vote",
      [],
      {},
      { type: "nope" },
      { type: "vote" },
      { type: "vote", target: 5 },
      { type: "vote", target: "" },
      { type: "guess" },
      { type: "guess", text: 7 },
      { type: "guess", text: "   " },
      { type: "guess", text: "x".repeat(41) },
    ];
    for (const raw of bad)
      expect(imposterActionSchema.safeParse(raw).data ?? null).toBeNull();
    expect(
      imposterActionSchema.safeParse({ type: "guess", text: "x".repeat(40) })
        .data ?? null,
    ).not.toBeNull();
  });
});

describe("onPlayerRemoved", () => {
  it("drops a kicked crew member from the roster and the speaking order", () => {
    const c = makeCtx({ n: 4, seed: 41 });
    const clues = onDeadline(setup(c), c);
    const speaker = requiredSpeaker(clues);
    const kicked = playerExcept(clues.playerIds, [speaker, imposterOf(clues)]);

    const after = onPlayerRemoved(clues, kicked, c);
    expect(after.playerIds).not.toContain(kicked);
    expect(after.clueOrder).not.toContain(kicked);
    expect(after.scores[kicked]).toBeUndefined();
    expect(currentSpeaker(after)).toBe(speaker);
  });

  it("resumes from the next speaker when the speaker is kicked", () => {
    const c = makeCtx({ n: 4, seed: 42 });
    const clues = onDeadline(setup(c), c);
    const speaker = requiredSpeaker(clues);
    const expectedNext = at(clues.clueOrder, clues.clueIndex + 1);

    const after = onPlayerRemoved(clues, speaker, c);
    expect(after.phase).toBe("clues");
    expect(currentSpeaker(after)).toBe(expectedNext);
  });

  it("jumps to the result with no points when the imposter is kicked mid-word", () => {
    const c = makeCtx({ n: 4, seed: 43, content: ONE_PAIR });
    const state = onDeadline(setup(c), c); // clues
    const imp = imposterOf(state);
    const after = onPlayerRemoved(state, imp, c);

    expect(after.phase).toBe("result");
    expect(after.caught).toBeNull();
    expect(after.guess).toBeNull();
    expect(after.deadline).toBe(c.now + RESULT_CANCELLED_MS);
    expect(after.deadline).toBe(c.now + resultDurationMs(null));
    expect(after.playerIds).not.toContain(imp);
    for (const id of after.playerIds) expect(after.pointsThisWord[id]).toBe(0);
    expect(isOver(after)).toBe(false);
  });

  it("ends the game on the next deadline after the imposter is kicked on the last word", () => {
    const c = makeCtx({ n: 4, seed: 44, content: ONE_PAIR });
    const state = setup(c);
    const after = onPlayerRemoved(state, imposterOf(state), c);
    expect(onDeadline(after, c).finished).toBe(true);
  });

  it("removes a voted player's vote and any votes cast for them", () => {
    const c = makeCtx({ n: 4, seed: 45 });
    let state = toVotePhase(setup(c), c);
    const imp = imposterOf(state);
    const crew = crewIds(state.playerIds, imp);
    const a = at(crew, 0);
    const b = at(crew, 1);
    state = onAction(state, imp, { type: "vote", target: a }, c);
    state = onAction(state, a, { type: "vote", target: imp }, c);
    state = onAction(state, b, { type: "vote", target: imp }, c);

    const after = onPlayerRemoved(state, imp, c);
    expect(after.votes[imp]).toBeUndefined();
    for (const target of Object.values(after.votes))
      expect(target).not.toBe(imp);
    expect(after.phase).toBe("result"); // the imposter was kicked mid-word
  });

  it("ignores a removal for someone not in the game", () => {
    const c = makeCtx({ n: 4, seed: 46 });
    const state = setup(c);
    expect(onPlayerRemoved(state, "ghost", c)).toBe(state);
  });

  it("recounts the vote after a crew member is kicked", () => {
    const c = makeCtx({ n: 4, seed: 47 });
    const state = toVotePhase(setup(c), c);
    const imp = imposterOf(state);
    const crew = crewIds(state.playerIds, imp);
    const a = at(crew, 0);
    const b = at(crew, 1);
    const c3 = at(crew, 2);
    const onlyAAndC3 = withCtx(c, { connectedIds: [a, c3] });
    const voted = onAction(state, a, { type: "vote", target: imp }, onlyAAndC3);
    expect(voted.phase).toBe("vote");

    // c3 is kicked before voting; a is the only remaining connected voter.
    const closed = onPlayerRemoved(voted, c3, onlyAAndC3);
    expect(closed.phase).toBe("reveal");
    expect(closed.votes[c3]).toBeUndefined();

    // With an outstanding connected voter the vote stays open.
    const stillOpen = onPlayerRemoved(
      voted,
      c3,
      withCtx(c, { connectedIds: [b] }),
    );
    expect(stillOpen.phase).toBe("vote");
  });
});

describe("ceremony freeze", () => {
  it("keeps the tally, roster and verdict when a voter is kicked mid-reveal", () => {
    const c = makeCtx({ n: 4, seed: 51 });
    let state = toVotePhase(setup(c), c);
    for (const [voter, target] of Object.entries(votesTied(state))) {
      state = onAction(state, voter, { type: "vote", target }, c);
    }
    if (state.phase === "vote") state = onDeadline(state, c);
    expect(state.phase).toBe("reveal");
    const before = buildHostView(state);
    expect(before.tally).not.toBeNull();

    const after = onPlayerRemoved(state, at(state.playerIds, 0), c);
    const frozen = buildHostView(after);
    expect(after.phase).toBe("reveal");
    expect(frozen.tally).toEqual(before.tally);
    expect(frozen.revealPlayerIds).toEqual(before.revealPlayerIds);
    expect(after.caught).toBe(state.caught);
  });

  it("re-picks the imposter of a later word when they are kicked before it starts", () => {
    const c = makeCtx({ n: 4, seed: 52 });
    const start = setup(c);
    expect(start.words.length).toBeGreaterThan(1);
    const ghost = start.words[1]?.imposterId ?? "";
    expect(ghost).not.toBe("");

    let state = playWord(start, c, votesCaught(start), null);
    state = onPlayerRemoved(state, ghost, c);
    state = onDeadline(state, c);

    expect(state.phase).toBe("word-check");
    expect(state.wordIndex).toBe(1);
    expect(state.playerIds).not.toContain(ghost);
    expect(state.playerIds).toContain(state.words[1]?.imposterId ?? "");
    const roles = state.playerIds.map((id) => buildPlayerView(state, id).role);
    expect(roles.filter((role) => role === "imposter")).toHaveLength(1);
  });
});

describe("bot policy", () => {
  it("ends its turn while speaking", () => {
    const c = makeCtx({ n: 4, seed: 51 });
    const clues = onDeadline(setup(c), c);
    const speaker = requiredSpeaker(clues);
    const view = imposter.playerView(clues, speaker, viewCtx(c));
    expect(imposter.bot(view, makeRng(1))).toEqual({ type: "done" });
  });

  it("votes for a candidate it did not cast a vote for", () => {
    const c = makeCtx({ n: 4, seed: 52 });
    const vote = toVotePhase(setup(c), c);
    const me = at(vote.playerIds, 0);
    const view = imposter.playerView(vote, me, viewCtx(c));
    const action = imposter.bot(view, makeRng(2));
    expect(voteTargetOf(action)).toBeDefined();
    expect(view.voteCandidates).toContain(voteTargetOf(action));
  });

  it("guesses its own decoy word on its last chance", () => {
    const c = makeCtx({ n: 4, seed: 53, content: ONE_PAIR });
    let state = toVotePhase(setup(c), c);
    const imp = imposterOf(state);
    for (const [voter, target] of Object.entries(votesCaught(state))) {
      state = onAction(state, voter, { type: "vote", target }, c);
    }
    if (state.phase === "reveal") state = onDeadline(state, c);
    expect(state.phase).toBe("last-chance");

    const view = imposter.playerView(state, imp, viewCtx(c));
    expect(view.decoyWord).not.toBeNull();
    expect(imposter.bot(view, makeRng(3))).toEqual({
      type: "guess",
      text: view.decoyWord,
    });
  });

  it("waits when it has nothing to do", () => {
    const c = makeCtx({ n: 4, seed: 54 });
    const state = setup(c);
    const view = imposter.playerView(state, "p1", viewCtx(c));
    expect(imposter.bot(view, makeRng(4))).toBeNull();
  });

  it("never emits a typing action, even during its own last chance", () => {
    const c = makeCtx({ n: 4, seed: 55, content: ONE_PAIR });
    const state = toLastChance(c);
    const imp = imposterOf(state);
    const actionTypes = state.playerIds.map((id) => {
      const view = imposter.playerView(state, id, viewCtx(c));
      return { id, action: imposter.bot(view, makeRng(5)) };
    });
    for (const { action } of actionTypes) {
      expect(action?.type).not.toBe("typing");
    }
    const impAction = actionTypes.find((a) => a.id === imp)?.action;
    expect(impAction?.type).toBe("guess");
  });
});
