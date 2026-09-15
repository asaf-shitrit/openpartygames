import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  applySubmission,
  headingKey,
  parseIssueBody,
} from "./pack-submission.mjs";

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

let rootDir: string;

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

  it("creates community-facts.json with the right header", () => {
    const changed = applySubmission({
      body: factsBody,
      label: "facts",
      rootDir,
    });
    expect(changed).toBe("packs/real-or-nah/community-facts.json");
    const pack = readPack("real-or-nah", "community-facts.json");
    expect(pack).toMatchObject({
      id: "community-facts",
      kind: "facts",
      rating: "family",
      language: "en",
      license: "CC-BY-SA-4.0",
    });
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
  });

  it("appends more facts to an existing community pack without duplicate ids", () => {
    applySubmission({ body: factsBody, label: "facts", rootDir });
    applySubmission({ body: factsBody, label: "facts", rootDir });
    const pack = readPack("real-or-nah", "community-facts.json");
    expect(pack.items).toHaveLength(2);
    expect(pack.items[0].id).not.toBe(pack.items[1].id);
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
});
