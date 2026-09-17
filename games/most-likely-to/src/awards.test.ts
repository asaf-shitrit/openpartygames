import { describe, expect, it } from "vitest";
import type { PlayerId } from "@opg/protocol";
import { mostLikelyToAwards } from "./awards";
import type { MltRoundRecord, MltState } from "./state";

function record(patch: Partial<MltRoundRecord> = {}): MltRoundRecord {
  return { votes: {}, matchedIds: [], ...patch };
}

function state(
  history: MltRoundRecord[],
  playerIds: PlayerId[] = ["p1", "p2", "p3", "p4"],
): MltState {
  return {
    phase: "vote",
    roundIndex: history.length,
    prompts: [],
    playerIds,
    votes: {},
    reveal: null,
    pointsThisRound: {},
    scores: {},
    finished: false,
    deadline: null,
    history,
  };
}

describe("mostLikelyToAwards", () => {
  it("returns nothing when there is no history", () => {
    expect(mostLikelyToAwards(state([]))).toEqual([]);
  });

  it("main-character goes to the player with the most votes received, threshold 3", () => {
    const history = [record({ votes: { p1: "p2", p3: "p2" } })];
    expect(mostLikelyToAwards(state(history))).not.toContainEqual(
      expect.objectContaining({ id: "main-character" }),
    );
    const atThreshold = [record({ votes: { p1: "p2", p3: "p2", p4: "p2" } })];
    expect(mostLikelyToAwards(state(atThreshold))).toContainEqual({
      id: "main-character",
      playerIds: ["p2"],
      value: 3,
    });
  });

  it("main-character ties share the award", () => {
    const history = [
      record({ votes: { p1: "p2", p3: "p2", p4: "p2" } }),
      record({ votes: { p1: "p3", p2: "p3", p4: "p3" } }),
    ];
    expect(mostLikelyToAwards(state(history))).toContainEqual({
      id: "main-character",
      playerIds: ["p2", "p3"],
      value: 3,
    });
  });

  it("crowd-reader goes to the player with the most matches, threshold 3", () => {
    const history = [
      record({ matchedIds: ["p1"] }),
      record({ matchedIds: ["p1"] }),
    ];
    expect(mostLikelyToAwards(state(history))).not.toContainEqual(
      expect.objectContaining({ id: "crowd-reader" }),
    );
    const atThreshold = [
      record({ matchedIds: ["p1"] }),
      record({ matchedIds: ["p1"] }),
      record({ matchedIds: ["p1"] }),
    ];
    expect(mostLikelyToAwards(state(atThreshold))).toContainEqual({
      id: "crowd-reader",
      playerIds: ["p1"],
      value: 3,
    });
  });

  it("owns-it goes to the player with the most self-votes, threshold 2", () => {
    const history = [record({ votes: { p1: "p1" } })];
    expect(mostLikelyToAwards(state(history))).not.toContainEqual(
      expect.objectContaining({ id: "owns-it" }),
    );
    const atThreshold = [
      record({ votes: { p1: "p1" } }),
      record({ votes: { p1: "p1" } }),
    ];
    expect(mostLikelyToAwards(state(atThreshold))).toContainEqual({
      id: "owns-it",
      playerIds: ["p1"],
      value: 2,
    });
  });

  it("wild-card goes to the most lone votes for someone else, threshold 3", () => {
    // p2 votes for p1 alone in every round; p1 has 2 self-votes below owns-it threshold.
    const history = [
      record({ votes: { p2: "p1" } }),
      record({ votes: { p2: "p1" } }),
    ];
    expect(mostLikelyToAwards(state(history))).not.toContainEqual(
      expect.objectContaining({ id: "wild-card" }),
    );
    const atThreshold = [
      record({ votes: { p2: "p1" } }),
      record({ votes: { p2: "p1" } }),
      record({ votes: { p2: "p1" } }),
    ];
    expect(mostLikelyToAwards(state(atThreshold))).toContainEqual({
      id: "wild-card",
      playerIds: ["p2"],
      value: 3,
    });
  });

  it("wild-card ignores a self-vote and a target with more than one vote", () => {
    const history = [
      record({ votes: { p1: "p1" } }),
      record({ votes: { p2: "p1", p3: "p1" } }),
    ];
    expect(mostLikelyToAwards(state(history))).not.toContainEqual(
      expect.objectContaining({ id: "wild-card" }),
    );
  });

  it("main-character ignores votes cast by a player no longer in the roster", () => {
    const history = [
      record({ votes: { ghost: "p1", p2: "p1" } }),
      record({ votes: { ghost: "p1", p3: "p1" } }),
      record({ votes: { ghost: "p1" } }),
    ];
    expect(mostLikelyToAwards(state(history))).not.toContainEqual(
      expect.objectContaining({ id: "main-character" }),
    );
  });

  it("wild-card ignores a lone vote cast by a player no longer in the roster", () => {
    const history = [
      record({ votes: { ghost: "p1" } }),
      record({ votes: { ghost: "p1" } }),
      record({ votes: { ghost: "p1" } }),
    ];
    const s = state(history, ["p1", "p2", "p3", "p4"]);
    expect(mostLikelyToAwards(s)).not.toContainEqual(
      expect.objectContaining({ id: "wild-card" }),
    );
  });

  it("excludes a kicked player from every tally even if history still mentions them", () => {
    const history = [
      record({ votes: { p1: "p2", p3: "p2", p4: "p2" } }),
    ];
    const s = state(history, ["p1", "p3", "p4"]);
    expect(mostLikelyToAwards(s)).not.toContainEqual(
      expect.objectContaining({ id: "main-character" }),
    );
  });

  it("orders awards best first and caps them at MAX_AWARDS", () => {
    const history = [
      // main-character: p1 gets 3 votes here (and more below).
      record({ votes: { p2: "p1", p3: "p1", p4: "p1" } }),
      // crowd-reader: p2 matches three separate rounds.
      record({ matchedIds: ["p2"] }),
      record({ matchedIds: ["p2"] }),
      record({ matchedIds: ["p2"] }),
      // owns-it: p3 self-votes twice.
      record({ votes: { p3: "p3" } }),
      record({ votes: { p3: "p3" } }),
      // wild-card: p4 casts a lone vote for p1 three times.
      record({ votes: { p4: "p1" } }),
      record({ votes: { p4: "p1" } }),
      record({ votes: { p4: "p1" } }),
    ];
    // All four thresholds are met; wild-card is the fourth and gets dropped.
    const ids = mostLikelyToAwards(state(history)).map((a) => a.id);
    expect(ids).toEqual(["main-character", "crowd-reader", "owns-it"]);
  });
});
