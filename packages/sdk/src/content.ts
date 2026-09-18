// Per-kind content merging, shared by in-memory sources and tests. A new content kind adds one
// entry here; the mapped type makes a missing entry a type error.
import { normalizeAnswer } from "./text";
import type { ContentKind, ContentOf, Fact, GameContent, Superlative, WordPair } from "./types";

type Merger<K extends ContentKind> = (contents: readonly GameContent[]) => ContentOf<K>;

/**
 * What makes two items "the same" across packs, per kind. `word-pairs` reuses the exact
 * `crew` string the per-pack validator already treats as the unique key (packs already require
 * it lowercase). Facts and superlatives don't have a cross-pack-unique `id` (validated unique
 * only within one pack), so their identity is the visible prompt a player would recognize as a
 * repeat, normalized the same way answers are compared elsewhere.
 */
function wordPairIdentity(item: WordPair): string {
  return item.crew;
}
function factIdentity(item: Fact): string {
  return normalizeAnswer(item.prompt);
}
function superlativeIdentity(item: Superlative): string {
  return normalizeAnswer(item.prompt);
}

/** Keeps the first occurrence of each identity, in input order. */
function dedupeItems<T>(items: readonly T[], identityOf: (item: T) => string): T[] {
  const seen = new Set<string>();
  const kept: T[] = [];
  for (const item of items) {
    const key = identityOf(item);
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(item);
  }
  return kept;
}

const CONTENT_MERGERS = {
  "word-pairs": (contents) => ({
    kind: "word-pairs",
    items: dedupeItems(
      contents.flatMap((c) => (c.kind === "word-pairs" ? c.items : [])),
      wordPairIdentity,
    ),
  }),
  facts: (contents) => ({
    kind: "facts",
    items: dedupeItems(
      contents.flatMap((c) => (c.kind === "facts" ? c.items : [])),
      factIdentity,
    ),
  }),
  superlatives: (contents) => ({
    kind: "superlatives",
    items: dedupeItems(
      contents.flatMap((c) => (c.kind === "superlatives" ? c.items : [])),
      superlativeIdentity,
    ),
  }),
  "drawing-prompts": (contents) => ({
    kind: "drawing-prompts",
    items: contents.flatMap((c) => (c.kind === "drawing-prompts" ? c.items : [])),
  }),
} satisfies { [K in ContentKind]: Merger<K> };

/**
 * Items of `kind` from every payload, in order, deduped by that kind's identity (first
 * occurrence wins); payloads of other kinds are skipped.
 */
export function mergeContent(
  kind: ContentKind,
  contents: readonly GameContent[],
): GameContent {
  return CONTENT_MERGERS[kind](contents);
}

/**
 * Dedupes a single already-merged payload, for a content source that joins packs itself
 * (e.g. one SQL query across several pack ids) instead of combining separate payloads.
 */
export function dedupeContent(content: GameContent): GameContent {
  return CONTENT_MERGERS[content.kind]([content]);
}
