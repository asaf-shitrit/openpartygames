import { describe, expect, it } from "vitest";
import { revealDurationMs, revealPlan, RON_REVEAL, type RevealInput } from "./reveal-plan";

function lie(optionId: string, fooledCount: number) {
  return { optionId, fooledCount };
}

describe("revealDurationMs", () => {
  const cases: Array<[string, RevealInput, number]> = [
    ["no lies at all", { lies: [] }, 9500],
    ["one dud, no foolers", { lies: [lie("o1", 0)] }, 11500],
    ["two foolers with a dud", { lies: [lie("o1", 0), lie("o2", 1), lie("o3", 2)] }, 18500],
    [
      "three foolers, no duds",
      { lies: [lie("o1", 1), lie("o2", 2), lie("o3", 3)] },
      20000,
    ],
    [
      "eight foolers with a dud",
      {
        lies: [
          lie("dud", 0),
          lie("o1", 1),
          lie("o2", 2),
          lie("o3", 3),
          lie("o4", 4),
          lie("o5", 5),
          lie("o6", 6),
          lie("o7", 7),
          lie("o8", 8),
        ],
      },
      29996,
    ],
    [
      "eight foolers, no duds",
      {
        lies: [
          lie("o1", 1),
          lie("o2", 2),
          lie("o3", 3),
          lie("o4", 4),
          lie("o5", 5),
          lie("o6", 6),
          lie("o7", 7),
          lie("o8", 8),
        ],
      },
      29996,
    ],
  ];

  it.each(cases)("%s -> %ims", (_name, input, expected) => {
    expect(revealDurationMs(input)).toBe(expected);
    expect(revealDurationMs(input)).toBeLessThanOrEqual(RON_REVEAL.capMs);
  });
});

describe("revealPlan", () => {
  it("has no duds segment when nothing fooled nobody", () => {
    const plan = revealPlan({ lies: [lie("o1", 1)] });
    expect(plan.map((s) => s.kind)).toEqual(["intro", "lie", "truth", "standings"]);
  });

  it("includes a duds segment only when a lie fooled nobody", () => {
    const plan = revealPlan({ lies: [lie("dud", 0), lie("o1", 1)] });
    expect(plan.map((s) => s.kind)).toEqual(["intro", "duds", "lie", "truth", "standings"]);
  });

  it("orders foolers by fooled count ascending, ties broken by optionId", () => {
    const plan = revealPlan({
      lies: [lie("b", 2), lie("a", 2), lie("c", 1)],
    });
    const lieSegments = plan.filter((s) => s.kind === "lie");
    expect(lieSegments.map((s) => s.optionId)).toEqual(["c", "a", "b"]);
  });

  it("keeps atMs contiguous with each segment's own durationMs", () => {
    const plan = revealPlan({ lies: [lie("dud", 0), lie("o1", 1), lie("o2", 3)] });
    let expectedAt = 0;
    for (const segment of plan) {
      expect(segment.atMs).toBe(expectedAt);
      expectedAt += segment.durationMs;
    }
    expect(revealDurationMs({ lies: [lie("dud", 0), lie("o1", 1), lie("o2", 3)] })).toBe(
      expectedAt,
    );
  });

  it("clamps perLie at the minimum with many foolers", () => {
    const many = Array.from({ length: 8 }, (_, i) => lie(`o${i}`, i + 1));
    const plan = revealPlan({ lies: many });
    const lieSegments = plan.filter((s) => s.kind === "lie");
    for (const segment of lieSegments)
      expect(segment.durationMs).toBeGreaterThanOrEqual(RON_REVEAL.minLieMs);
  });

  it("clamps perLie at the maximum with a single fooler", () => {
    const plan = revealPlan({ lies: [lie("o1", 1)] });
    const lieSegment = plan.find((s) => s.kind === "lie");
    expect(lieSegment?.durationMs).toBe(RON_REVEAL.lieMs);
  });

  it("only gives lie segments an optionId", () => {
    const plan = revealPlan({ lies: [lie("dud", 0), lie("o1", 1)] });
    const optionIds = plan.map((segment) => segment.optionId);
    expect(optionIds).toEqual([null, null, "o1", null, null]);
  });
});
