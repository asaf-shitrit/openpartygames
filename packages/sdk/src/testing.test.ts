import { describe, expect, it } from "vitest";
import { tapGame, tapGameNoTv, TAP_POINTS, TAP_ROUNDS } from "./fixtures/tap-game";
import { createMemoryContentSource, runBotPlaythrough } from "./testing";
import type { AnyGame, FactContent, WordPairContent } from "./types";

const wordPairs: WordPairContent = {
  kind: "word-pairs",
  items: [
    { crew: "giraffe", decoy: "zebra" },
    { crew: "otter", decoy: "beaver" },
  ],
};

// A tap game whose bots never act, so the playthrough must run to the round deadlines.
const waitingTap: AnyGame = {
  ...tapGame,
  id: "tap-wait",
  name: "Waiting Tap",
  bot: () => null,
};

// A game with no bots, no deadlines and no end: the playthrough has to give up.
const stuckTap: AnyGame = {
  ...tapGame,
  id: "tap-stuck",
  name: "Stuck Tap",
  bot: () => null,
  nextDeadline: () => null,
  isOver: () => false,
};

describe("runBotPlaythrough", () => {
  it("plays the fixture to completion with 3 players", () => {
    const result = runBotPlaythrough({
      game: tapGame,
      content: wordPairs,
      players: 3,
      seed: 1,
    });
    expect(result.finished).toBe(true);
    expect(result.steps).toBeGreaterThan(0);
    expect(Object.keys(result.scores)).toHaveLength(3);
    for (const score of Object.values(result.scores)) {
      expect(score).toBe(TAP_ROUNDS * TAP_POINTS);
    }
    expect(result.winnerIds).toHaveLength(3);
    expect(result.awards).toEqual([]);
    expect(result.rejoinedPlayerId).toBeNull();
    expect(result.log.length).toBeGreaterThan(0);
  });

  it("plays the fixture to completion with 8 players", () => {
    const result = runBotPlaythrough({
      game: tapGame,
      content: wordPairs,
      players: 8,
      seed: 2,
    });
    expect(result.finished).toBe(true);
    expect(Object.keys(result.scores)).toHaveLength(8);
    for (const score of Object.values(result.scores)) {
      expect(score).toBe(TAP_ROUNDS * TAP_POINTS);
    }
    expect(result.winnerIds).toHaveLength(8);
  });

  it("disconnectRejoin keeps the seat, id and score of bot 2", () => {
    const result = runBotPlaythrough({
      game: tapGame,
      content: wordPairs,
      players: 4,
      seed: 3,
      disconnectRejoin: true,
    });
    expect(result.finished).toBe(true);
    expect(result.rejoinedPlayerId).not.toBeNull();
    expect(Object.keys(result.scores)).toHaveLength(4);
    expect(result.log.some((line) => line.includes("rejoined"))).toBe(true);
    expect(result.log.some((line) => line.includes("disconnected"))).toBe(true);
  });

  it("respects maxSteps", () => {
    const result = runBotPlaythrough({
      game: tapGame,
      content: wordPairs,
      players: 3,
      seed: 4,
      maxSteps: 2,
    });
    expect(result.steps).toBeLessThanOrEqual(2);
    expect(result.finished).toBe(false);
  });

  it("advances the clock to the deadline when no bot acts", () => {
    const result = runBotPlaythrough({
      game: waitingTap,
      content: wordPairs,
      players: 3,
      seed: 6,
    });
    expect(result.finished).toBe(true);
    expect(result.steps).toBe(TAP_ROUNDS);
  });

  it("stops when neither a bot nor a deadline can move the game", () => {
    const result = runBotPlaythrough({
      game: stuckTap,
      content: wordPairs,
      players: 3,
      seed: 7,
      maxSteps: 10,
    });
    expect(result.finished).toBe(false);
    expect(result.steps).toBeLessThanOrEqual(10);
    expect(result.log.some((line) => line.includes("stopping"))).toBe(true);
  });

  it("throws when the room cannot start the game", () => {
    expect(() =>
      runBotPlaythrough({
        game: tapGame,
        content: wordPairs,
        players: 2,
        seed: 5,
      }),
    ).toThrow(/did not request content/);
  });

  it("throws when a TV-only game is asked to start in a no-TV room", () => {
    expect(() =>
      runBotPlaythrough({
        game: tapGame,
        content: wordPairs,
        players: 3,
        seed: 8,
        sharedScreen: false,
      }),
    ).toThrow(/plays on a shared screen/);
  });

  // stage is additive on ActiveGameView; bots only ever read `view`, so a no-TV
  // room should play out exactly like a shared-screen one.
  for (const players of [3, 8]) {
    for (const sharedScreen of [true, false]) {
      it(`finishes a ${players}-player game with a disconnect and rejoin (sharedScreen=${sharedScreen})`, () => {
        const result = runBotPlaythrough({
          game: sharedScreen ? tapGame : tapGameNoTv,
          content: wordPairs,
          players,
          seed: 100 + players,
          disconnectRejoin: true,
          sharedScreen,
        });
        expect(result.finished).toBe(true);
        expect(Object.keys(result.scores)).toHaveLength(players);
        expect(result.rejoinedPlayerId).not.toBeNull();
      });
    }
  }
});

describe("createMemoryContentSource", () => {
  const facts: FactContent = {
    kind: "facts",
    items: [
      {
        id: "f1",
        prompt: "The ____ is blue.",
        answer: "sky",
        alternates: [],
        decoys: [],
        source: { title: "Example", url: "https://example.com" },
      },
    ],
  };

  const source = createMemoryContentSource([
    {
      meta: {
        id: "wp",
        name: "Word Pairs",
        kind: "word-pairs",
        rating: "family",
        language: "en",
        itemCount: wordPairs.items.length,
      },
      content: wordPairs,
    },
    {
      meta: {
        id: "fx",
        name: "Facts",
        kind: "facts",
        rating: "teen",
        language: "en",
        itemCount: facts.items.length,
      },
      content: facts,
    },
  ]);

  it("lists every pack", async () => {
    const packs = await source.listPacks();
    expect(packs.map((p) => p.id)).toEqual(["wp", "fx"]);
  });

  it("loads and merges only the requested packs of the right kind", async () => {
    const loaded = await source.loadContent("word-pairs", ["wp"]);
    expect(loaded.kind).toBe("word-pairs");
    expect(loaded.items).toHaveLength(2);

    const empty = await source.loadContent("word-pairs", ["fx"]);
    expect(empty.items).toHaveLength(0);
  });

  it("loads fact packs by kind", async () => {
    const loaded = await source.loadContent("facts", ["fx", "wp"]);
    expect(loaded.kind).toBe("facts");
    expect(loaded.items).toHaveLength(1);
  });

  it("loads superlative packs by kind", async () => {
    const superlatives = createMemoryContentSource([
      {
        meta: {
          id: "mlt",
          name: "Everyday",
          kind: "superlatives",
          rating: "family",
          language: "en",
          itemCount: 1,
        },
        content: {
          kind: "superlatives",
          items: [{ id: "cats", prompt: "adopt a dozen cats" }],
        },
      },
    ]);
    const loaded = await superlatives.loadContent("superlatives", ["mlt"]);
    expect(loaded).toEqual({
      kind: "superlatives",
      items: [{ id: "cats", prompt: "adopt a dozen cats" }],
    });
  });

  it("returns an empty kind payload when no packs match", async () => {
    const loaded = await source.loadContent("facts", []);
    expect(loaded).toEqual({ kind: "facts", items: [] });
  });
});
