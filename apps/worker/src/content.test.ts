import { describe, expect, it } from "vitest";
import type { ContentKind } from "@opg/sdk";
import {
  createContentSource,
  itemsParams,
  itemsSql,
  PACKS_SQL,
  type ItemRow,
  type PackReader,
  type PackRow,
} from "./content";

const packRows: PackRow[] = [
  {
    id: "starter",
    name: "Starter",
    kind: "word-pairs",
    rating: "family",
    language: "en",
    item_count: 2,
  },
];

interface ItemCall {
  packIds: string[];
  kind: ContentKind;
}

interface ReaderFixture {
  reader: PackReader;
  itemCalls: ItemCall[];
}

/** A reader over canned rows that records every item query. */
function reader(
  rowsFor: (packIds: string[], kind: ContentKind) => ItemRow[],
  packs: PackRow[] = packRows,
): ReaderFixture {
  const itemCalls: ItemCall[] = [];
  return {
    reader: {
      packs: async () => packs,
      items: async (packIds, kind) => {
        itemCalls.push({ packIds, kind });
        return rowsFor(packIds, kind);
      },
    },
    itemCalls,
  };
}

function rowsOf(...items: object[]): ItemRow[] {
  return items.map((item) => ({ data: JSON.stringify(item) }));
}

describe("createContentSource.listPacks", () => {
  it("maps pack rows to the pack summary", async () => {
    const { reader: source } = reader(() => []);
    expect(await createContentSource(source).listPacks()).toEqual([
      {
        id: "starter",
        name: "Starter",
        kind: "word-pairs",
        rating: "family",
        language: "en",
        itemCount: 2,
      },
    ]);
    expect(PACKS_SQL).toContain("FROM packs");
  });
});

describe("createContentSource.loadContent", () => {
  it("merges word pairs from the enabled packs in query order", async () => {
    const { reader: source, itemCalls } = reader(() =>
      rowsOf(
        { crew: "giraffe", decoy: "zebra" },
        { crew: "otter", decoy: "seal" },
      ),
    );

    const content = await createContentSource(source).loadContent("word-pairs", [
      "a",
      "b",
    ]);

    expect(content).toEqual({
      kind: "word-pairs",
      items: [
        { crew: "giraffe", decoy: "zebra" },
        { crew: "otter", decoy: "seal" },
      ],
    });
    expect(itemCalls).toEqual([{ packIds: ["a", "b"], kind: "word-pairs" }]);
  });

  it("merges facts", async () => {
    const { reader: source } = reader(() =>
      rowsOf({
        id: "crow",
        prompt: "A group of crows is called a ____.",
        answer: "murder",
        alternates: [],
        decoys: ["flock", "parade"],
        source: { title: "Crow", url: "https://example.com/crow" },
      }),
    );

    const content = await createContentSource(source).loadContent("facts", ["a"]);

    expect(content.kind).toBe("facts");
    expect(content.items).toHaveLength(1);
  });

  it("merges superlatives", async () => {
    const { reader: source, itemCalls } = reader(() =>
      rowsOf({ id: "cats", prompt: "adopt a dozen cats" }),
    );

    const content = await createContentSource(source).loadContent(
      "superlatives",
      ["everyday"],
    );

    expect(content).toEqual({
      kind: "superlatives",
      items: [{ id: "cats", prompt: "adopt a dozen cats" }],
    });
    expect(itemCalls).toEqual([
      { packIds: ["everyday"], kind: "superlatives" },
    ]);
  });

  it("returns empty superlatives without a query when no pack is enabled", async () => {
    const { reader: source, itemCalls } = reader(() => rowsOf());

    expect(
      await createContentSource(source).loadContent("superlatives", []),
    ).toEqual({ kind: "superlatives", items: [] });
    expect(itemCalls).toEqual([]);
  });

  it("does not load a superlative as a fact", async () => {
    const { reader: source } = reader(() =>
      rowsOf({ id: "cats", prompt: "adopt a dozen cats" }),
    );

    await expect(
      createContentSource(source).loadContent("facts", ["a"]),
    ).rejects.toThrow("pack item is not a fact");
  });

  it.each([
    { crew: "cat", decoy: "dog" },
    {
      id: "crow",
      prompt: "A group of crows is called a ____.",
      answer: "murder",
      alternates: [],
      decoys: [],
      source: { title: "Crow", url: "https://example.com/crow" },
    },
  ])("does not load %j as a superlative", async (item) => {
    const { reader: source } = reader(() => rowsOf(item));

    await expect(
      createContentSource(source).loadContent("superlatives", ["a"]),
    ).rejects.toThrow("pack item is not a superlative");
  });

  it("skips the query when no pack is enabled", async () => {
    const { reader: source, itemCalls } = reader(() => rowsOf());

    expect(await createContentSource(source).loadContent("facts", [])).toEqual({
      kind: "facts",
      items: [],
    });
    expect(itemCalls).toEqual([]);
  });

  it("throws on malformed item JSON so the room can abort the start", async () => {
    const { reader: source } = reader(() => [{ data: "not json" }]);

    await expect(
      createContentSource(source).loadContent("facts", ["a"]),
    ).rejects.toThrow("pack item is not valid JSON");
  });

  it("does not load a superlative as a word pair", async () => {
    const { reader: source } = reader(() =>
      rowsOf({ id: "cats", prompt: "adopt a dozen cats" }),
    );

    await expect(
      createContentSource(source).loadContent("word-pairs", ["a"]),
    ).rejects.toThrow("pack item is not a word pair");
  });

  it("throws when an item is not the shape its kind needs", async () => {
    const { reader: source } = reader(() => rowsOf({ crew: "cat", decoy: "dog" }));

    await expect(
      createContentSource(source).loadContent("facts", ["a"]),
    ).rejects.toThrow("pack item is not a fact");
  });

  it("builds the item query with one placeholder per pack", () => {
    expect(itemsSql(["a", "b"])).toContain("IN (?, ?)");
    expect(itemsSql(["a"])).toContain("p.kind = ?");
    expect(itemsParams(["a", "b"], "facts")).toEqual(["a", "b", "facts"]);
  });
});