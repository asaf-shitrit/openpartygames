import { describe, expect, it } from "vitest";
import {
  addPoints,
  matchedVoters,
  revealOutcome,
  roundPoints,
  tallyVotes,
} from "./rules";
import { POINTS_PER_MATCH } from "./state";

const A = "a";
const B = "b";
const C = "c";
const D = "d";
const IDS = [A, B, C, D];

describe("tallyVotes", () => {
  it("groups voters under their target, voters in roster order", () => {
    expect(tallyVotes({ [D]: B, [A]: B, [C]: B }, IDS)).toEqual({
      [B]: [A, C, D],
    });
  });

  it("only lists targets with at least one vote", () => {
    expect(tallyVotes({}, IDS)).toEqual({});
  });

  it("allows self-votes", () => {
    expect(tallyVotes({ [A]: A }, IDS)).toEqual({ [A]: [A] });
  });
});

describe("revealOutcome", () => {
  it("is no-votes when nobody voted", () => {
    expect(revealOutcome({}, IDS)).toEqual({ kind: "no-votes" });
  });

  it("is split when the max is below MIN_VOTES_FOR_PICK", () => {
    expect(revealOutcome({ [A]: [B], [C]: [D] }, IDS)).toEqual({
      kind: "split",
    });
  });

  it("is picked when exactly one player has the max", () => {
    expect(revealOutcome({ [A]: [B, C], [D]: [B] }, IDS)).toEqual({
      kind: "picked",
      pickedId: A,
    });
  });

  it("is a tie when several players share the max, in roster order", () => {
    expect(revealOutcome({ [D]: [A, B], [C]: [A, D] }, IDS)).toEqual({
      kind: "tie",
      tiedIds: [C, D],
    });
  });
});

describe("topIdsOf / matchedVoters", () => {
  it("matches voters of a pick", () => {
    const outcome = revealOutcome({ [A]: [B, C] }, IDS);
    expect(matchedVoters({ [B]: A, [C]: A, [D]: B }, outcome, IDS)).toEqual([
      B,
      C,
    ]);
  });

  it("matches voters of every tied target", () => {
    const outcome = revealOutcome({ [C]: [A, B], [D]: [A, B] }, IDS);
    expect(
      matchedVoters({ [A]: C, [B]: D, [C]: A }, outcome, IDS),
    ).toEqual([A, B]);
  });

  it("matches nobody for split or no-votes", () => {
    expect(
      matchedVoters({ [A]: B }, revealOutcome({ [B]: [A] }, IDS), IDS),
    ).toEqual([]);
    expect(matchedVoters({}, revealOutcome({}, IDS), IDS)).toEqual([]);
  });
});

describe("roundPoints", () => {
  it("pays POINTS_PER_MATCH to matched ids and 0 to everyone else", () => {
    expect(roundPoints(IDS, [B, D])).toEqual({
      [A]: 0,
      [B]: POINTS_PER_MATCH,
      [C]: 0,
      [D]: POINTS_PER_MATCH,
    });
  });

  it("pays nobody when there are no matches", () => {
    expect(roundPoints(IDS, [])).toEqual({
      [A]: 0,
      [B]: 0,
      [C]: 0,
      [D]: 0,
    });
  });
});

describe("addPoints", () => {
  it("adds points onto existing scores", () => {
    expect(addPoints({ [A]: 500, [B]: 0 }, { [A]: 500, [B]: 0 })).toEqual({
      [A]: 1000,
      [B]: 0,
    });
  });

  it("accumulates across repeated calls", () => {
    const afterRound1 = addPoints({ [A]: 0, [B]: 0 }, { [A]: 500, [B]: 0 });
    const afterRound2 = addPoints(afterRound1, { [A]: 500, [B]: 500 });
    expect(afterRound2).toEqual({ [A]: 1000, [B]: 500 });
  });

  it("ignores an id not already in scores", () => {
    expect(addPoints({ [A]: 0 }, { [A]: 500, ghost: 500 })).toEqual({
      [A]: 500,
    });
  });
});
