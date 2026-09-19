// Shared, dependency-free rules for content packs (packs/imposter/*.json,
// packs/real-or-nah/*.json, packs/most-likely-to/*.json and
// packs/doodle-bluff/*.json). Used by scripts/validate-packs.mjs and
// scripts/build-pack-seed.mjs, and covered by scripts/pack-rules.test.ts.

import fs from "node:fs";
import path from "node:path";

export const KIND_BY_FOLDER = Object.freeze({
  imposter: "word-pairs",
  "real-or-nah": "facts",
  "most-likely-to": "superlatives",
  "doodle-bluff": "drawing-prompts",
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
export const MAX_SUPERLATIVE_LENGTH = 80;
export const MAX_DRAWING_PROMPT_LENGTH = 60;
export const MIN_HOUSE_TITLES = 4;

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
  const itemErrors = ITEM_ERRORS_BY_KIND[expectedKind];
  if (itemErrors) errors.push(...itemErrors(pack.items));
  return errors;
}

/** Per-kind item validators, keyed by content kind (not by folder). */
const ITEM_ERRORS_BY_KIND = Object.freeze({
  "word-pairs": wordPairErrors,
  facts: factErrors,
  superlatives: superlativeErrors,
  "drawing-prompts": drawingPromptErrors,
});

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
    ...itemIdErrors(item.id, at, seenIds),
    ...promptErrors(item.prompt, at),
    ...answerErrors(item.answer, at),
    ...decoyErrors(item, at),
    ...sourceErrors(item.source, at),
  ];
}

/** Shared `id` check: non-empty string, unique within the pack. */
function itemIdErrors(id, at, seenIds) {
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

// ---------- superlatives ("Who's most likely to …?") ----------

const PROMPT_END_PUNCTUATION = /[?.!]$/u;
const BANNED_PROMPT_STARTS = Object.freeze(["most likely", "who", "to "]);

function superlativeErrors(items) {
  const errors = [];
  const seenIds = new Set();
  const seenPrompts = new Set();
  items.forEach((item, index) => {
    errors.push(...superlativeItemErrors(item, index, seenIds, seenPrompts));
  });
  return errors;
}

function superlativeItemErrors(item, index, seenIds, seenPrompts) {
  const at = `items[${index}]`;
  if (!isRecord(item)) return [`${at}: item must be an object`];
  return [
    ...itemIdErrors(item.id, at, seenIds),
    ...superlativePromptErrors(item.prompt, at, seenPrompts),
  ];
}

function superlativePromptErrors(prompt, at, seenPrompts) {
  if (!isText(prompt)) return [`${at}.prompt: must be a string`];
  if (prompt.trim() === "") return [`${at}.prompt: must be a non-empty string`];
  return [
    ...shortPromptErrors(prompt, at, MAX_SUPERLATIVE_LENGTH),
    ...promptStartErrors(prompt, at),
    ...promptDuplicateErrors(prompt, at, seenPrompts),
  ];
}

/**
 * Shared shape for a short, self-contained prompt string: trimmed, within
 * `maxLength` code points, starts lowercase, no trailing "?"/"."/"!", no
 * blank placeholder. Used by superlatives and drawing prompts alike.
 */
function shortPromptErrors(prompt, at, maxLength) {
  return [
    ...promptWhitespaceErrors(prompt, at),
    ...promptLengthErrors(prompt, at, maxLength),
    ...promptCaseErrors(prompt, at),
    ...promptPunctuationErrors(prompt, at),
    ...promptPlaceholderErrors(prompt, at),
  ];
}

function promptWhitespaceErrors(prompt, at) {
  return prompt !== prompt.trim()
    ? [`${at}.prompt: must not have leading or trailing whitespace`]
    : [];
}

function promptLengthErrors(prompt, at, maxLength) {
  const length = codePoints(prompt).length;
  return length > maxLength
    ? [`${at}.prompt: "${prompt}" is ${length} characters (max ${maxLength})`]
    : [];
}

function promptCaseErrors(prompt, at) {
  const first = codePoints(prompt)[0];
  return first !== first.toLowerCase()
    ? [`${at}.prompt: "${prompt}" must not start with an uppercase letter`]
    : [];
}

function promptPunctuationErrors(prompt, at) {
  return PROMPT_END_PUNCTUATION.test(prompt)
    ? [`${at}.prompt: "${prompt}" must not end with "?", "." or "!"`]
    : [];
}

function promptPlaceholderErrors(prompt, at) {
  return prompt.includes(PLACEHOLDER)
    ? [`${at}.prompt: must not contain "${PLACEHOLDER}"`]
    : [];
}

function promptStartErrors(prompt, at) {
  const lower = prompt.toLowerCase();
  const banned = BANNED_PROMPT_STARTS.find((start) => lower.startsWith(start));
  return banned !== undefined
    ? [`${at}.prompt: "${prompt}" must not start with "${banned}"`]
    : [];
}

function promptDuplicateErrors(prompt, at, seenPrompts) {
  const key = prompt.toLowerCase().replace(/\s+/gu, " ").trim();
  if (seenPrompts.has(key)) {
    return [`${at}.prompt: duplicate prompt "${prompt}"`];
  }
  seenPrompts.add(key);
  return [];
}

// ---------- cross-pack duplicates ----------
// Enabled packs merge into one pool at runtime (packages/sdk/src/content.ts), so the same item
// showing up in two packs of the same kind becomes a repeat round even though each pack, checked
// alone, has no duplicates. `crossPackErrors` mirrors that runtime identity: the exact `crew`
// word for word-pairs, the normalized prompt for facts, superlatives and drawing prompts (their
// `id` is only unique within one pack, so it can't be the identity here).

const CROSS_PACK_IDENTITY = Object.freeze({
  "word-pairs": (item) =>
    isText(item.crew) && item.crew.trim() !== ""
      ? { key: item.crew, value: item.crew, field: "crew" }
      : null,
  facts: (item) =>
    isText(item.prompt)
      ? { key: normalizeAnswer(item.prompt), value: item.prompt, field: "prompt" }
      : null,
  superlatives: (item) =>
    isText(item.prompt)
      ? { key: normalizeAnswer(item.prompt), value: item.prompt, field: "prompt" }
      : null,
  "drawing-prompts": (item) =>
    isText(item.prompt)
      ? { key: normalizeAnswer(item.prompt), value: item.prompt, field: "prompt" }
      : null,
});

/**
 * Duplicate item identities across packs of the same kind. Only checks packs whose own
 * validation already passed (`validatePack` returned no errors), so a malformed pack doesn't
 * cascade into cross-pack noise. `entries` is the shape `loadPacks` returns.
 */
export function crossPackErrors(entries) {
  const byKind = new Map();
  for (const entry of entries) {
    const kind = entry.pack?.kind;
    if (!isText(kind) || !CROSS_PACK_IDENTITY[kind]) continue;
    const forKind = byKind.get(kind) ?? [];
    forKind.push(entry);
    byKind.set(kind, forKind);
  }
  return [...byKind.entries()].flatMap(([kind, kindEntries]) =>
    crossPackErrorsForKind(kind, kindEntries),
  );
}

function crossPackErrorsForKind(kind, entries) {
  const identityOf = CROSS_PACK_IDENTITY[kind];
  const seen = new Map();
  const errors = [];
  for (const entry of entries) {
    for (const item of entry.pack.items ?? []) {
      errors.push(...crossPackItemErrors(entry, item, identityOf, seen));
    }
  }
  return errors;
}

function crossPackItemErrors(entry, item, identityOf, seen) {
  if (!isRecord(item)) return [];
  const identity = identityOf(item);
  if (identity === null) return [];
  const prior = seen.get(identity.key);
  if (prior === undefined) {
    seen.set(identity.key, { pack: entry.pack.id, value: identity.value });
    return [];
  }
  return [
    `packs/${entry.folder}/${entry.filename}: ${identity.field} "${identity.value}" also appears in pack "${prior.pack}" (as "${prior.value}")`,
  ];
}

// ---------- drawing prompts (Doodle Bluff) ----------

const GIVEAWAY_WORDS = Object.freeze(["the word", "spell", "written"]);

function drawingPromptErrors(items) {
  const errors = [];
  const seenIds = new Set();
  const seenPrompts = new Set();
  items.forEach((item, index) => {
    errors.push(...drawingPromptItemErrors(item, index, seenIds, seenPrompts));
  });
  return errors;
}

function drawingPromptItemErrors(item, index, seenIds, seenPrompts) {
  const at = `items[${index}]`;
  if (!isRecord(item)) return [`${at}: item must be an object`];
  return [
    ...itemIdErrors(item.id, at, seenIds),
    ...drawingPromptTextErrors(item.prompt, at, seenPrompts),
    ...houseTitlesErrors(item, at),
  ];
}

function drawingPromptTextErrors(prompt, at, seenPrompts) {
  if (!isText(prompt)) return [`${at}.prompt: must be a string`];
  if (prompt.trim() === "") return [`${at}.prompt: must be a non-empty string`];
  return [
    ...shortPromptErrors(prompt, at, MAX_DRAWING_PROMPT_LENGTH),
    ...giveawayWordErrors(prompt, at),
    ...promptDuplicateErrors(prompt, at, seenPrompts),
  ];
}

function giveawayWordErrors(prompt, at) {
  const lower = prompt.toLowerCase();
  const found = GIVEAWAY_WORDS.find((word) => lower.includes(word));
  return found !== undefined
    ? [`${at}.prompt: "${prompt}" must not contain "${found}" (must be drawable without writing words)`]
    : [];
}

function houseTitlesErrors(item, at) {
  const houseTitles = item.houseTitles;
  if (!isArray(houseTitles)) return [`${at}.houseTitles: must be an array`];
  const errors = [];
  if (houseTitles.length < MIN_HOUSE_TITLES) {
    errors.push(
      `${at}.houseTitles: must have at least ${MIN_HOUSE_TITLES} entries (found ${houseTitles.length})`,
    );
  }
  const taken = new Set(isText(item.prompt) ? [normalizeAnswer(item.prompt)] : []);
  houseTitles.forEach((houseTitle, index) => {
    errors.push(...houseTitleItemErrors(houseTitle, index, at, taken));
  });
  return errors;
}

function houseTitleItemErrors(houseTitle, index, at, taken) {
  const field = `houseTitles[${index}]`;
  if (!isText(houseTitle) || houseTitle.trim() === "") {
    return [`${at}.${field}: must be a non-empty string`];
  }
  const length = codePoints(houseTitle).length;
  if (length > MAX_DRAWING_PROMPT_LENGTH) {
    return [
      `${at}.${field}: "${houseTitle}" is ${length} characters (max ${MAX_DRAWING_PROMPT_LENGTH})`,
    ];
  }
  const key = normalizeAnswer(houseTitle);
  if (taken.has(key)) {
    return [`${at}.${field}: "${houseTitle}" normalizes to the prompt or another house title`];
  }
  taken.add(key);
  return [];
}