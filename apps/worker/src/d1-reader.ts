import type { ContentKind } from "@opg/sdk";
import {
  itemsParams,
  itemsSql,
  PACKS_SQL,
  type ItemRow,
  type PackReader,
  type PackRow,
} from "./content";

/**
 * The D1-backed PackReader. Each row query declares the shape its own migration
 * writes (`packs`, `pack_items`), so no row is trusted beyond that shape here.
 */
export function createD1PackReader(db: D1Database): PackReader {
  return {
    async packs(): Promise<PackRow[]> {
      const { results } = await db.prepare(PACKS_SQL).all<PackRow>();
      return results;
    },

    async items(
      packIds: string[],
      kind: ContentKind,
    ): Promise<ItemRow[]> {
      const { results } = await db
        .prepare(itemsSql(packIds))
        .bind(...itemsParams(packIds, kind))
        .all<ItemRow>();
      return results;
    },
  };
}