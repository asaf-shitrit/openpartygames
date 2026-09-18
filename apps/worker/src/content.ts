import type { Rating } from "@opg/protocol";
import { dedupeContent } from "@opg/sdk";
import type {
  ContentKind,
  ContentOf,
  ContentSource,
  Fact,
  GameContent,
  PackMeta,
  Superlative,
  WordPair,
} from "@opg/sdk";

/** A row of the `packs` table, as selected by PACKS_SQL. */
export interface PackRow {
  id: string;
  name: string;
  kind: ContentKind;
  rating: Rating;
  language: string;
  item_count: number;
}

/** A row of `pack_items`, as selected by itemsSql. */
export interface ItemRow {
  data: string;
}

export const PACKS_SQL =
  "SELECT id, name, kind, rating, language, item_count FROM packs ORDER BY id";

/** Item query for the enabled packs of one game kind, in a stable order. */
export function itemsSql(packIds: string[]): string {
  const placeholders = packIds.map(() => "?").join(", ");
  return `SELECT i.data AS data
            FROM pack_items i
            JOIN packs p ON p.id = i.pack_id
           WHERE i.pack_id IN (${placeholders}) AND p.kind = ?
           ORDER BY i.pack_id, i.idx`;
}

/** Bind values for itemsSql: the pack ids, then the kind. */
export function itemsParams(packIds: string[], kind: ContentKind): string[] {
  return [...packIds, kind];
}

/** The two row queries the content source needs; the Worker backs them with D1, tests with memory. */
export interface PackReader {
  packs(): Promise<PackRow[]>;
  items(packIds: string[], kind: ContentKind): Promise<ItemRow[]>;
}

/** Content access over a PackReader: pack catalog in, merged game items out. */
export function createContentSource(reader: PackReader): ContentSource {
  return {
    async listPacks(): Promise<PackMeta[]> {
      return (await reader.packs()).map(toPackMeta);
    },

    async loadContent(
      kind: ContentKind,
      packIds: string[],
    ): Promise<GameContent> {
      // No enabled packs: skip the query, the game start fails on empty content.
      if (packIds.length === 0) return contentFromRows(kind, []);
      // Enabled packs can share an item (a duplicate isn't caught by per-pack validation);
      // dedupe here so a game never draws the same round twice. Rows come back ordered by
      // pack id (itemsSql), so the surviving copy is deterministic for a given pack selection.
      return dedupeContent(contentFromRows(kind, await reader.items(packIds, kind)));
    },
  };
}

function toPackMeta(row: PackRow): PackMeta {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    rating: row.rating,
    language: row.language,
    itemCount: row.item_count,
  };
}

/** Rows to a content payload, one entry per kind; a missing kind is a type error. */
const CONTENT_FROM_ROWS = {
  "word-pairs": (rows) => ({ kind: "word-pairs", items: rows.map(wordPairFromRow) }),
  facts: (rows) => ({ kind: "facts", items: rows.map(factFromRow) }),
  superlatives: (rows) => ({
    kind: "superlatives",
    items: rows.map(superlativeFromRow),
  }),
} satisfies { [K in ContentKind]: (rows: ItemRow[]) => ContentOf<K> };

function contentFromRows(kind: ContentKind, rows: ItemRow[]): GameContent {
  return CONTENT_FROM_ROWS[kind](rows);
}

function wordPairFromRow(row: ItemRow): WordPair {
  const item = parseItem(row.data);
  if ("crew" in item) return item;
  throw new Error("pack item is not a word pair");
}

function factFromRow(row: ItemRow): Fact {
  const item = parseItem(row.data);
  if ("answer" in item) return item;
  throw new Error("pack item is not a fact");
}

function superlativeFromRow(row: ItemRow): Superlative {
  const item = parseItem(row.data);
  if ("prompt" in item && !("answer" in item)) return item;
  throw new Error("pack item is not a superlative");
}

/** Parses one pack item; malformed JSON aborts the game start (fail loudly). */
function parseItem(data: string): WordPair | Fact | Superlative {
  try {
    const item: WordPair | Fact | Superlative = JSON.parse(data);
    return item;
  } catch {
    throw new Error("pack item is not valid JSON");
  }
}
