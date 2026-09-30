import { minutesMatchLength } from "@opg/sdk/testing";
import { describe, expect, it } from "vitest";
import { mostLikelyTo } from "./index";
import { REVEAL_MS, ROUNDS_PER_GAME, VOTE_MS } from "./state";

/** Every round's vote runs to its timer, then the fixed reveal. */
const NOMINAL_MS = ROUNDS_PER_GAME * (VOTE_MS + REVEAL_MS);

describe("Most Likely To's advertised length", () => {
  it("is within 20% of what its phases add up to", () => {
    expect(minutesMatchLength(mostLikelyTo.minutes, NOMINAL_MS)).toBe(true);
  });

  it("would catch a game picker that promised 5 minutes", () => {
    expect(minutesMatchLength(5, NOMINAL_MS)).toBe(false);
  });
});
