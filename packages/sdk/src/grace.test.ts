import { describe, expect, it } from "vitest";
import { LEFT_PLAYER_GRACE_MS, pullInDeadline } from "./grace";

describe("pullInDeadline", () => {
  it("shortens a far deadline to now plus the grace", () => {
    const state = { deadline: 100_000, tag: "x" };
    expect(pullInDeadline(state, 1_000)).toEqual({
      deadline: 1_000 + LEFT_PLAYER_GRACE_MS,
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
