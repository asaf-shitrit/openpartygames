import { describe, expect, it } from "vitest";
import {
  DAILY_ROOM_SQL,
  dailyRoomParams,
  matchParams,
  MATCH_STATS_SQL,
  withinCap,
} from "./stats";

describe("withinCap", () => {
  it("is true while the conditional upsert returns a row", () => {
    expect(withinCap([{ count: 1 }])).toBe(true);
  });

  it("is false when the cap denied the day (no row written)", () => {
    expect(withinCap([])).toBe(false);
  });

  it("counts the day with one atomic upsert that can refuse to increment", () => {
    expect(DAILY_ROOM_SQL).toContain("ON CONFLICT(day) DO UPDATE");
    expect(DAILY_ROOM_SQL).toContain("WHERE daily_rooms.count < ?");
    expect(dailyRoomParams("2026-09-11", 150)).toEqual(["2026-09-11", 150]);
  });
});

describe("matchParams", () => {
  it("binds the finished game and stores completed as 1/0", () => {
    expect(
      matchParams({
        gameId: "imposter",
        playerCount: 5,
        durationMs: 90_000,
        completed: true,
        finishedAt: 1_700_000_000_000,
      }),
    ).toEqual(["imposter", 5, 90_000, 1, 1_700_000_000_000]);

    expect(
      matchParams({
        gameId: "real-or-nah",
        playerCount: 3,
        durationMs: 1,
        completed: false,
        finishedAt: 2,
      }),
    ).toEqual(["real-or-nah", 3, 1, 0, 2]);
    expect(MATCH_STATS_SQL).toContain("INTO match_stats");
  });
});
