#!/usr/bin/env node
// Turn a pack-submission issue body into a pack change.
//
// Usage: node scripts/pack-submission.mjs <issue-body-file> <word-pairs|facts|superlatives|drawing-prompts> [packs-root]
// The packs root defaults to the repo root; tests and CI override it with the
// third argument or the OPG_PACKS_ROOT env var.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isKebabCase, normalizeAnswer, validatePack } from "./pack-rules.mjs";


const COMMUNITY_FACTS = Object.freeze({
  id: "community-facts",
  name: "Community facts",
  kind: "facts",
  rating: "family",
  language: "en",
  license: "CC-BY-SA-4.0",
  attribution:
    "Facts submitted by the community through GitHub issue forms (CC BY-SA 4.0); each item links its source.",
  items: [],
});

/** "### Source URL" -> "source-url", so ids and labels both match. */
/** @param {string} heading */
export function headingKey(heading) {
  return heading
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
}

/**
 * Parse an issue-form markdown body into a `{ headingKey: value }` map.
 * Values are the trimmed text between one "### Heading" line and the next.
 * @param {string} body
 * @returns {Record<string, string>}
 */
export function parseIssueBody(body) {
  /** @type {Record<string, string>} */
  const sections = {};
  /** @type {string | null} */
  let key = null;
  /** @type {string[]} */
  let lines = [];

  const flush = () => {
    if (key !== null) sections[key] = lines.join("\n").trim();
    lines = [];
  };

  for (const line of body.split(/\r?\n/u)) {
    const match = /^###\s+(.+?)\s*$/u.exec(line);
    if (match) {
      flush();
      key = headingKey(match[1]);
    } else if (key !== null) {
      lines.push(line);
    }
  }
  flush();

  return sections;
}

/** @param {string} value */
function splitList(value) {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");
}

/**
 * "A penguin at a bus stop" -> "penguin-at-a-bus-stop"; text with no latin
 * letters or digits falls back to `fallback`.
 * @param {string} value
 * @param {string} fallback
 */
function slugify(value, fallback) {
  const slug = headingKey(normalizeAnswer(value));
  return isKebabCase(slug) ? slug : fallback;
}

/** One entry per non-empty line. @param {string} value */
function splitLines(value) {
  return value
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

/**
 * @param {string} base
 * @param {Set<string>} taken
 */
function uniqueId(base, taken) {
  let candidate = base;
  let counter = 2;
  while (taken.has(candidate)) {
    candidate = `${base}-${counter}`;
    counter += 1;
  }
  taken.add(candidate);
  return candidate;
}

/** @param {string} value */
function parseWordPairs(value) {
  const items = [];
  value.split(/\r?\n/u).forEach((line, index) => {
    const text = line.trim();
    if (text === "") return;
    const parts = text.split("/").map((part) => part.trim());
    if (parts.length !== 2 || parts[0] === "" || parts[1] === "") {
      throw new Error(
        `Word pairs line ${index + 1}: expected "crew / decoy", got "${text}"`,
      );
    }
    items.push({ crew: parts[0], decoy: parts[1] });
  });
  if (items.length === 0) throw new Error("Word pairs: no pairs found");
  return items;
}

/**
 * @param {Record<string, string>} sections
 * @param {Set<string>} taken
 */
function parseFact(sections, taken) {
  const prompt = sections.prompt ?? "";
  const answer = sections.answer ?? "";
  const decoys = splitList(sections.decoys ?? "");
  const source = {
    title: sections["source-title"] ?? "",
    url: sections["source-url"] ?? "",
  };

  if (prompt === "" || answer === "") {
    throw new Error("Facts: prompt and answer are both required");
  }

  return {
    id: uniqueId(slugify(answer, "fact"), taken),
    prompt,
    answer,
    alternates: splitList(sections.alternates ?? ""),
    decoys,
    source,
  };
}

/**
 * Read the pack, append the new items, validate, and write it back.
 * @param {{ rootDir: string, folder: string, filename: string, pack: { items: unknown[] }, items: unknown[] }} input
 */
function appendToPack({ rootDir, folder, filename, pack, items }) {
  const filePath = path.join(rootDir, "packs", folder, filename);
  const updated = { ...pack, items: [...pack.items, ...items] };
  const errors = validatePack(updated, { folder, filename });
  if (errors.length > 0) {
    throw new Error(
      `packs/${folder}/${filename} failed validation:\n${errors
        .map((message) => `  - ${message}`)
        .join("\n")}`,
    );
  }
  fs.writeFileSync(filePath, `${JSON.stringify(updated, null, 2)}\n`, "utf8");
  return `packs/${folder}/${filename}`;
}

/**
 * Read every pack in `packs/<folder>/`, keyed by id.
 * @param {string} rootDir
 * @param {string} folder
 * @returns {Record<string, { items: { id?: string }[] }>}
 */
function readPacks(rootDir, folder) {
  const dir = path.join(rootDir, "packs", folder);
  /** @type {Record<string, { items: { id?: string }[] }>} */
  const packs = {};
  if (!fs.existsSync(dir)) return packs;
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith(".json")) continue;
    const pack = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
    packs[pack.id] = pack;
  }
  return packs;
}

/**
 * Append the items `makeItems` builds to the pack the form's "Pack" dropdown names.
 * @param {{ rootDir: string, sections: Record<string, string>, folder: string, makeItems: (taken: Set<string>) => unknown[] }} input
 */
function addToChosenPack({ rootDir, sections, folder, makeItems }) {
  const packId = (sections.pack ?? "").trim();
  const packs = readPacks(rootDir, folder);
  if (!isKebabCase(packId) || !Object.hasOwn(packs, packId)) {
    throw new Error(
      `Pack: "${packId}" is not a known pack (${Object.keys(packs).join(", ")})`,
    );
  }
  const pack = packs[packId];
  const taken = new Set(pack.items.map((item) => item.id));
  return appendToPack({
    rootDir,
    folder,
    filename: `${packId}.json`,
    pack,
    items: makeItems(taken),
  });
}

/** @param {{ rootDir: string, sections: Record<string, string> }} input */
function addWordPairs({ rootDir, sections }) {
  return addToChosenPack({
    rootDir,
    sections,
    folder: "imposter",
    makeItems: () => parseWordPairs(sections["word-pairs"] ?? ""),
  });
}

/**
 * @param {string} value
 * @param {Set<string>} taken
 */
function parseSuperlatives(value, taken) {
  const prompts = splitLines(value);
  if (prompts.length === 0) throw new Error("Prompts: no prompts found");
  return prompts.map((prompt) => ({
    id: uniqueId(slugify(prompt, "prompt"), taken),
    prompt,
  }));
}

/** @param {{ rootDir: string, sections: Record<string, string> }} input */
function addSuperlatives({ rootDir, sections }) {
  return addToChosenPack({
    rootDir,
    sections,
    folder: "most-likely-to",
    makeItems: (taken) => parseSuperlatives(sections.prompts ?? "", taken),
  });
}

/**
 * @param {Record<string, string>} sections
 * @param {Set<string>} taken
 */
function parseDrawingPrompt(sections, taken) {
  const prompt = sections.prompt ?? "";
  if (prompt === "") throw new Error("Drawing prompts: a prompt is required");
  return {
    id: uniqueId(slugify(prompt, "drawing"), taken),
    prompt,
    houseTitles: splitLines(sections["house-titles"] ?? ""),
  };
}

/** @param {{ rootDir: string, sections: Record<string, string> }} input */
function addDrawingPrompts({ rootDir, sections }) {
  return addToChosenPack({
    rootDir,
    sections,
    folder: "doodle-bluff",
    makeItems: (taken) => [parseDrawingPrompt(sections, taken)],
  });
}

/** @param {{ rootDir: string, sections: Record<string, string> }} input */
function addFacts({ rootDir, sections }) {
  const filename = "community-facts.json";
  const filePath = path.join(rootDir, "packs", "real-or-nah", filename);
  const existing = fs.existsSync(filePath)
    ? JSON.parse(fs.readFileSync(filePath, "utf8"))
    : COMMUNITY_FACTS;
  const taken = new Set(existing.items.map((item) => item.id));
  const item = parseFact(sections, taken);
  return appendToPack({
    rootDir,
    folder: "real-or-nah",
    filename,
    pack: existing,
    items: [item],
  });
}

/** How each submission label turns its issue sections into a pack change. */
const ADD_BY_LABEL = Object.freeze({
  "word-pairs": addWordPairs,
  facts: addFacts,
  superlatives: addSuperlatives,
  "drawing-prompts": addDrawingPrompts,
});

const LABELS = Object.freeze(Object.keys(ADD_BY_LABEL));

/**
 * @param {{ body: string, label: string, rootDir: string }} input
 * @returns {string}
 */
export function applySubmission({ body, label, rootDir }) {
  if (!Object.hasOwn(ADD_BY_LABEL, label)) {
    throw new Error(
      `Unknown label "${label}"; expected one of ${LABELS.join(", ")}`,
    );
  }
  return ADD_BY_LABEL[label]({ rootDir, sections: parseIssueBody(body) });
}

function main() {
  const [bodyFile, label] = process.argv.slice(2);
  const rootDir =
    process.argv[4] ??
    process.env.OPG_PACKS_ROOT ??
    fileURLToPath(new URL("..", import.meta.url));

  if (bodyFile === undefined || label === undefined) {
    console.error(
      "Usage: node scripts/pack-submission.mjs <issue-body-file> <word-pairs|facts|superlatives|drawing-prompts> [packs-root]",
    );
    process.exit(1);
  }

  try {
    const body = fs.readFileSync(bodyFile, "utf8");
    const changed = applySubmission({ body, label, rootDir });
    console.log(`Updated ${changed}`);
  } catch (error) {
    console.error(
      `✗ ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  }
}

const entryFile = process.argv[1];
if (
  entryFile !== undefined &&
  import.meta.url === pathToFileURL(entryFile).href
) {
  main();
}
