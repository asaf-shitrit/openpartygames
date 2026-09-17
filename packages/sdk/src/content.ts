// Per-kind content merging, shared by in-memory sources and tests. A new content kind adds one
// entry here; the mapped type makes a missing entry a type error.
import type { ContentKind, ContentOf, GameContent } from "./types";

type Merger<K extends ContentKind> = (contents: readonly GameContent[]) => ContentOf<K>;

const CONTENT_MERGERS = {
  "word-pairs": (contents) => ({
    kind: "word-pairs",
    items: contents.flatMap((c) => (c.kind === "word-pairs" ? c.items : [])),
  }),
  facts: (contents) => ({
    kind: "facts",
    items: contents.flatMap((c) => (c.kind === "facts" ? c.items : [])),
  }),
  superlatives: (contents) => ({
    kind: "superlatives",
    items: contents.flatMap((c) => (c.kind === "superlatives" ? c.items : [])),
  }),
} satisfies { [K in ContentKind]: Merger<K> };

/** Items of `kind` from every payload, in order; payloads of other kinds are skipped. */
export function mergeContent(
  kind: ContentKind,
  contents: readonly GameContent[],
): GameContent {
  return CONTENT_MERGERS[kind](contents);
}
