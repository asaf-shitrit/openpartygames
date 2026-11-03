import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadPacks } from "./pack-rules.mjs";

const rootDir = fileURLToPath(new URL("..", import.meta.url));

const FORM_FOLDERS = {
  "add-word-pairs.yml": "imposter",
  "add-facts.yml": "real-or-nah",
  "add-superlatives.yml": "most-likely-to",
  "add-drawing-prompts.yml": "doodle-bluff",
} as const;

/** The options of the form's "pack" dropdown, in the order the form shows them. */
function packOptions(form: string): string[] {
  const text = fs.readFileSync(path.join(rootDir, ".github", "ISSUE_TEMPLATE", form), "utf8");
  const block = /id: pack\n[\s\S]*?options:\n((?:\s+- .*\n)+)/u.exec(text);
  return (block?.[1] ?? "")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => line.replace(/^\s+- /u, "").replace(/^"(.*)"$/u, "$1"));
}

describe("pack submission forms", () => {
  const entries = loadPacks(rootDir);

  for (const [form, folder] of Object.entries(FORM_FOLDERS)) {
    it(`${form} lists every ${folder} pack, English first, then Hebrew`, () => {
      const packs = entries
        .filter((entry) => entry.folder === folder)
        .map((entry) => ({
          id: String(entry.pack?.id),
          language: entry.pack?.language === "he" ? "he" : "en",
        }));
      const label = { en: "English", he: "Hebrew" };
      const expected = (["en", "he"] as const).flatMap((language) =>
        packs
          .filter((pack) => pack.language === language)
          .map((pack) => `${label[language]}: ${pack.id}`)
          .toSorted(),
      );
      expect(packOptions(form)).toEqual(expected);
    });
  }
});
