import { describe, expect, it } from "vitest";
import type { DrawingPromptContent, GameContext } from "@opg/sdk";
import type { PlayerId } from "@opg/protocol";
import { createRng, emptyDoodle } from "@opg/sdk";
import {
  addPoints,
  canWork,
  chainLinks,
  chainOwner,
  chunkFits,
  cleanWords,
  currentChain,
  doneIds,
  favouriteOf,
  hasContent,
  inputOf,
  myLinkOf,
  onlyAbsentLeft,
  pointsOnChain,
  revealedLinks,
  roundComplete,
  votersWithout,
  votableLinks,
  votesOn,
  wordsAcceptable,
} from "./rules";
import type { ChainLink, SketchState } from "./state";
import { linkIdOf, TEXT_MAX_LENGTH } from "./state";
import { setup } from "./index";

const CONTENT: DrawingPromptContent = { kind: "drawing-prompts", items: [] };

function makeCtx(n: number): GameContext<DrawingPromptContent> {
  const players = Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `P${i + 1}`, avatar: null }));
  return { players, connectedIds: players.map((p) => p.id), rng: createRng(7), now: 1000, content: CONTENT };
}

function wordsLink(text: string, authorId: PlayerId = "p1"): ChainLink {
  return {
    id: linkIdOf(0, 0),
    chain: 0,
    step: 0,
    kind: "words",
    authorId,
    text,
    doodle: emptyDoodle(),
    done: true,
  };
}

function drawingLink(): ChainLink {
  return {
    id: linkIdOf(0, 1),
    chain: 0,
    step: 1,
    kind: "drawing",
    authorId: "p2",
    text: "",
    doodle: { v: 1, s: [{ c: 0, d: 10, g: 0, p: [0, 0, 10, 10] }] },
    done: true,
  };
}

function withLinks(state: SketchState, links: ChainLink[]): SketchState {
  return { ...state, links: Object.fromEntries(links.map((link) => [link.id, link])) };
}

describe("words", () => {
  it("trims and collapses spaces", () => {
    expect(cleanWords("  a   cat \n in a hat ")).toBe("a cat in a hat");
  });

  it("accepts one character and the cap, and nothing else", () => {
    expect(wordsAcceptable("a")).toBe(true);
    expect(wordsAcceptable("x".repeat(TEXT_MAX_LENGTH))).toBe(true);
    expect(wordsAcceptable("x".repeat(TEXT_MAX_LENGTH + 1))).toBe(false);
    expect(wordsAcceptable(cleanWords("   "))).toBe(false);
  });
});

describe("links", () => {
  it("needs both a hand-in and something in it", () => {
    expect(hasContent(wordsLink("a cat"))).toBe(true);
    expect(hasContent(wordsLink(""))).toBe(false);
    expect(hasContent({ ...wordsLink("a cat"), done: false })).toBe(false);
    expect(hasContent(undefined)).toBe(false);
  });

  it("gives every player one link per round, and nobody else's", () => {
    const state = setup(makeCtx(4));
    for (const id of state.playerIds) {
      const link = myLinkOf(state, id);
      expect(link?.authorId).toBe(id);
      expect(myLinkOf(state, id)?.step).toBe(0);
    }
    expect(Object.keys(state.links)).toHaveLength(16);
  });

  it("hands a drawing its words and words their drawing", () => {
    const state = withLinks(setup(makeCtx(3)), [wordsLink("a cat"), drawingLink()]);
    const drawing = state.links[linkIdOf(0, 1)];
    const words = state.links[linkIdOf(0, 0)];
    if (!drawing || !words) throw new Error("fixture missing");
    expect(inputOf(state, drawing)?.id).toBe(words.id);
    expect(inputOf(state, words)).toBeNull();
  });

  it("falls back over a hole a kick left, rather than stalling the chain", () => {
    const state = withLinks(setup(makeCtx(3)), [wordsLink("a cat")]);
    // c0s1 was never filled: the round-2 words link still gets the seed to work from.
    const later = { ...wordsLink("described"), chain: 0, step: 2, id: linkIdOf(0, 2), authorId: "p3" };
    const withLater = withLinks(state, [wordsLink("a cat"), later]);
    expect(inputOf(withLater, later)?.text).toBe("a cat");
  });

  it("knows who can still work this round", () => {
    const state = setup(makeCtx(3));
    expect(canWork(state, "p1")).toBe(true);
    expect(doneIds(state)).toEqual([]);
    expect(roundComplete(state)).toBe(false);
    const one = { ...state, doneIds: { p1: true } };
    expect(doneIds(one)).toEqual(["p1"]);
    expect(onlyAbsentLeft(one, ["p2", "p3"])).toBe(false);
    expect(onlyAbsentLeft(one, ["p2", "p3", "p1"])).toBe(false);
    const allButP3 = { ...state, doneIds: { p1: true, p2: true } };
    expect(onlyAbsentLeft(allButP3, ["p1", "p2"])).toBe(true);
    expect(roundComplete(allButP3)).toBe(false);
  });

  it("drops empty links from a chain and keeps the order", () => {
    const state = withLinks(setup(makeCtx(3)), [wordsLink("a cat"), drawingLink()]);
    expect(chainLinks(state, 0).map((link) => link.step)).toEqual([0, 1]);
    expect(chainOwner(state, 0)).toBe("p1");
    expect(chainOwner(state, 1)).toBeNull();
  });

  it("reveals only what the replay has reached", () => {
    const state = withLinks(setup(makeCtx(3)), [wordsLink("a cat"), drawingLink()]);
    const replayed: SketchState = { ...state, phase: "replay", replayOrder: [0, 1, 2], replayPos: 0, revealed: 1 };
    expect(revealedLinks(replayed).map((link) => link.id)).toEqual([linkIdOf(0, 0)]);
    expect(currentChain(replayed)).toBe(0);
  });
});

describe("votes and points", () => {
  const state = withLinks(setup(makeCtx(3)), [wordsLink("a cat"), drawingLink()]);

  it("lets everyone vote for anything but their own link", () => {
    const voting: SketchState = { ...state, phase: "vote", replayOrder: [0, 1, 2], replayPos: 0 };
    expect(votableLinks(voting, "p1").map((link) => link.kind)).toEqual(["drawing"]);
    expect(votableLinks(voting, "p2").map((link) => link.kind)).toEqual(["words"]);
  });

  it("counts only voters still in the room", () => {
    const counted: SketchState = {
      ...state,
      voters: { [linkIdOf(0, 0)]: ["p2", "p3", "gone"] },
    };
    expect(votesOn(counted, linkIdOf(0, 0))).toBe(2);
  });

  it("picks the most-voted link, earliest on a tie, and nobody on no votes", () => {
    const votes: SketchState = {
      ...state,
      voters: { [linkIdOf(0, 1)]: ["p1", "p2"] },
    };
    expect(favouriteOf(votes, 0)).toBe(linkIdOf(0, 1));
    const tie: SketchState = {
      ...state,
      voters: { [linkIdOf(0, 0)]: ["p2"], [linkIdOf(0, 1)]: ["p1"] },
    };
    expect(favouriteOf(tie, 0)).toBe(linkIdOf(0, 0));
    expect(favouriteOf(state, 0)).toBeNull();
  });

  it("pays every vote to the link's author", () => {
    const paid: SketchState = {
      ...state,
      voters: { [linkIdOf(0, 0)]: ["p2", "p3"], [linkIdOf(0, 1)]: ["p1"] },
    };
    expect(pointsOnChain(paid, 0, 100)).toEqual({ p1: 200, p2: 100, p3: 0 });
    expect(addPoints({ p1: 50, p2: 0, p3: 0 }, { p1: 200, p2: 100, gone: 9 })).toEqual({ p1: 250, p2: 100, p3: 0 });
  });

  it("forgets a removed player's votes everywhere", () => {
    const voted: SketchState = {
      ...state,
      voters: { [linkIdOf(0, 0)]: ["p2", "p3"], [linkIdOf(0, 1)]: ["p2"] },
    };
    expect(votersWithout(voted, "p2")).toEqual({ [linkIdOf(0, 0)]: ["p3"] });
  });
});

describe("chunk bounds", () => {
  it("counts strokes and points against every cap", () => {
    const stroke = { c: 0, d: 10, g: 0, p: [0, 0, 5, 5] };
    expect(chunkFits(emptyDoodle(), [stroke])).toBe(true);
    expect(chunkFits(emptyDoodle(), Array.from({ length: 65 }, () => stroke))).toBe(false);
    expect(chunkFits(emptyDoodle(), Array.from({ length: 201 }, () => stroke))).toBe(false);
  });
});
