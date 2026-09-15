// Shared, dependency-free rules for content packs (packs/imposter/*.json and
// packs/real-or-nah/*.json). Used by scripts/validate-packs.mjs and
// scripts/build-pack-seed.mjs, and covered by scripts/pack-rules.test.ts.

import fs from "node:fs";
import path from "node:path";

export const KIND_BY_FOLDER = Object.freeze({
  imposter: "word-pairs",
  "real-or-nah": "facts",
});

export const ALLOWED_RATINGS = Object.freeze(["family", "teen", "adult"]);
export const ALLOWED_LICENSES = Object.freeze([
  "CC0-1.0",
  "CC-BY-4.0",
  "CC-BY-SA-4.0",
]);
export const ALLOWED_LANGUAGES = Object.freeze(["en"]);

export const MAX_WORD_LENGTH = 24;
export const MAX_ANSWER_LENGTH = 40;

const KEBAB_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PLACEHOLDER = "____";

// ---------- JSON values ----------
// Pack files are JSON, so every value is one of null, boolean, number, string,
// array or plain object. Classifying by tag keeps the branch on the decoded
// domain value instead of on the raw representation.

const tagOf = (value) => Object.prototype.toString.call(value);
const isText = (value) => tagOf(value) === "[object String]";
const isRecord = (value) => tagOf(value) === "[object Object]";
const isArray = (value) => Array.isArray(value);

/** Code points of the text, so limits count characters instead of UTF-16 units. */
const codePoints = (text) => Array.from(text);

/** Lowercase, strip punctuation, drop a leading article, collapse whitespace. */
export function normalizeAnswer(text) {
  if (!isText(text)) return "";
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .trim()
    .replace(/^(?:a|an|the)\s+/u, "")
    .replace(/\s+/gu, " ")
    .trim();
}

export function isKebabCase(value) {
  return isText(value) && KEBAB_RE.test(value);
}

/**
 * Read packs/imposter/*.json and packs/real-or-nah/*.json under rootDir.
 * Returns entries `{ folder, filename, path, pack, error }`; `error` is set
 * (and `pack` undefined) when a file is not valid JSON.
 */
export function loadPacks(rootDir) {
  const entries = [];
  for (const folder of Object.keys(KIND_BY_FOLDER)) {
    const dir = path.join(rootDir, "packs", folder);
    if (!fs.existsSync(dir)) continue;
    const filenames = fs
      .readdirSync(dir)
      .filter((name) => name.endsWith(".json"))
      .toSorted();
    for (const filename of filenames) {
      entries.push(readPack(dir, folder, filename));
    }
  }
  return entries;
}

function readPack(dir, folder, filename) {
  const filePath = path.join(dir, filename);
  try {
    const pack = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return { folder, filename, path: filePath, pack, error: null };
  } catch (err) {
    return {
      folder,
      filename,
      path: filePath,
      pack: undefined,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Return a list of human-readable problems with a pack (empty when valid).
 * `opts` is `{ folder, filename, error? }`; `error` carries a JSON parse error.
 */
export function validatePack(pack, opts = {}) {
  const { folder, filename, error } = opts;
  if (error) return [`invalid JSON: ${error}`];
  if (!isRecord(pack)) return ["pack must be a JSON object"];

  const errors = [
    ...idErrors(pack, filename),
    ...kindErrors(pack, folder),
    ...vocabularyErrors(pack),
  ];

  if (!isArray(pack.items) || pack.items.length === 0) {
    errors.push("items must be a non-empty array");
    return errors;
  }

  const expectedKind = KIND_BY_FOLDER[folder];
  if (expectedKind === "word-pairs") errors.push(...wordPairErrors(pack.items));
  if (expectedKind === "facts") errors.push(...factErrors(pack.items));
  return errors;
}

function idErrors(pack, filename) {
  if (!isKebabCase(pack.id)) {
    return [`id ${JSON.stringify(pack.id)} must be kebab-case`];
  }
  const fileBase = isText(filename) ? filename.replace(/\.json$/i, "") : undefined;
  return fileBase !== undefined && pack.id !== fileBase
    ? [`id "${pack.id}" must match the filename "${fileBase}.json"`]
    : [];
}

function kindErrors(pack, folder) {
  const expectedKind = KIND_BY_FOLDER[folder];
  if (expectedKind === undefined) {
    return [`unknown pack folder ${JSON.stringify(folder)}`];
  }
  return pack.kind === expectedKind
    ? []
    : [`kind "${pack.kind}" must be "${expectedKind}" in packs/${folder}/`];
}

function vocabularyErrors(pack) {
  const errors = [];
  if (!ALLOWED_RATINGS.includes(pack.rating)) {
    errors.push(
      `rating ${JSON.stringify(pack.rating)} must be one of ${ALLOWED_RATINGS.join(", ")}`,
    );
  }
  if (!ALLOWED_LANGUAGES.includes(pack.language)) {
    errors.push(
      `language ${JSON.stringify(pack.language)} must be one of ${ALLOWED_LANGUAGES.join(", ")}`,
    );
  }
  if (!ALLOWED_LICENSES.includes(pack.license)) {
    errors.push(
      `license ${JSON.stringify(pack.license)} must be one of ${ALLOWED_LICENSES.join(", ")}`,
    );
  }
  return errors;
}

function wordPairErrors(items) {
  const errors = [];
  const seenCrew = new Set();
  items.forEach((item, index) => {
    errors.push(...wordPairItemErrors(item, index, seenCrew));
  });
  return errors;
}

function wordPairItemErrors(item, index, seenCrew) {
  const at = `items[${index}]`;
  if (!isRecord(item)) return [`${at}: item must be an object`];
  return [
    ...wordFieldErrors(item.crew, "crew", at),
    ...wordFieldErrors(item.decoy, "decoy", at),
    ...pairDifferenceErrors(item.crew, item.decoy, at),
    ...crewUniquenessErrors(item.crew, at, seenCrew),
  ];
}

function pairDifferenceErrors(crew, decoy, at) {
  return isText(crew) && isText(decoy) && crew === decoy
    ? [`${at}: crew and decoy must differ ("${crew}")`]
    : [];
}

function wordFieldErrors(value, field, at) {
  if (!isText(value) || value.trim() === "") {
    return [`${at}.${field}: must be a non-empty string`];
  }
  if (value !== value.toLowerCase()) {
    return [`${at}.${field}: "${value}" must be lowercase`];
  }
  const length = codePoints(value).length;
  return length > MAX_WORD_LENGTH
    ? [
        `${at}.${field}: "${value}" is ${length} characters (max ${MAX_WORD_LENGTH})`,
      ]
    : [];
}

function crewUniquenessErrors(crew, at, seenCrew) {
  if (!isText(crew) || crew.trim() === "") return [];
  if (seenCrew.has(crew)) return [`${at}.crew: duplicate crew "${crew}"`];
  seenCrew.add(crew);
  return [];
}

function factErrors(items) {
  const errors = [];
  const seenIds = new Set();
  items.forEach((item, index) => {
    errors.push(...factItemErrors(item, index, seenIds));
  });
  return errors;
}

function factItemErrors(item, index, seenIds) {
  const at = `items[${index}]`;
  if (!isRecord(item)) return [`${at}: item must be an object`];
  return [
    ...factIdErrors(item.id, at, seenIds),
    ...promptErrors(item.prompt, at),
    ...answerErrors(item.answer, at),
    ...decoyErrors(item, at),
    ...sourceErrors(item.source, at),
  ];
}

function factIdErrors(id, at, seenIds) {
  if (!isText(id) || id.trim() === "") {
    return [`${at}.id: must be a non-empty string`];
  }
  if (seenIds.has(id)) return [`${at}.id: duplicate id "${id}"`];
  seenIds.add(id);
  return [];
}

function promptErrors(prompt, at) {
  if (!isText(prompt)) return [`${at}.prompt: must be a string`];
  const blanks = prompt.split(PLACEHOLDER).length - 1;
  return blanks === 1
    ? []
    : [`${at}.prompt: must contain exactly one "${PLACEHOLDER}" (found ${blanks})`];
}

function answerErrors(answer, at) {
  if (!isText(answer) || answer.trim() === "") {
    return [`${at}.answer: must be a non-empty string`];
  }
  const length = codePoints(answer).length;
  return length > MAX_ANSWER_LENGTH
    ? [
        `${at}.answer: "${answer}" is ${length} characters (max ${MAX_ANSWER_LENGTH})`,
      ]
    : [];
}

function decoyErrors(item, at) {
  const decoys = item.decoys;
  if (!isArray(decoys)) return [`${at}.decoys: must be an array`];
  const errors = [];
  if (decoys.length < 2) {
    errors.push(
      `${at}.decoys: must have at least 2 entries (found ${decoys.length})`,
    );
  }
  const taken = normalizedTruths(item);
  decoys.forEach((decoy, index) => {
    errors.push(...decoyItemErrors(decoy, index, at, taken));
  });
  return errors;
}

function decoyItemErrors(decoy, index, at, taken) {
  if (!isText(decoy)) return [`${at}.decoys[${index}]: must be a string`];
  return taken.has(normalizeAnswer(decoy))
    ? [`${at}.decoys[${index}]: "${decoy}" normalizes to the answer or an alternate`]
    : [];
}

/** Normalized answer plus alternates: a decoy may not match any of them. */
function normalizedTruths(item) {
  const alternates = isArray(item.alternates) ? item.alternates : [];
  return new Set(
    [item.answer, ...alternates].filter(isText).map(normalizeAnswer),
  );
}

function sourceErrors(source, at) {
  if (!isRecord(source)) return [`${at}.source: must be an object`];
  return isText(source.url) && source.url.startsWith("https://")
    ? []
    : [`${at}.source.url: must start with https://`];
}