import { describe, expect, it } from "vitest";
import { dedupeContent, mergeContent } from "./content";
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
  {
    kind: "drawing-prompts",
    items: [
      {
        id: "cat-riding-a-skateboard",
        prompt: "a cat riding a skateboard",
        houseTitles: ["a dog on a scooter", "a squirrel driving a bus"],
      },
    ],
  },
  {
    kind: "drawing-prompts",
    items: [
      {
        id: "a-bear-in-a-bathtub",
        prompt: "a bear in a bathtub",
        houseTitles: ["a moose in a hammock", "a goat on a trampoline"],
      },
    ],
  },
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

  it("merges drawing prompts in order and skips other kinds", () => {
    expect(mergeContent("drawing-prompts", PAYLOADS)).toEqual({
      kind: "drawing-prompts",
      items: [
        {
          id: "cat-riding-a-skateboard",
          prompt: "a cat riding a skateboard",
          houseTitles: ["a dog on a scooter", "a squirrel driving a bus"],
        },
        {
          id: "a-bear-in-a-bathtub",
          prompt: "a bear in a bathtub",
          houseTitles: ["a moose in a hammock", "a goat on a trampoline"],
        },
      ],
    });
  });

  it.each(["word-pairs", "facts", "superlatives", "drawing-prompts"] as const)(
    "returns an empty %s payload for no input",
    (kind) => {
      expect(mergeContent(kind, [])).toEqual({ kind, items: [] });
    },
  );

  it("dedupes word pairs sharing a crew word, keeping the first pack's decoy", () => {
    const packA: GameContent = {
      kind: "word-pairs",
      items: [{ crew: "giraffe", decoy: "zebra" }],
    };
    const packB: GameContent = {
      kind: "word-pairs",
      items: [
        { crew: "giraffe", decoy: "camel" },
        { crew: "otter", decoy: "seal" },
      ],
    };

    expect(mergeContent("word-pairs", [packA, packB])).toEqual({
      kind: "word-pairs",
      items: [
        { crew: "giraffe", decoy: "zebra" },
        { crew: "otter", decoy: "seal" },
      ],
    });
  });

  it("dedupes facts sharing a prompt, up to normalization", () => {
    const fact = {
      id: "crow",
      prompt: "A group of crows is called a ____.",
      answer: "murder",
      alternates: [],
      decoys: ["flock", "parade"],
      source: { title: "Crow", url: "https://example.com/crow" },
    };
    const duplicate = { ...fact, id: "crow-again", prompt: "  a group of crows is called a ____!  " };
    const owl = {
      id: "owl",
      prompt: "A group of owls is called a ____.",
      answer: "parliament",
      alternates: [],
      decoys: ["flock", "murder"],
      source: { title: "Owl", url: "https://example.com/owl" },
    };
    const packA: GameContent = { kind: "facts", items: [fact] };
    const packB: GameContent = { kind: "facts", items: [duplicate, owl] };

    expect(mergeContent("facts", [packA, packB])).toEqual({
      kind: "facts",
      items: [fact, owl],
    });
  });

  it("dedupes superlatives sharing a prompt, keeping the first pack's id", () => {
    const packA: GameContent = {
      kind: "superlatives",
      items: [{ id: "cats", prompt: "adopt a dozen cats" }],
    };
    const packB: GameContent = {
      kind: "superlatives",
      items: [
        { id: "cats-2", prompt: "adopt a dozen cats" },
        { id: "nap", prompt: "nap through a fire alarm" },
      ],
    };

    expect(mergeContent("superlatives", [packA, packB])).toEqual({
      kind: "superlatives",
      items: [
        { id: "cats", prompt: "adopt a dozen cats" },
        { id: "nap", prompt: "nap through a fire alarm" },
      ],
    });
  });

  it("dedupes drawing prompts sharing a prompt, up to normalization", () => {
    const catSkateboard = {
      id: "cat-riding-a-skateboard",
      prompt: "a cat riding a skateboard",
      houseTitles: ["a dog on a scooter", "a squirrel driving a bus"],
    };
    const duplicate = {
      ...catSkateboard,
      id: "cat-on-a-skateboard-again",
      prompt: "  A cat riding a skateboard!  ",
      houseTitles: ["a moose in a hammock", "a goat on a trampoline"],
    };
    const bearBathtub = {
      id: "a-bear-in-a-bathtub",
      prompt: "a bear in a bathtub",
      houseTitles: ["a moose in a hammock", "a goat on a trampoline"],
    };
    const packA: GameContent = { kind: "drawing-prompts", items: [catSkateboard] };
    const packB: GameContent = {
      kind: "drawing-prompts",
      items: [duplicate, bearBathtub],
    };

    expect(mergeContent("drawing-prompts", [packA, packB])).toEqual({
      kind: "drawing-prompts",
      items: [catSkateboard, bearBathtub],
    });
  });

  it("does not dedupe drawing prompts that only share a house title", () => {
    const catSkateboard = {
      id: "cat-riding-a-skateboard",
      prompt: "a cat riding a skateboard",
      houseTitles: ["a moose in a hammock", "a goat on a trampoline"],
    };
    const bearBathtub = {
      id: "a-bear-in-a-bathtub",
      prompt: "a bear in a bathtub",
      houseTitles: ["a moose in a hammock", "a goat on a trampoline"],
    };
    const packA: GameContent = { kind: "drawing-prompts", items: [catSkateboard] };
    const packB: GameContent = { kind: "drawing-prompts", items: [bearBathtub] };

    expect(mergeContent("drawing-prompts", [packA, packB])).toEqual({
      kind: "drawing-prompts",
      items: [catSkateboard, bearBathtub],
    });
  });

  it("merging a pack with itself yields itself", () => {
    const pack: GameContent = {
      kind: "word-pairs",
      items: [
        { crew: "giraffe", decoy: "zebra" },
        { crew: "otter", decoy: "seal" },
      ],
    };

    expect(mergeContent("word-pairs", [pack, pack])).toEqual(pack);
  });

  it("is stable: the same inputs give the same output", () => {
    const packA: GameContent = {
      kind: "superlatives",
      items: [{ id: "cats", prompt: "adopt a dozen cats" }],
    };
    const packB: GameContent = {
      kind: "superlatives",
      items: [{ id: "cats-2", prompt: "adopt a dozen cats" }],
    };

    const first = mergeContent("superlatives", [packA, packB]);
    const second = mergeContent("superlatives", [packA, packB]);
    expect(first).toEqual(second);
  });
});

describe("dedupeContent", () => {
  it("dedupes a single already-merged payload, keeping the first occurrence", () => {
    const content: GameContent = {
      kind: "word-pairs",
      items: [
        { crew: "giraffe", decoy: "zebra" },
        { crew: "otter", decoy: "seal" },
        { crew: "giraffe", decoy: "camel" },
      ],
    };

    expect(dedupeContent(content)).toEqual({
      kind: "word-pairs",
      items: [
        { crew: "giraffe", decoy: "zebra" },
        { crew: "otter", decoy: "seal" },
      ],
    });
  });

  it("leaves non-colliding content unchanged", () => {
    const content: GameContent = {
      kind: "word-pairs",
      items: [{ crew: "giraffe", decoy: "zebra" }],
    };
    expect(dedupeContent(content)).toEqual(content);
  });
});
