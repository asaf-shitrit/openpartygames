import { describe, expect, it } from "vitest";
import type { Award } from "@opg/protocol";
import { imposterAwardCopy } from "./award-copy";

function award(id: string, value: number): Award {
  return { id, playerIds: ["p1"], value };
}

describe("imposterAwardCopy", () => {
  it("word-thief: singular and plural", () => {
    expect(imposterAwardCopy(award("word-thief", 1))).toEqual({
      title: "Word thief",
      detail: "Stole the word 1 time",
    });
    expect(imposterAwardCopy(award("word-thief", 3))).toEqual({
      title: "Word thief",
      detail: "Stole the word 3 times",
    });
  });

  it("master-of-disguise: singular and plural", () => {
    expect(imposterAwardCopy(award("master-of-disguise", 1))).toEqual({
      title: "Master of disguise",
      detail: "Slipped away 1 time",
    });
    expect(imposterAwardCopy(award("master-of-disguise", 4))).toEqual({
      title: "Master of disguise",
      detail: "Slipped away 4 times",
    });
  });

  it("sharpest-eye", () => {
    expect(imposterAwardCopy(award("sharpest-eye", 2))).toEqual({
      title: "Sharpest eye",
      detail: "Spotted the imposter 2 times",
    });
  });

  it("trusted-crew", () => {
    expect(imposterAwardCopy(award("trusted-crew", 3))).toEqual({
      title: "Trusted crew",
      detail: "Nobody suspected them in 3 words",
    });
  });

  it("returns null for an unknown id", () => {
    expect(imposterAwardCopy(award("mystery", 1))).toBeNull();
  });
});
