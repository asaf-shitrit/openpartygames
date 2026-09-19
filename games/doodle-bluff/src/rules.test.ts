import { describe, expect, it } from "vitest";
import {
  addPoints,
  anonymizeAuthor,
  candidateOrder,
  canVoteOption,
  chunkFits,
  cleanTitle,
  computeReveal,
  galleryEntries,
  isDoneDrawing,
  nextValidDrawing,
  nonArtistIds,
  normalizeTitle,
  pointsFor,
  removeDrawing,
  titleEntriesOf,
  titleErrorOf,
  topUpWithHouseTitles,
  totalPoints,
  truthEntry,
  withoutKey,
} from "./rules";
import {
  emptyDoodle,
  MAX_POINTS_PER_CHUNK,
  MAX_POINTS_PER_DOODLE,
  MAX_STROKES_PER_DOODLE,
  MIN_OPTIONS,
  POINTS_PER_FOOL,
  POINTS_PER_FOUND,
  POINTS_TRUTH,
  type Doodle,
  type DoodleOption,
  type DoodleState,
  type DrawingSlot,
  type Stroke,
} from "./state";

function stroke(pointCount: number): Stroke {
  const p: number[] = [0, 0];
  for (let i = 1; i < pointCount; i += 1) p.push(1, 1);
  return { c: 0, d: 100, g: 0, p };
}

function drawing(overrides: Partial<DrawingSlot> = {}): DrawingSlot {
  return {
    artistId: "artist",
    promptId: "prompt-1",
    prompt: "a cat riding a skateboard",
    houseTitles: ["a dog on a scooter", "a squirrel driving a bus", "a hamster in a trolley", "a duck on a unicycle"],
    doodle: emptyDoodle(),
    done: false,
    ...overrides,
  };
}

function baseState(overrides: Partial<DoodleState> = {}): DoodleState {
  return {
    phase: "draw",
    playerIds: [],
    drawings: {},
    drawOrder: [],
    queueOrder: [],
    queuePos: 0,
    shownCount: 0,
    plannedRounds: 0,
    currentDrawingId: null,
    titles: {},
    titleErrors: {},
    options: null,
    votes: {},
    reveal: null,
    pointsThisRound: {},
    scores: {},
    finished: false,
    deadline: null,
    history: [],
    ...overrides,
  };
}

describe("normalizeTitle and cleanTitle", () => {
  it("lowercases, strips punctuation, drops a leading article, collapses whitespace", () => {
    expect(normalizeTitle("  The Giraffe!  ")).toBe("giraffe");
    expect(normalizeTitle("a   Cat   Riding   a Skateboard")).toBe("cat riding a skateboard");
  });

  it("cleanTitle trims and collapses inner whitespace only", () => {
    expect(cleanTitle("  a   dog  ")).toBe("a dog");
  });
});

describe("titleErrorOf", () => {
  const prompt = "a cat riding a skateboard";

  it("accepts a clean, distinct title", () => {
    expect(titleErrorOf(prompt, {}, "p1", "a dog on a scooter")).toBeNull();
  });

  it("rejects empty or over-length titles as invalid", () => {
    expect(titleErrorOf(prompt, {}, "p1", "")).toBe("invalid");
    expect(titleErrorOf(prompt, {}, "p1", "x".repeat(200))).toBe("invalid");
  });

  it("rejects a title that normalizes to the truth", () => {
    expect(titleErrorOf(prompt, {}, "p1", "A Cat Riding A Skateboard")).toBe("truth");
  });

  it("rejects a title duplicating another player's, but not the same player's own", () => {
    const existing = { p2: "a dog on a scooter" };
    expect(titleErrorOf(prompt, existing, "p1", "a dog on a scooter")).toBe("duplicate");
    expect(titleErrorOf(prompt, existing, "p2", "a dog on a scooter")).toBeNull();
  });
});

describe("chunkFits", () => {
  it("accepts a chunk within every cap", () => {
    expect(chunkFits(emptyDoodle(), [stroke(8)])).toBe(true);
  });

  it("rejects a chunk over MAX_POINTS_PER_CHUNK", () => {
    const big = stroke(MAX_POINTS_PER_CHUNK + 2);
    expect(chunkFits(emptyDoodle(), [big])).toBe(false);
  });

  it("rejects a chunk that would push stroke count past MAX_STROKES_PER_DOODLE", () => {
    const existing: Doodle = { v: 1, s: Array.from({ length: MAX_STROKES_PER_DOODLE }, () => stroke(2)) };
    expect(chunkFits(existing, [stroke(2)])).toBe(false);
  });

  it("rejects a chunk that would push point count past MAX_POINTS_PER_DOODLE", () => {
    const existing: Doodle = { v: 1, s: [stroke(MAX_POINTS_PER_DOODLE)] };
    expect(chunkFits(existing, [stroke(2)])).toBe(false);
  });

  it("totalPoints sums point counts across strokes", () => {
    expect(totalPoints([stroke(4), stroke(6)])).toBe(10);
  });
});

describe("candidateOrder and nextValidDrawing", () => {
  it("orders every player's first drawing before anyone's second", () => {
    expect(candidateOrder(["a", "b", "c"])).toEqual(["a:0", "b:0", "c:0", "a:1", "b:1", "c:1"]);
  });

  function stateWithDrawings(drawings: Record<string, DrawingSlot | undefined>, queueOrder: string[]): DoodleState {
    return baseState({
      drawings: Object.fromEntries(
        Object.entries(drawings).filter((entry): entry is [string, DrawingSlot] => entry[1] !== undefined),
      ),
      queueOrder,
    });
  }

  it("skips a blank slot and a missing (kicked) one, filling in from later candidates", () => {
    const state = stateWithDrawings(
      {
        "a:0": drawing({ doodle: emptyDoodle() }), // blank
        "b:0": undefined, // kicked
        "c:0": drawing({ doodle: { v: 1, s: [stroke(2)] } }),
      },
      ["a:0", "b:0", "c:0"],
    );
    expect(nextValidDrawing(state)).toEqual({ drawingId: "c:0", queuePos: 3 });
  });

  it("returns null once the queue is exhausted", () => {
    const state = stateWithDrawings({ "a:0": drawing({ doodle: emptyDoodle() }) }, ["a:0"]);
    expect(nextValidDrawing(state)).toBeNull();
  });
});

describe("removeDrawing, anonymizeAuthor, withoutKey", () => {
  it("removeDrawing drops a drawing that is not the one on stage", () => {
    const state = baseState({
      drawings: { "a:0": drawing(), "a:1": drawing() },
      drawOrder: ["a:0", "a:1"],
      currentDrawingId: "a:1",
    });
    const next = removeDrawing(state, "a:0");
    expect(next.drawings["a:0"]).toBeUndefined();
    expect(next.drawOrder).toEqual(["a:1"]);
    // The on-stage drawing is frozen.
    const frozen = removeDrawing(state, "a:1");
    expect(frozen).toBe(state);
  });

  it("anonymizeAuthor nulls only the matching author, leaving the option pickable", () => {
    const options: DoodleOption[] = [
      { id: "o1", text: "truth", authorId: null, isTruth: true },
      { id: "o2", text: "lie", authorId: "p1", isTruth: false },
    ];
    const next = anonymizeAuthor(options, "p1");
    expect(next?.find((o) => o.id === "o2")?.authorId).toBeNull();
    expect(next?.find((o) => o.id === "o1")?.authorId).toBeNull();
    expect(anonymizeAuthor(null, "p1")).toBeNull();
  });

  it("withoutKey drops exactly one key", () => {
    expect(withoutKey({ a: 1, b: 2 }, "a")).toEqual({ b: 2 });
  });
});

describe("nonArtistIds, canVoteOption, isDoneDrawing", () => {
  it("nonArtistIds excludes the artist only", () => {
    const state = baseState({ playerIds: ["p1", "p2", "p3"] });
    expect(nonArtistIds(state, "p2")).toEqual(["p1", "p3"]);
  });

  it("canVoteOption is false only when every option is the player's own", () => {
    const options: DoodleOption[] = [{ id: "o1", text: "x", authorId: "p1", isTruth: false }];
    expect(canVoteOption(options, "p1")).toBe(false);
    expect(canVoteOption(options, "p2")).toBe(true);
    expect(canVoteOption(null, "p1")).toBe(false);
  });

  it("isDoneDrawing requires both slots done", () => {
    const state = baseState({
      playerIds: ["p1"],
      drawings: { "p1:0": drawing({ done: true }), "p1:1": drawing({ done: false }) },
    });
    expect(isDoneDrawing(state, "p1")).toBe(false);
    state.drawings["p1:1"] = drawing({ done: true });
    expect(isDoneDrawing(state, "p1")).toBe(true);
  });

  it("isDoneDrawing is false when a slot has no drawing at all", () => {
    const state = baseState({ playerIds: ["p1"] });
    expect(isDoneDrawing(state, "p1")).toBe(false);
  });
});

describe("ballot building", () => {
  const artistDrawing = drawing({ artistId: "artist" });

  it("truthEntry and titleEntriesOf skip the artist", () => {
    expect(truthEntry(artistDrawing)).toEqual({ text: artistDrawing.prompt, authorId: null, isTruth: true });
    const state = baseState({
      playerIds: ["artist", "p1", "p2"],
      titles: { p1: "a dog", artist: "should never appear" },
    });
    expect(titleEntriesOf(state, "artist")).toEqual([{ text: "a dog", authorId: "p1", isTruth: false }]);
  });

  it("tops up to MIN_OPTIONS with house titles, skipping a collision", () => {
    const entries = [truthEntry(artistDrawing)];
    const topped = topUpWithHouseTitles(entries, artistDrawing.houseTitles);
    expect(topped.length).toBe(MIN_OPTIONS);
    expect(topped.filter((e) => e.isHouse).length).toBe(MIN_OPTIONS - 1);
  });

  it("skips a house title that collides (normalized) with an existing option", () => {
    const entries = [truthEntry(artistDrawing), { text: "A Dog On A Scooter", authorId: "p1", isTruth: false }];
    const topped = topUpWithHouseTitles(entries, artistDrawing.houseTitles);
    // 4 house titles offered, one collides, so exactly 2 house titles are added to reach MIN_OPTIONS.
    expect(topped.length).toBe(MIN_OPTIONS);
    expect(topped.filter((e) => e.isHouse).length).toBe(2);
  });

  it("3 players, both titlers submitted: 2 player titles + 1 house title", () => {
    const entries = [truthEntry(artistDrawing), { text: "t1", authorId: "p1", isTruth: false }, { text: "t2", authorId: "p2", isTruth: false }];
    const topped = topUpWithHouseTitles(entries, artistDrawing.houseTitles);
    expect(topped.length).toBe(4);
    expect(topped.filter((e) => e.isHouse).length).toBe(1);
  });

  it("3 players, one submitted: 1 player title + 2 house titles", () => {
    const entries = [truthEntry(artistDrawing), { text: "t1", authorId: "p1", isTruth: false }];
    const topped = topUpWithHouseTitles(entries, artistDrawing.houseTitles);
    expect(topped.length).toBe(4);
    expect(topped.filter((e) => e.isHouse).length).toBe(2);
  });

  it("3 players, neither submitted: 3 house titles", () => {
    const entries = [truthEntry(artistDrawing)];
    const topped = topUpWithHouseTitles(entries, artistDrawing.houseTitles);
    expect(topped.length).toBe(4);
    expect(topped.filter((e) => e.isHouse).length).toBe(3);
  });
});

describe("computeReveal and pointsFor", () => {
  const options: DoodleOption[] = [
    { id: "o1", text: "a cat riding a skateboard", authorId: null, isTruth: true },
    { id: "o2", text: "a dog", authorId: "forger", isTruth: false },
    { id: "o3", text: "a duck", authorId: null, isTruth: false, isHouse: true },
  ];

  it("pays the voter 1000 and the artist 500 per finder", () => {
    const votes = { voter1: "o1", voter2: "o2" };
    const reveal = computeReveal({
      drawing: drawing({ artistId: "artist" }),
      drawingId: "artist:0",
      options,
      votes,
      playerIds: ["artist", "voter1", "voter2", "forger"],
    });
    expect(reveal.foundByIds).toEqual(["voter1"]);
    expect(reveal.artistPoints).toBe(POINTS_PER_FOUND);
    const points = pointsFor(reveal, ["artist", "voter1", "voter2", "forger"]);
    expect(points.voter1).toBe(POINTS_TRUTH);
    expect(points.artist).toBe(POINTS_PER_FOUND);
    expect(points.forger).toBe(POINTS_PER_FOOL);
  });

  it("pays the artist nothing when nobody finds the truth — not a penalty, just 0", () => {
    const votes = { voter1: "o2", voter2: "o3" };
    const reveal = computeReveal({
      drawing: drawing({ artistId: "artist" }),
      drawingId: "artist:0",
      options,
      votes,
      playerIds: ["artist", "voter1", "voter2", "forger"],
    });
    expect(reveal.foundByIds).toEqual([]);
    expect(reveal.artistPoints).toBe(0);
    const points = pointsFor(reveal, ["artist", "voter1", "voter2", "forger"]);
    expect(points.artist).toBe(0);
    expect(points.forger).toBe(POINTS_PER_FOOL);
  });

  it("a house title pays nobody, even when it fools someone", () => {
    const votes = { voter1: "o3" };
    const reveal = computeReveal({
      drawing: drawing({ artistId: "artist" }),
      drawingId: "artist:0",
      options,
      votes,
      playerIds: ["artist", "voter1", "forger"],
    });
    const houseTitle = reveal.titles.find((t) => t.optionId === "o3");
    expect(houseTitle?.authorId).toBeNull();
    expect(houseTitle?.fooledIds).toEqual(["voter1"]);
    const points = pointsFor(reveal, ["artist", "voter1", "forger"]);
    expect(points.artist).toBe(0);
    expect(points.voter1).toBe(0);
  });

  it("a fake title with nobody fooled is not told in the reveal story", () => {
    const votes = {};
    const reveal = computeReveal({
      drawing: drawing({ artistId: "artist" }),
      drawingId: "artist:0",
      options,
      votes,
      playerIds: ["artist", "forger"],
    });
    expect(reveal.titles.some((t) => t.optionId === "o3")).toBe(false);
    // The authored one is always told, even with zero fools, so its author's 0 is legible.
    expect(reveal.titles.some((t) => t.optionId === "o2")).toBe(true);
  });

  it("pointsFor never adds a credit for an id that has no score entry (already-kicked player)", () => {
    const reveal = {
      artistId: "ghost-artist",
      drawingId: "d",
      doodle: emptyDoodle(),
      truthOptionId: "o1",
      prompt: "x",
      foundByIds: ["ghost-voter"],
      titles: [{ optionId: "o2", text: "lie", authorId: "ghost-author", fooledIds: [], points: 500 }],
      artistPoints: 500,
    };
    expect(pointsFor(reveal, ["real1"])).toEqual({ real1: 0 });
  });
});

describe("addPoints", () => {
  it("adds gained points, ignoring an id not already in scores", () => {
    expect(addPoints({ p1: 100 }, { p1: 50, ghost: 999 })).toEqual({ p1: 150 });
  });
});

describe("galleryEntries", () => {
  it("marks a shown drawing with its found count and a never-shown one as unshown", () => {
    const state = baseState({
      phase: "gallery",
      playerIds: ["p1"],
      drawings: { "p1:0": drawing(), "p1:1": drawing() },
      drawOrder: ["p1:0", "p1:1"],
      shownCount: 1,
      plannedRounds: 1,
      finished: true,
      history: [{ drawingId: "p1:0", artistId: "p1", foundByIds: ["p1"], titles: [] }],
    });
    const entries = galleryEntries(state);
    expect(entries.find((e) => e.drawingId === "p1:0")).toMatchObject({ shown: true, foundByCount: 1 });
    expect(entries.find((e) => e.drawingId === "p1:1")).toMatchObject({ shown: false, foundByCount: null });
  });
});
