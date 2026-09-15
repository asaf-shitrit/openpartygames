import { describe, expect, it } from "vitest";
import type { PlayerId } from "@opg/protocol";
import { realOrNahAwards } from "./awards";
import type { RonFactRecord, RonState } from "./types";

function record(patch: Partial<RonFactRecord> = {}): RonFactRecord {
  return {
    foundByIds: [],
    picks: {},
    lies: [],
    ...patch,
  };
}

function state(
  history: RonFactRecord[],
  playerIds: PlayerId[] = ["p1", "p2", "p3", "p4"],
): RonState {
  return {
    phase: "reveal",
    factIndex: history.length,
    facts: [],
    playerIds,
    lies: {},
    lieErrors: {},
    options: null,
    votes: {},
    reveal: null,
    pointsThisFact: {},
    scores: {},
    finished: false,
    deadline: null,
    history,
  };
}

describe("realOrNahAwards", () => {
  it("returns nothing when there is no history", () => {
    expect(realOrNahAwards(state([]))).toEqual([]);
  });

  it("best-liar sums fooled counts across every lie by the same author, threshold at 2", () => {
    const history = [
      record({
        lies: [{ optionId: "o1", authorId: "p1", fooledIds: ["p2"] }],
      }),
    ];
    expect(realOrNahAwards(state(history))).not.toContainEqual(
      expect.objectContaining({ id: "best-liar" }),
    );

    const twoLies = [
      record({
        lies: [{ optionId: "o1", authorId: "p1", fooledIds: ["p2"] }],
      }),
      record({
        lies: [{ optionId: "o1", authorId: "p1", fooledIds: ["p3"] }],
      }),
    ];
    expect(realOrNahAwards(state(twoLies))).toContainEqual({
      id: "best-liar",
      playerIds: ["p1"],
      value: 2,
    });
  });

  it("a house decoy (null authorId) never earns best-liar", () => {
    const history = [
      record({
        lies: [
          { optionId: "o1", authorId: null, fooledIds: ["p1", "p2", "p3"] },
        ],
      }),
    ];
    expect(realOrNahAwards(state(history))).toEqual([]);
  });

  it("truth-finder counts truths found, threshold at 2", () => {
    const oneFound = [record({ foundByIds: ["p1"] })];
    expect(realOrNahAwards(state(oneFound))).not.toContainEqual(
      expect.objectContaining({ id: "truth-finder" }),
    );

    const twoFound = [
      record({ foundByIds: ["p1"] }),
      record({ foundByIds: ["p1"] }),
    ];
    expect(realOrNahAwards(state(twoFound))).toContainEqual({
      id: "truth-finder",
      playerIds: ["p1"],
      value: 2,
    });
  });

  it("greatest-hit is the best single lie's fooled count, threshold at 2", () => {
    const history = [
      record({
        lies: [{ optionId: "o1", authorId: "p1", fooledIds: ["p2"] }],
      }),
      record({
        lies: [
          { optionId: "o2", authorId: "p1", fooledIds: ["p2", "p3", "p4"] },
        ],
      }),
    ];
    expect(realOrNahAwards(state(history))).toContainEqual({
      id: "greatest-hit",
      playerIds: ["p1"],
      value: 3,
    });
  });

  it("most-trusting counts picks of real lies, threshold at 3, and never a house decoy", () => {
    const trustedLie = record({
      picks: { p2: "o1", p3: "o2" },
      lies: [
        { optionId: "o1", authorId: "p1", fooledIds: ["p2"] },
        { optionId: "o2", authorId: null, fooledIds: ["p3"] },
      ],
    });
    // p2 believed a real lie twice, p3 picked a house decoy once: below threshold.
    expect(realOrNahAwards(state([trustedLie, trustedLie]))).not.toContainEqual(
      expect.objectContaining({ id: "most-trusting" }),
    );

    expect(
      realOrNahAwards(state([trustedLie, trustedLie, trustedLie])),
    ).toContainEqual({
      id: "most-trusting",
      playerIds: ["p2"],
      value: 3,
    });
  });

  it("ties share an award", () => {
    const history = [
      record({ foundByIds: ["p1", "p2"] }),
      record({ foundByIds: ["p1", "p2"] }),
    ];
    expect(realOrNahAwards(state(history))).toContainEqual({
      id: "truth-finder",
      playerIds: ["p1", "p2"],
      value: 2,
    });
  });

  it("excludes a kicked player from every tally even if history still mentions them", () => {
    const history = [
      record({
        lies: [
          { optionId: "o1", authorId: "p1", fooledIds: ["p2", "p3"] },
        ],
      }),
      record({
        lies: [
          { optionId: "o1", authorId: "p1", fooledIds: ["p2", "p3"] },
        ],
      }),
    ];
    const s = state(history, ["p2", "p3", "p4"]);
    expect(realOrNahAwards(s)).toEqual([]);
  });

  it("orders awards best first: best-liar, truth-finder, greatest-hit, most-trusting", () => {
    const history = [
      record({
        foundByIds: ["p2", "p3"],
        picks: { p2: "truth", p3: "truth", p4: "o1" },
        lies: [{ optionId: "o1", authorId: "p1", fooledIds: ["p4"] }],
      }),
      record({
        foundByIds: ["p2", "p3"],
        picks: { p2: "truth", p3: "truth", p4: "o1" },
        lies: [
          { optionId: "o1", authorId: "p1", fooledIds: ["p4"] },
        ],
      }),
      record({
        picks: { p4: "o1" },
        lies: [
          { optionId: "o1", authorId: "p1", fooledIds: ["p2", "p3", "p4"] },
        ],
      }),
    ];
    const ids = realOrNahAwards(state(history)).map((a) => a.id);
    expect(ids).toEqual([
      "best-liar",
      "truth-finder",
      "greatest-hit",
      "most-trusting",
    ]);
  });
});
