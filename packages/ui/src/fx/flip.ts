// Pure FLIP (First-Last-Invert-Play) math for standings rows moving to their new rank.

export interface RowBox {
  id: string;
  top: number;
}

/** For each id present in both, the y delta to apply so the row starts at its old place. */
export function flipOffsets(
  before: readonly RowBox[],
  after: readonly RowBox[],
): Array<{ id: string; dy: number }> {
  const beforeTops = new Map(before.map((row) => [row.id, row.top]));
  const offsets: Array<{ id: string; dy: number }> = [];
  for (const row of after) {
    const previousTop = beforeTops.get(row.id);
    if (previousTop === undefined) continue;
    const dy = previousTop - row.top;
    if (dy === 0) continue;
    offsets.push({ id: row.id, dy });
  }
  return offsets;
}

/** Rank change per id: positive = moved up. */
export type RankChanges = Record<string, number>;

export function rankChanges(
  beforeOrder: readonly string[],
  afterOrder: readonly string[],
) {
  const beforeIndex = new Map(beforeOrder.map((id, index) => [id, index]));
  const changes: RankChanges = {};
  afterOrder.forEach((id, afterIdx) => {
    const beforeIdx = beforeIndex.get(id);
    if (beforeIdx === undefined) return;
    changes[id] = beforeIdx - afterIdx;
  });
  return changes;
}
