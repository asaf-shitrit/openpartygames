import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
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

const wordOpts = { folder: "imposter", filename: "sample-pack.json" };
const factOpts = { folder: "real-or-nah", filename: "sample-facts.json" };

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