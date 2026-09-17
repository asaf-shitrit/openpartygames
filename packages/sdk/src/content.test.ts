import { describe, expect, it } from "vitest";
import { mergeContent } from "./content";
import type { GameContent } from "./types";

const PAYLOADS: GameContent[] = [
  { kind: "word-pairs", items: [{ crew: "giraffe", decoy: "zebra" }] },
  { kind: "superlatives", items: [{ id: "cats", prompt: "adopt a dozen cats" }] },
  {
    kind: "facts",
    items: [
      {
        id: "crow",
        prompt: "A group of crows is called a ____.",
        answer: "murder",
        alternates: [],
        decoys: ["flock", "parade"],
        source: { title: "Crow", url: "https://example.com/crow" },
      },
    ],
  },
  { kind: "word-pairs", items: [{ crew: "otter", decoy: "seal" }] },
  { kind: "superlatives", items: [{ id: "nap", prompt: "nap through a fire alarm" }] },
];

describe("mergeContent", () => {
  it("merges word pairs in order and skips other kinds", () => {
    expect(mergeContent("word-pairs", PAYLOADS)).toEqual({
      kind: "word-pairs",
      items: [
        { crew: "giraffe", decoy: "zebra" },
        { crew: "otter", decoy: "seal" },
      ],
    });
  });

  it("merges facts and skips other kinds", () => {
    const merged = mergeContent("facts", PAYLOADS);
    expect(merged.kind).toBe("facts");
    expect(merged.items).toHaveLength(1);
  });

  it("merges superlatives in order and skips other kinds", () => {
    expect(mergeContent("superlatives", PAYLOADS)).toEqual({
      kind: "superlatives",
      items: [
        { id: "cats", prompt: "adopt a dozen cats" },
        { id: "nap", prompt: "nap through a fire alarm" },
      ],
    });
  });

  it.each(["word-pairs", "facts", "superlatives"] as const)(
    "returns an empty %s payload for no input",
    (kind) => {
      expect(mergeContent(kind, [])).toEqual({ kind, items: [] });
    },
  );
});
