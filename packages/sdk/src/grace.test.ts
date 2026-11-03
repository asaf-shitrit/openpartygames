import { describe, expect, it } from "vitest";
import { LEFT_PLAYER_GRACE_MS, pullInDeadline, restoreDeadline } from "./grace";

describe("pullInDeadline", () => {
  it("shortens a far deadline to now plus the grace", () => {
    const state = { deadline: 100_000, tag: "x" };
    expect(pullInDeadline(state, 1_000)).toEqual({
      deadline: 1_000 + LEFT_PLAYER_GRACE_MS,
      graceRestore: { from: 1_000 + LEFT_PLAYER_GRACE_MS, to: 100_000 },
      tag: "x",
    });
  });

  it("sets the grace when the phase had no deadline", () => {
    expect(pullInDeadline({ deadline: null }, 5).deadline).toBe(
      5 + LEFT_PLAYER_GRACE_MS,
    );
  });

  it("never pushes a nearer deadline out, and returns the same object", () => {
    const state = { deadline: 3_000 };
    expect(pullInDeadline(state, 1_000)).toBe(state);
  });
});

describe("restoreDeadline", () => {
  it("gives the original deadline back after a pull-in", () => {
    const pulled = pullInDeadline({ deadline: 100_000 }, 1_000);
    expect(restoreDeadline(pulled, 3_000)).toEqual({ deadline: 100_000 });
  });

  it("restores a phase that had no deadline to none", () => {
    const pulled = pullInDeadline<{ deadline: number | null }>({ deadline: null }, 5);
    expect(restoreDeadline(pulled, 6).deadline).toBeNull();
  });

  it("returns the same object when nothing was pulled in", () => {
    const state = { deadline: 50_000 };
    expect(restoreDeadline(state, 1_000)).toBe(state);
  });

  it("keeps the grace when the original deadline has passed", () => {
    const pulled = pullInDeadline({ deadline: 5_000 }, 1_000);
    expect(restoreDeadline(pulled, 9_000)).toBe(pulled);
  });

  it("ignores a stale mark once the deadline moved on", () => {
    const pulled = pullInDeadline({ deadline: 100_000 }, 1_000);
    const next = { ...pulled, deadline: 200_000 };
    expect(restoreDeadline(next, 2_000)).toBe(next);
  });
});
