#!/usr/bin/env node
// Turn a pack-submission issue body into a pack change.
//
// Usage: node scripts/pack-submission.mjs <issue-body-file> <word-pairs|facts> [packs-root]
// The packs root defaults to the repo root; tests and CI override it with the
// third argument or the OPG_PACKS_ROOT env var.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isKebabCase, validatePack } from "./pack-rules.mjs";

const LABELS = Object.freeze(["word-pairs", "facts"]);

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

/** @param {string} value */
function slugify(value) {
  const slug = headingKey(value);
  return isKebabCase(slug) ? slug : "fact";
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
    id: uniqueId(slugify(answer), taken),
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

/** @param {{ rootDir: string, sections: Record<string, string> }} input */
function addWordPairs({ rootDir, sections }) {
  const packId = (sections.pack ?? "").trim();
  const packs = readPackIds(rootDir);
  if (!isKebabCase(packId) || !Object.hasOwn(packs, packId)) {
    throw new Error(
      `Pack: "${packId}" is not a known pack (${Object.keys(packs).join(", ")})`,
    );
  }
  const filename = `${packId}.json`;
  const items = parseWordPairs(sections["word-pairs"] ?? "");
  return appendToPack({
    rootDir,
    folder: "imposter",
    filename,
    pack: packs[packId],
    items,
  });
}

/**
 * @param {string} rootDir
 * @returns {Record<string, { items: unknown[] }>}
 */
function readPackIds(rootDir) {
  const dir = path.join(rootDir, "packs", "imposter");
  /** @type {Record<string, { items: unknown[] }>} */
  const packs = {};
  if (!fs.existsSync(dir)) return packs;
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith(".json")) continue;
    const pack = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
    packs[pack.id] = pack;
  }
  return packs;
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

/**
 * @param {{ body: string, label: string, rootDir: string }} input
 * @returns {string}
 */
export function applySubmission({ body, label, rootDir }) {
  if (!LABELS.includes(label)) {
    throw new Error(
      `Unknown label "${label}"; expected one of ${LABELS.join(", ")}`,
    );
  }
  const sections = parseIssueBody(body);
  return label === "word-pairs"
    ? addWordPairs({ rootDir, sections })
    : addFacts({ rootDir, sections });
}

function main() {
  const [bodyFile, label] = process.argv.slice(2);
  const rootDir =
    process.argv[4] ??
    process.env.OPG_PACKS_ROOT ??
    fileURLToPath(new URL("..", import.meta.url));

  if (bodyFile === undefined || label === undefined) {
    console.error(
      "Usage: node scripts/pack-submission.mjs <issue-body-file> <word-pairs|facts> [packs-root]",
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
