import { describe, expect, it } from "vitest";
import type { Award } from "@opg/protocol";
import { realOrNahAwardCopy } from "./award-copy";

function award(id: string, value: number): Award {
  return { id, playerIds: ["p1"], value };
}

describe("realOrNahAwardCopy", () => {
  it("best-liar", () => {
    expect(realOrNahAwardCopy(award("best-liar", 2))).toEqual({
      title: "Best liar",
      detail: "Fooled 2 people",
    });
    expect(realOrNahAwardCopy(award("best-liar", 5))).toEqual({
      title: "Best liar",
      detail: "Fooled 5 people",
    });
  });

  it("truth-finder", () => {
    expect(realOrNahAwardCopy(award("truth-finder", 2))).toEqual({
      title: "Truth finder",
      detail: "Found 2 real answers",
    });
  });

  it("greatest-hit", () => {
    expect(realOrNahAwardCopy(award("greatest-hit", 3))).toEqual({
      title: "Greatest hit",
      detail: "One lie fooled 3 people",
    });
  });

  it("most-trusting", () => {
    expect(realOrNahAwardCopy(award("most-trusting", 3))).toEqual({
      title: "Most trusting",
      detail: "Believed 3 lies",
    });
  });

  it("returns null for an unknown id", () => {
    expect(realOrNahAwardCopy(award("mystery", 1))).toBeNull();
  });
});
