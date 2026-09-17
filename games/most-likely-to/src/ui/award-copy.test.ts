import { describe, expect, it } from "vitest";
import type { Award } from "@opg/protocol";
import { mostLikelyToAwardCopy } from "./award-copy";

function award(id: string, value: number): Award {
  return { id, playerIds: ["p1"], value };
}

describe("mostLikelyToAwardCopy", () => {
  it("main-character: singular and plural", () => {
    expect(mostLikelyToAwardCopy(award("main-character", 1))).toEqual({
      title: "Main character",
      detail: "Picked by the room 1 time",
    });
    expect(mostLikelyToAwardCopy(award("main-character", 5))).toEqual({
      title: "Main character",
      detail: "Picked by the room 5 times",
    });
  });

  it("crowd-reader: singular and plural", () => {
    expect(mostLikelyToAwardCopy(award("crowd-reader", 1))).toEqual({
      title: "Crowd reader",
      detail: "Read the room 1 time",
    });
    expect(mostLikelyToAwardCopy(award("crowd-reader", 4))).toEqual({
      title: "Crowd reader",
      detail: "Read the room 4 times",
    });
  });

  it("owns-it: singular and plural", () => {
    expect(mostLikelyToAwardCopy(award("owns-it", 1))).toEqual({
      title: "Owns it",
      detail: "Voted for themselves 1 time",
    });
    expect(mostLikelyToAwardCopy(award("owns-it", 2))).toEqual({
      title: "Owns it",
      detail: "Voted for themselves 2 times",
    });
  });

  it("wild-card: singular and plural", () => {
    expect(mostLikelyToAwardCopy(award("wild-card", 1))).toEqual({
      title: "Wild card",
      detail: "Went their own way 1 time",
    });
    expect(mostLikelyToAwardCopy(award("wild-card", 3))).toEqual({
      title: "Wild card",
      detail: "Went their own way 3 times",
    });
  });

  it("returns null for an unknown id", () => {
    expect(mostLikelyToAwardCopy(award("mystery", 1))).toBeNull();
  });
});
