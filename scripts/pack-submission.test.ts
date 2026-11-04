import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  applySubmission,
  headingKey,
  parseIssueBody,
} from "./pack-submission.mjs";
import { validatePack } from "./pack-rules.mjs";

const WORD_PACK = {
  id: "animals",
  name: "Animals",
  kind: "word-pairs",
  rating: "family",
  language: "en",
  license: "CC-BY-SA-4.0",
  attribution: "Fixture.",
  items: [{ crew: "cat", decoy: "dog" }],
};

const wordPairsBody = [
  "### Pack",
  "",
  "animals",
  "",
  "### Word pairs",
  "",
  "giraffe / zebra",
  "dolphin / shark",
  "",
  "### License",
  "",
  "- [x] These word pairs are my own original content, and I release them under CC BY-SA 4.0.",
  "",
].join("\n");

const factsBody = [
  "### Pack",
  "",
  "starter-facts",
  "",
  "### Prompt",
  "",
  "Scotland's national animal is the ____.",
  "",
  "### Answer",
  "",
  "unicorn",
  "",
  "### Alternates",
  "",
  "unicorns",
  "",
  "### Decoys",
  "",
  "red deer, golden eagle, highland cow",
  "",
  "### Source title",
  "",
  "National symbols of Scotland",
  "",
  "### Source URL",
  "",
  "https://en.wikipedia.org/wiki/National_symbols_of_Scotland",
  "",
].join("\n");

const FACTS_PACK = {
  id: "starter-facts",
  name: "Starter facts",
  kind: "facts",
  rating: "family",
  language: "en",
  license: "CC-BY-SA-4.0",
  attribution: "Fixture.",
  items: [],
};

const HEBREW_FACTS_PACK = {
  id: "hebrew-surprising-facts",
  name: "עובדות מפתיעות",
  kind: "facts",
  rating: "family",
  language: "he",
  license: "CC-BY-SA-4.0",
  attribution: "Fixture.",
  items: [],
};

const hebrewFactsBody = [
  "### Pack",
  "",
  "Hebrew: hebrew-surprising-facts",
  "",
  "### Prompt",
  "",
  "החיה הלאומית של סקוטלנד היא ה____.",
  "",
  "### Answer",
  "",
  "חד קרן",
  "",
  "### Alternates",
  "",
  "",
  "### Decoys",
  "",
  "איל, נשר, פרה",
  "",
  "### Source title",
  "",
  "סמלים לאומיים של סקוטלנד",
  "",
  "### Source URL",
  "",
  "https://he.wikipedia.org/wiki/סקוטלנד",
  "",
].join("\n");

const SUPERLATIVE_PACK = {
  id: "most-likely-everyday",
  name: "Everyday",
  kind: "superlatives",
  rating: "family",
  language: "en",
  license: "CC0-1.0",
  attribution: "Fixture.",
  items: [{ id: "befriend-a-pigeon", prompt: "befriend a pigeon" }],
};

const DRAWING_PACK = {
  id: "doodle-everyday",
  name: "Everyday",
  kind: "drawing-prompts",
  rating: "family",
  language: "en",
  license: "CC0-1.0",
  attribution: "Fixture.",
  items: [
    {
      id: "cat-riding-a-skateboard",
      prompt: "a cat riding a skateboard",
      houseTitles: [
        "a dog on a scooter",
        "a squirrel driving a bus",
        "a hamster in a shopping trolley",
        "a duck on a unicycle",
      ],
    },
  ],
};

const superlativesBody = [
  "### Pack",
  "",
  "most-likely-everyday",
  "",
  "### Prompts",
  "",
  "name their car",
  "",
  "befriend a pigeon at the beach",
  "",
  "### License",
  "",
  "- [x] These prompts are my own original content, and I release them under CC0 1.0.",
  "",
].join("\n");

const drawingPromptsBody = [
  "### Pack",
  "",
  "doodle-everyday",
  "",
  "### Prompt",
  "",
  "a penguin at a bus stop",
  "",
  "### House titles",
  "",
  "a puffin waiting for a train",
  "an owl at a taxi rank",
  "",
  "a seal queueing for ice cream",
  "a goose at the post office",
  "",
  "### License",
  "",
  "- [x] This prompt and its titles are my own original content, and I release them under CC0 1.0.",
  "",
].join("\n");

let rootDir: string;

function writePack(folder: string, pack: { id: string }) {
  fs.mkdirSync(path.join(rootDir, "packs", folder), { recursive: true });
  fs.writeFileSync(
    path.join(rootDir, "packs", folder, `${pack.id}.json`),
    `${JSON.stringify(pack, null, 2)}\n`,
    "utf8",
  );
}

function readPack(folder: string, filename: string) {
  return JSON.parse(
    fs.readFileSync(path.join(rootDir, "packs", folder, filename), "utf8"),
  );
}

beforeEach(() => {
  rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "opg-packs-"));
  fs.mkdirSync(path.join(rootDir, "packs", "imposter"), { recursive: true });
  fs.mkdirSync(path.join(rootDir, "packs", "real-or-nah"), { recursive: true });
  fs.writeFileSync(
    path.join(rootDir, "packs", "imposter", "animals.json"),
    `${JSON.stringify(WORD_PACK, null, 2)}\n`,
    "utf8",
  );
  writePack("real-or-nah", FACTS_PACK);
  writePack("real-or-nah", HEBREW_FACTS_PACK);
  writePack("most-likely-to", SUPERLATIVE_PACK);
  writePack("doodle-bluff", DRAWING_PACK);
});

afterEach(() => {
  fs.rmSync(rootDir, { recursive: true, force: true });
});

describe("parseIssueBody", () => {
  it("parses the word-pairs form", () => {
    const sections = parseIssueBody(wordPairsBody);
    expect(sections.pack).toBe("animals");
    expect(sections["word-pairs"]).toBe("giraffe / zebra\ndolphin / shark");
    expect(sections.license).toContain("CC BY-SA 4.0");
  });

  it("parses the facts form, mapping labels to ids", () => {
    const sections = parseIssueBody(factsBody);
    expect(sections.prompt).toBe("Scotland's national animal is the ____.");
    expect(sections.answer).toBe("unicorn");
    expect(sections.alternates).toBe("unicorns");
    expect(sections["source-url"]).toBe(
      "https://en.wikipedia.org/wiki/National_symbols_of_Scotland",
    );
  });

  it("matches a heading by either its label or its id", () => {
    expect(headingKey("Source URL")).toBe("source-url");
    expect(headingKey("source-url")).toBe("source-url");
  });
});

describe("applySubmission", () => {
  it("appends word pairs to the chosen pack", () => {
    const changed = applySubmission({
      body: wordPairsBody,
      label: "word-pairs",
      rootDir,
    });
    expect(changed).toBe("packs/imposter/animals.json");
    const pack = readPack("imposter", "animals.json");
    expect(pack.items).toEqual([
      { crew: "cat", decoy: "dog" },
      { crew: "giraffe", decoy: "zebra" },
      { crew: "dolphin", decoy: "shark" },
    ]);
  });

  it("appends a fact to the pack the form names", () => {
    const changed = applySubmission({
      body: factsBody,
      label: "facts",
      rootDir,
    });
    expect(changed).toBe("packs/real-or-nah/starter-facts.json");
    const pack = readPack("real-or-nah", "starter-facts.json");
    expect(pack.items).toHaveLength(1);
    expect(pack.items[0]).toMatchObject({
      prompt: "Scotland's national animal is the ____.",
      answer: "unicorn",
      alternates: ["unicorns"],
      decoys: ["red deer", "golden eagle", "highland cow"],
      source: {
        title: "National symbols of Scotland",
        url: "https://en.wikipedia.org/wiki/National_symbols_of_Scotland",
      },
    });
    expect(fs.existsSync(path.join(rootDir, "packs/real-or-nah/community-facts.json"))).toBe(false);
  });

  it("appends more facts to a pack without duplicate ids", () => {
    applySubmission({ body: factsBody, label: "facts", rootDir });
    const second = factsBody
      .replace("Scotland's national animal is the ____.", "Scotland's national dish is ____.")
      .replace("### Answer\n\nunicorn", "### Answer\n\nunicorn stew");
    applySubmission({ body: second, label: "facts", rootDir });
    const pack = readPack("real-or-nah", "starter-facts.json");
    expect(pack.items).toHaveLength(2);
    expect(pack.items[0].id).not.toBe(pack.items[1].id);
  });

  it("puts a Hebrew fact in the Hebrew pack, and the result validates", () => {
    const changed = applySubmission({
      body: hebrewFactsBody,
      label: "facts",
      rootDir,
    });
    expect(changed).toBe("packs/real-or-nah/hebrew-surprising-facts.json");
    const pack = readPack("real-or-nah", "hebrew-surprising-facts.json");
    expect(pack.language).toBe("he");
    expect(pack.items).toHaveLength(1);
    expect(pack.items[0]).toMatchObject({ answer: "חד קרן", decoys: ["איל", "נשר", "פרה"] });
    expect(
      validatePack(pack, { folder: "real-or-nah", filename: "hebrew-surprising-facts.json" }),
    ).toEqual([]);
  });

  it("rejects a Hebrew fact aimed at an English pack and an English fact aimed at a Hebrew pack", () => {
    const toEnglish = hebrewFactsBody.replace("Hebrew: hebrew-surprising-facts", "English: starter-facts");
    expect(() => applySubmission({ body: toEnglish, label: "facts", rootDir })).toThrow(
      /English pack, but the fact is written in Hebrew/u,
    );
    const toHebrew = factsBody.replace("starter-facts", "Hebrew: hebrew-surprising-facts");
    expect(() => applySubmission({ body: toHebrew, label: "facts", rootDir })).toThrow(
      /Hebrew pack, but the fact is written in English/u,
    );
    expect(readPack("real-or-nah", "starter-facts.json").items).toEqual([]);
    expect(readPack("real-or-nah", "hebrew-surprising-facts.json").items).toEqual([]);
  });

  it("accepts the dropdown's language label before the pack id", () => {
    const body = wordPairsBody.replace("animals", "English: animals");
    expect(applySubmission({ body, label: "word-pairs", rootDir })).toBe(
      "packs/imposter/animals.json",
    );
  });

  it("rejects a submission that repeats an item from another pack, as validate:packs would", () => {
    writePack("imposter", { ...WORD_PACK, id: "food", name: "Food", items: [{ crew: "giraffe", decoy: "zebra" }] });
    expect(() =>
      applySubmission({ body: wordPairsBody, label: "word-pairs", rootDir }),
    ).toThrow(/crew "giraffe" also appears in pack "animals"/u);
    expect(readPack("imposter", "animals.json").items).toHaveLength(1);
  });

  it("throws a readable error and leaves the pack untouched when validation fails", () => {
    const badBody = wordPairsBody.replace("giraffe / zebra", "Giraffe / zebra");
    expect(() =>
      applySubmission({ body: badBody, label: "word-pairs", rootDir }),
    ).toThrow(/must be lowercase/u);
    expect(readPack("imposter", "animals.json").items).toEqual([
      { crew: "cat", decoy: "dog" },
    ]);
  });

  it("rejects a fact with fewer than two decoys", () => {
    const badBody = factsBody.replace(
      "red deer, golden eagle, highland cow",
      "red deer",
    );
    expect(() =>
      applySubmission({ body: badBody, label: "facts", rootDir }),
    ).toThrow(/at least 2 entries/u);
  });

  it("rejects an unknown label", () => {
    expect(() =>
      applySubmission({ body: wordPairsBody, label: "nope", rootDir }),
    ).toThrow(/Unknown label/u);
  });

  it("appends superlatives to the chosen pack, one per line, with unique ids", () => {
    const changed = applySubmission({
      body: superlativesBody,
      label: "superlatives",
      rootDir,
    });
    expect(changed).toBe("packs/most-likely-to/most-likely-everyday.json");
    expect(validatePack(readPack("most-likely-to", "most-likely-everyday.json"), {
      folder: "most-likely-to",
      filename: "most-likely-everyday.json",
    })).toEqual([]);
    expect(readPack("most-likely-to", "most-likely-everyday.json").items).toEqual([
      { id: "befriend-a-pigeon", prompt: "befriend a pigeon" },
      { id: "name-their-car", prompt: "name their car" },
      {
        id: "befriend-a-pigeon-at-the-beach",
        prompt: "befriend a pigeon at the beach",
      },
    ]);
  });

  it("rejects a superlative the pack rules forbid and leaves the pack untouched", () => {
    const badBody = superlativesBody.replace("name their car", "Who names their car?");
    expect(() =>
      applySubmission({ body: badBody, label: "superlatives", rootDir }),
    ).toThrow(/must not start with an uppercase letter/u);
    expect(readPack("most-likely-to", "most-likely-everyday.json").items).toHaveLength(1);
  });

  it("rejects a superlatives submission with no prompts", () => {
    const emptyBody = superlativesBody
      .replace("name their car", "")
      .replace("befriend a pigeon at the beach", "");
    expect(() =>
      applySubmission({ body: emptyBody, label: "superlatives", rootDir }),
    ).toThrow(/no prompts found/u);
  });

  it("appends a drawing prompt with its house titles to the chosen pack", () => {
    const changed = applySubmission({
      body: drawingPromptsBody,
      label: "drawing-prompts",
      rootDir,
    });
    expect(changed).toBe("packs/doodle-bluff/doodle-everyday.json");
    const pack = readPack("doodle-bluff", "doodle-everyday.json");
    expect(
      validatePack(pack, { folder: "doodle-bluff", filename: "doodle-everyday.json" }),
    ).toEqual([]);
    expect(pack.items).toHaveLength(2);
    expect(pack.items[1]).toEqual({
      id: "penguin-at-a-bus-stop",
      prompt: "a penguin at a bus stop",
      houseTitles: [
        "a puffin waiting for a train",
        "an owl at a taxi rank",
        "a seal queueing for ice cream",
        "a goose at the post office",
      ],
    });
  });

  it("rejects a drawing prompt the pack already has, as validate:packs would", () => {
    const body = drawingPromptsBody.replace(
      "a penguin at a bus stop",
      "the cat riding a skateboard",
    );
    expect(() => applySubmission({ body, label: "drawing-prompts", rootDir })).toThrow(
      /also appears in pack "doodle-everyday"/u,
    );
    expect(readPack("doodle-bluff", "doodle-everyday.json").items).toHaveLength(1);
  });

  it("rejects a drawing prompt with fewer than four house titles", () => {
    const badBody = drawingPromptsBody
      .replace("a seal queueing for ice cream\n", "")
      .replace("a goose at the post office\n", "");
    expect(() =>
      applySubmission({ body: badBody, label: "drawing-prompts", rootDir }),
    ).toThrow(/at least 4 entries/u);
    expect(readPack("doodle-bluff", "doodle-everyday.json").items).toHaveLength(1);
  });

  it("rejects a drawing prompt with no prompt text", () => {
    const badBody = drawingPromptsBody.replace("a penguin at a bus stop", "");
    expect(() =>
      applySubmission({ body: badBody, label: "drawing-prompts", rootDir }),
    ).toThrow(/prompt is required/u);
  });

  it("rejects a pack that is not in the submission's folder", () => {
    const badBody = superlativesBody.replace("most-likely-everyday", "animals");
    expect(() =>
      applySubmission({ body: badBody, label: "superlatives", rootDir }),
    ).toThrow(/"animals" is not a known pack \(most-likely-everyday\)/u);
  });
});
