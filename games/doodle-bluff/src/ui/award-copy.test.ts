import { describe, expect, it } from "vitest";
import type { Award } from "@opg/protocol";
import { doodleBluffAwardCopy } from "./award-copy";

function award(id: string, value: number): Award {
  return { id, playerIds: ["p1"], value };
}

describe("doodleBluffAwardCopy", () => {
  it("pen-of-the-people: singular and plural", () => {
    expect(doodleBluffAwardCopy(award("pen-of-the-people", 1))).toEqual({
      title: "Pen of the people",
      detail: "1 person found your real titles",
    });
    expect(doodleBluffAwardCopy(award("pen-of-the-people", 4))).toEqual({
      title: "Pen of the people",
      detail: "4 people found your real titles",
    });
  });

  it("master-forger: singular and plural", () => {
    expect(doodleBluffAwardCopy(award("master-forger", 1))).toEqual({
      title: "Master forger",
      detail: "Fooled 1 person with fake titles",
    });
    expect(doodleBluffAwardCopy(award("master-forger", 3))).toEqual({
      title: "Master forger",
      detail: "Fooled 3 people with fake titles",
    });
  });

  it("sharp-eye: singular and plural", () => {
    expect(doodleBluffAwardCopy(award("sharp-eye", 1))).toEqual({
      title: "Sharp eye",
      detail: "Found the real title 1 time",
    });
    expect(doodleBluffAwardCopy(award("sharp-eye", 5))).toEqual({
      title: "Sharp eye",
      detail: "Found the real title 5 times",
    });
  });

  it("abstract-artist: singular and plural", () => {
    expect(doodleBluffAwardCopy(award("abstract-artist", 1))).toEqual({
      title: "Abstract artist",
      detail: "Fooled 1 person — nobody found the truth",
    });
    expect(doodleBluffAwardCopy(award("abstract-artist", 2))).toEqual({
      title: "Abstract artist",
      detail: "Fooled 2 people — nobody found the truth",
    });
  });

  it("returns null for an unknown id", () => {
    expect(doodleBluffAwardCopy(award("mystery", 1))).toBeNull();
  });
});
