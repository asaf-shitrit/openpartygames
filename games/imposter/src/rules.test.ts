import { describe, expect, it } from "vitest";
import { isCaught, revealOutcome, tallyVotes, topVoted } from "./rules";

const A = "a";
const B = "b";
const C = "c";
const IDS = [A, B, C];

describe("tallyVotes", () => {
  it("groups voters under their target", () => {
    expect(tallyVotes({ [A]: B, [C]: B })).toEqual({ [B]: [A, C] });
  });
});

describe("topVoted", () => {
  it("returns nobody for an empty tally", () => {
    expect(topVoted({}, IDS)).toEqual([]);
  });

  it("ignores players with no votes", () => {
    expect(topVoted({ [B]: [A] }, IDS)).toEqual([B]);
  });

  it("returns the single highest scorer", () => {
    expect(topVoted({ [A]: [B], [C]: [A, B] }, IDS)).toEqual([C]);
  });

  it("returns every tied leader in playerIds order", () => {
    expect(topVoted({ [C]: [A], [A]: [B] }, IDS)).toEqual([A, C]);
  });
});

describe("isCaught", () => {
  it("is true only when the imposter is the unique top vote-getter", () => {
    expect(isCaught({ [B]: [A, C] }, B, IDS)).toBe(true);
    expect(isCaught({ [A]: [B, C] }, B, IDS)).toBe(false);
    expect(isCaught({ [A]: [B], [B]: [C] }, B, IDS)).toBe(false);
    expect(isCaught({}, B, IDS)).toBe(false);
  });
});

describe("revealOutcome", () => {
  it("is caught when the imposter is the unique top vote-getter", () => {
    expect(revealOutcome({ [B]: [A, C] }, B, IDS)).toEqual({ kind: "caught" });
  });

  it("names the accused when someone else takes the most votes", () => {
    expect(revealOutcome({ [A]: [B, C] }, B, IDS)).toEqual({
      kind: "wrong",
      accusedId: A,
    });
  });

  it("is a tie when the top vote is shared", () => {
    expect(revealOutcome({ [A]: [B], [B]: [C] }, C, IDS)).toEqual({
      kind: "tie",
      tiedIds: [A, B],
    });
  });

  it("is never caught when the imposter is part of a tie", () => {
    const outcome = revealOutcome({ [A]: [B], [C]: [A] }, C, IDS);
    expect(outcome).toEqual({ kind: "tie", tiedIds: [A, C] });
    expect(outcome.kind).not.toBe("caught");
  });

  it("is no-votes when nobody got a vote", () => {
    expect(revealOutcome({}, C, IDS)).toEqual({ kind: "no-votes" });
  });
});
