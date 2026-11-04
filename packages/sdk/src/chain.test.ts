import { describe, expect, it } from "vitest";
import { chainHeldBy, chainLength, holderSeat, stepKind, transferRounds } from "./chain";

describe("chain step kinds", () => {
  it("starts with words and alternates", () => {
    expect(stepKind(0)).toBe("words");
    expect(stepKind(1)).toBe("drawing");
    expect(stepKind(2)).toBe("words");
    expect(stepKind(7)).toBe("drawing");
  });
});

describe("chain length", () => {
  it("is one link per player", () => {
    expect(chainLength(3)).toBe(3);
    expect(chainLength(8)).toBe(8);
    expect(chainLength(0)).toBe(0);
    expect(chainLength(-2)).toBe(0);
  });

  it("leaves one transfer round per player after the seed", () => {
    expect(transferRounds(1)).toBe(0);
    expect(transferRounds(5)).toBe(4);
    expect(transferRounds(0)).toBe(0);
  });
});

describe("chain hand-off", () => {
  it("moves each chain one seat per round", () => {
    expect(holderSeat(0, 0, 4)).toBe(0);
    expect(holderSeat(0, 1, 4)).toBe(1);
    expect(holderSeat(3, 1, 4)).toBe(0);
  });

  it("is its own inverse", () => {
    for (let chain = 0; chain < 8; chain += 1) {
      for (let round = 0; round < 8; round += 1) {
        expect(chainHeldBy(holderSeat(chain, round, 8), round, 8)).toBe(chain);
      }
    }
  });

  it("gives every player each chain exactly once", () => {
    for (const players of [3, 5, 8]) {
      for (let chain = 0; chain < players; chain += 1) {
        const holders = Array.from({ length: players }, (_, round) => holderSeat(chain, round, players));
        expect(new Set(holders).size).toBe(players);
      }
    }
  });

  it("wraps negative and oversized seats", () => {
    expect(holderSeat(0, 5, 4)).toBe(1);
    expect(chainHeldBy(0, 1, 4)).toBe(3);
    expect(holderSeat(2, 2, 0)).toBe(0);
    expect(chainHeldBy(2, 2, 0)).toBe(0);
  });
});
