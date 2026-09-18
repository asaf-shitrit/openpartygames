import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  crossPackErrors,
  isKebabCase,
  loadPacks,
  normalizeAnswer,
  validatePack,
} from "./pack-rules.mjs";

interface WordPairFields {
  crew: string;
  decoy: string;
}

interface WordPackFields {
  id: string;
  name: string;
  kind: string;
  rating: string;
  language: string;
  license: string;
  attribution: string;
  items: WordPairFields[];
}

interface FactSourceFields {
  title: string;
  url: string;
}

interface FactFields {
  id: string;
  prompt: string;
  answer: string;
  alternates: string[];
  decoys: string[];
  source: FactSourceFields;
}

interface FactPackFields {
  id: string;
  name: string;
  kind: string;
  rating: string;
  language: string;
  license: string;
  attribution: string;
  items: FactFields[];
}

const validWordPack = (
  overrides: Partial<WordPackFields> = {},
): WordPackFields => ({
  id: "sample-pack",
  name: "Sample pack",
  kind: "word-pairs",
  rating: "family",
  language: "en",
  license: "CC0-1.0",
  attribution: "Written for the test.",
  items: [
    { crew: "cat", decoy: "dog" },
    { crew: "horse", decoy: "zebra" },
  ],
  ...overrides,
});

const validFactPack = (items: FactFields[]): FactPackFields => ({
  id: "sample-facts",
  name: "Sample facts",
  kind: "facts",
  rating: "family",
  language: "en",
  license: "CC-BY-4.0",
  attribution: "Test facts.",
  items,
});

const fact = (overrides: Partial<FactFields> = {}): FactFields => ({
  id: "one",
  prompt: "A group of crows is called a ____.",
  answer: "murder",
  alternates: ["a murder"],
  decoys: ["flock", "parade"],
  source: { title: "Crow", url: "https://example.com/crow" },
  ...overrides,
});

interface SuperlativeFields {
  id: string;
  prompt: string;
}

interface SuperlativePackFields {
  id: string;
  name: string;
  kind: string;
  rating: string;
  language: string;
  license: string;
  attribution: string;
  items: SuperlativeFields[];
}

const validSuperlativePack = (
  items: SuperlativeFields[],
): SuperlativePackFields => ({
  id: "sample-superlatives",
  name: "Sample superlatives",
  kind: "superlatives",
  rating: "family",
  language: "en",
  license: "CC0-1.0",
  attribution: "Written for the test.",
  items,
});

const wordOpts = { folder: "imposter", filename: "sample-pack.json" };
const factOpts = { folder: "real-or-nah", filename: "sample-facts.json" };
const superlativeOpts = {
  folder: "most-likely-to",
  filename: "sample-superlatives.json",
};

/** A superlative pack with an arbitrary `items` array, for malformed-item tests. */
const superlativePackWithRawItems = (items: unknown[]) => ({
  ...validSuperlativePack([]),
  items,
});

describe("normalizeAnswer", () => {
  it("lowercases, trims and collapses whitespace", () => {
    expect(normalizeAnswer("  Great   Pyramid  ")).toBe("great pyramid");
  });

  it("strips punctuation", () => {
    expect(normalizeAnswer("laser-pointer!")).toBe("laser pointer");
  });

  it("drops a leading article", () => {
    expect(normalizeAnswer("The Emu")).toBe("emu");
    expect(normalizeAnswer("an hour")).toBe("hour");
    expect(normalizeAnswer("a cube")).toBe("cube");
  });

  it("handles non-strings", () => {
    expect(normalizeAnswer(undefined)).toBe("");
  });
});

describe("isKebabCase", () => {
  it("accepts kebab-case and rejects the rest", () => {
    expect(isKebabCase("starter-facts")).toBe(true);
    expect(isKebabCase("food-and-drink")).toBe(true);
    expect(isKebabCase("Starter_Facts")).toBe(false);
    expect(isKebabCase("-leading")).toBe(false);
  });
});

describe("validatePack word pairs", () => {
  it("accepts a valid pack", () => {
    expect(validatePack(validWordPack(), wordOpts)).toEqual([]);
  });

  it("requires the id to be kebab-case and match the filename", () => {
    expect(
      validatePack(validWordPack({ id: "Sample" }), wordOpts).join(),
    ).toMatch(/kebab-case/);
    expect(
      validatePack(validWordPack({ id: "other-name" }), wordOpts).join(),
    ).toMatch(/must match the filename/);
  });

  it("requires the kind to match the folder", () => {
    expect(
      validatePack(validWordPack({ kind: "facts" }), wordOpts).join(),
    ).toMatch(/must be "word-pairs"/);
  });

  it("rejects disallowed header values", () => {
    expect(
      validatePack(validWordPack({ rating: "kids" }), wordOpts).join(),
    ).toMatch(/rating/);
    expect(
      validatePack(validWordPack({ license: "MIT" }), wordOpts).join(),
    ).toMatch(/license/);
    expect(
      validatePack(validWordPack({ language: "fr" }), wordOpts).join(),
    ).toMatch(/language/);
  });

  it("rejects empty items", () => {
    expect(validatePack(validWordPack({ items: [] }), wordOpts).join()).toMatch(
      /non-empty array/,
    );
  });

  it("rejects uppercase, too-long, equal and duplicate words", () => {
    const errors = validatePack(
      validWordPack({
        items: [
          { crew: "Cat", decoy: "dog" },
          { crew: "twenty-five-character-word", decoy: "dog" },
          { crew: "same", decoy: "same" },
          { crew: "cat", decoy: "bird" },
          { crew: "cat", decoy: "fish" },
        ],
      }),
      wordOpts,
    ).join("\n");

    expect(errors).toMatch(/must be lowercase/);
    expect(errors).toMatch(/max 24/);
    expect(errors).toMatch(/must differ/);
    expect(errors).toMatch(/duplicate crew "cat"/);
  });
});

describe("validatePack facts", () => {
  it("accepts a valid fact pack", () => {
    expect(validatePack(validFactPack([fact()]), factOpts)).toEqual([]);
  });

  it("requires exactly one blank and unique ids", () => {
    const errors = validatePack(
      validFactPack([
        fact({ prompt: "no blank here", id: "dupe" }),
        fact({ id: "dupe" }),
        fact({ prompt: "two ____ blanks ____" }),
      ]),
      factOpts,
    ).join("\n");
    expect(errors).toMatch(/found 0/);
    expect(errors).toMatch(/found 2/);
    expect(errors).toMatch(/duplicate id "dupe"/);
  });

  it("rejects short decoy lists and decoys equal to the truth", () => {
    const errors = validatePack(
      validFactPack([
        fact({ decoys: ["only one"] }),
        fact({ decoys: ["Murder", "the flock"] }),
      ]),
      factOpts,
    ).join("\n");
    expect(errors).toMatch(/at least 2/);
    expect(errors).toMatch(/normalizes to the answer or an alternate/);
  });

  it("requires a 40-character answer and an https source", () => {
    const errors = validatePack(
      validFactPack([
        fact({ answer: "x".repeat(41) }),
        fact({ source: { title: "No TLS", url: "http://example.com" } }),
      ]),
      factOpts,
    ).join("\n");
    expect(errors).toMatch(/max 40/);
    expect(errors).toMatch(/https:\/\//);
  });
});

describe("validatePack superlatives", () => {
  it("accepts a valid pack", () => {
    expect(
      validatePack(
        validSuperlativePack([
          { id: "cats", prompt: "adopt a dozen cats" },
          { id: "band", prompt: "start a band with no instruments" },
        ]),
        superlativeOpts,
      ),
    ).toEqual([]);
  });

  it("requires items to be objects", () => {
    expect(
      validatePack(
        superlativePackWithRawItems([null]),
        superlativeOpts,
      ).join(),
    ).toMatch(/item must be an object/);
  });

  it("requires a unique, non-empty id", () => {
    const errors = validatePack(
      validSuperlativePack([
        { id: "", prompt: "adopt a dozen cats" },
        { id: "same", prompt: "adopt a dozen cats" },
        { id: "same", prompt: "start a band with no instruments" },
      ]),
      superlativeOpts,
    ).join("\n");
    expect(errors).toMatch(/\.id: must be a non-empty string/);
    expect(errors).toMatch(/duplicate id "same"/);
  });

  it("requires a non-empty prompt string", () => {
    expect(
      validatePack(
        superlativePackWithRawItems([{ id: "a", prompt: 5 }]),
        superlativeOpts,
      ).join(),
    ).toMatch(/\.prompt: must be a string/);
    expect(
      validatePack(
        validSuperlativePack([{ id: "a", prompt: "   " }]),
        superlativeOpts,
      ).join(),
    ).toMatch(/\.prompt: must be a non-empty string/);
  });

  it("rejects leading or trailing whitespace", () => {
    expect(
      validatePack(
        validSuperlativePack([{ id: "a", prompt: " adopt a cat" }]),
        superlativeOpts,
      ).join(),
    ).toMatch(/leading or trailing whitespace/);
    expect(
      validatePack(
        validSuperlativePack([{ id: "a", prompt: "adopt a cat " }]),
        superlativeOpts,
      ).join(),
    ).toMatch(/leading or trailing whitespace/);
  });

  it("accepts exactly 80 code points and rejects 81, counting emoji as one", () => {
    const at80 = "🍕".repeat(80);
    const at81 = "🍕".repeat(81);
    expect(
      validatePack(
        validSuperlativePack([{ id: "a", prompt: at80 }]),
        superlativeOpts,
      ),
    ).toEqual([]);
    expect(
      validatePack(
        validSuperlativePack([{ id: "a", prompt: at81 }]),
        superlativeOpts,
      ).join(),
    ).toMatch(/is 81 characters \(max 80\)/);
  });

  it("rejects an uppercase first character", () => {
    expect(
      validatePack(
        validSuperlativePack([{ id: "a", prompt: "Adopt a dozen cats" }]),
        superlativeOpts,
      ).join(),
    ).toMatch(/must not start with an uppercase letter/);
  });

  it("accepts a prompt that starts with an emoji", () => {
    expect(
      validatePack(
        validSuperlativePack([{ id: "a", prompt: "🍕 eat pizza for breakfast" }]),
        superlativeOpts,
      ),
    ).toEqual([]);
  });

  it("rejects trailing question marks, periods and exclamation points", () => {
    for (const prompt of [
      "adopt a dozen cats?",
      "adopt a dozen cats.",
      "adopt a dozen cats!",
    ]) {
      expect(
        validatePack(
          validSuperlativePack([{ id: "a", prompt }]),
          superlativeOpts,
        ).join(),
      ).toMatch(/must not end with "\?", "\." or "!"/);
    }
  });

  it('rejects prompts starting with "most likely", "who" or "to "', () => {
    for (const prompt of [
      "most likely adopt a cat",
      "who adopts a cat first",
      "to adopt a cat",
    ]) {
      expect(
        validatePack(
          validSuperlativePack([{ id: "a", prompt }]),
          superlativeOpts,
        ).join(),
      ).toMatch(/must not start with/);
    }
  });

  it("rejects a blank placeholder", () => {
    expect(
      validatePack(
        validSuperlativePack([{ id: "a", prompt: "adopt a ____ cat" }]),
        superlativeOpts,
      ).join(),
    ).toMatch(/must not contain "____"/);
  });

  it("rejects duplicate prompts, comparing case and whitespace loosely", () => {
    const errors = validatePack(
      validSuperlativePack([
        { id: "a", prompt: "adopt a dozen cats" },
        { id: "b", prompt: "adopt   a  dozen   cats" },
        { id: "c", prompt: "adopt A Dozen CATS" },
      ]),
      superlativeOpts,
    );
    expect(errors).toEqual([
      'items[1].prompt: duplicate prompt "adopt   a  dozen   cats"',
      'items[2].prompt: duplicate prompt "adopt A Dozen CATS"',
    ]);
  });

  it("requires the kind to match the folder", () => {
    expect(
      validatePack(
        { ...validSuperlativePack([{ id: "a", prompt: "adopt a cat" }]), kind: "facts" },
        superlativeOpts,
      ).join(),
    ).toMatch(/must be "superlatives"/);
  });
});

describe("shipped packs", () => {
  it("all validate with zero errors", () => {
    const rootDir = fileURLToPath(new URL("..", import.meta.url));
    const entries = loadPacks(rootDir);
    expect(entries.length).toBeGreaterThan(0);

    const failures = entries.flatMap((entry) =>
      validatePack(entry.pack, entry).map(
        (message) => `packs/${entry.folder}/${entry.filename}: ${message}`,
      ),
    );
    expect(failures).toEqual([]);
  });
});

describe("crossPackErrors", () => {
  it("flags two word-pairs packs that share a crew word, naming both packs and the value", () => {
    const entries = [
      {
        folder: "imposter",
        filename: "pack-a.json",
        pack: validWordPack({ id: "pack-a", items: [{ crew: "cat", decoy: "dog" }] }),
      },
      {
        folder: "imposter",
        filename: "pack-b.json",
        pack: validWordPack({ id: "pack-b", items: [{ crew: "cat", decoy: "puma" }] }),
      },
    ];

    const errors = crossPackErrors(entries);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("packs/imposter/pack-b.json");
    expect(errors[0]).toContain("pack-a");
    expect(errors[0]).toContain("cat");
  });

  it("flags two fact packs sharing a prompt, up to normalization", () => {
    const entries = [
      {
        folder: "real-or-nah",
        filename: "pack-a.json",
        pack: { ...validFactPack([fact()]), id: "pack-a" },
      },
      {
        folder: "real-or-nah",
        filename: "pack-b.json",
        pack: {
          ...validFactPack([fact({ id: "two", prompt: "  a group of crows is called a ____!  " })]),
          id: "pack-b",
        },
      },
    ];

    const errors = crossPackErrors(entries);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("packs/real-or-nah/pack-b.json");
    expect(errors[0]).toContain("pack-a");
  });

  it("flags two superlative packs sharing a prompt", () => {
    const entries = [
      {
        folder: "most-likely-to",
        filename: "pack-a.json",
        pack: { ...validSuperlativePack([{ id: "a", prompt: "adopt a cat" }]), id: "pack-a" },
      },
      {
        folder: "most-likely-to",
        filename: "pack-b.json",
        pack: { ...validSuperlativePack([{ id: "b", prompt: "adopt a cat" }]), id: "pack-b" },
      },
    ];

    const errors = crossPackErrors(entries);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("packs/most-likely-to/pack-b.json");
  });

  it("does not flag packs of different kinds sharing a value, or packs with no overlap", () => {
    const entries = [
      {
        folder: "imposter",
        filename: "pack-a.json",
        pack: validWordPack({ id: "pack-a", items: [{ crew: "cat", decoy: "dog" }] }),
      },
      {
        folder: "imposter",
        filename: "pack-b.json",
        pack: validWordPack({ id: "pack-b", items: [{ crew: "lion", decoy: "tiger" }] }),
      },
      {
        folder: "most-likely-to",
        filename: "pack-c.json",
        pack: { ...validSuperlativePack([{ id: "c", prompt: "cat" }]), id: "pack-c" },
      },
    ];

    expect(crossPackErrors(entries)).toEqual([]);
  });

  it("passes on the real repo packs", () => {
    const rootDir = fileURLToPath(new URL("..", import.meta.url));
    const validEntries = loadPacks(rootDir).filter(
      (entry) => validatePack(entry.pack, entry).length === 0,
    );
    expect(validEntries.length).toBeGreaterThan(0);
    expect(crossPackErrors(validEntries)).toEqual([]);
  });
});