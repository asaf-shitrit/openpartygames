import { describe, expect, it } from "vitest";
import { flipOffsets, rankChanges } from "./flip";

describe("flipOffsets", () => {
  it("returns the delta from old top to new top for rows present in both", () => {
    const before = [
      { id: "a", top: 0 },
      { id: "b", top: 60 },
    ];
    const after = [
      { id: "b", top: 0 },
      { id: "a", top: 60 },
    ];
    const offsets = flipOffsets(before, after);
    expect(offsets).toEqual(
      expect.arrayContaining([
        { id: "a", dy: -60 },
        { id: "b", dy: 60 },
      ]),
    );
    expect(offsets).toHaveLength(2);
  });

  it("omits rows with no change", () => {
    const before = [{ id: "a", top: 0 }];
    const after = [{ id: "a", top: 0 }];
    expect(flipOffsets(before, after)).toEqual([]);
  });

  it("omits rows missing from before", () => {
    const before = [{ id: "a", top: 0 }];
    const after = [
      { id: "a", top: 0 },
      { id: "b", top: 60 },
    ];
    expect(flipOffsets(before, after)).toEqual([]);
  });
});

describe("rankChanges", () => {
  it("reports a positive change for a row that moved up", () => {
    const changes = rankChanges(["a", "b", "c"], ["b", "a", "c"]);
    expect(changes.b).toBe(1);
    expect(changes.a).toBe(-1);
    expect(changes.c).toBe(0);
  });

  it("omits ids missing from the before order", () => {
    const changes = rankChanges(["a"], ["a", "b"]);
    expect(changes.b).toBeUndefined();
  });
});
