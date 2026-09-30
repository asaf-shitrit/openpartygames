import { minutesMatchLength } from "@opg/sdk/testing";
import { describe, expect, it } from "vitest";
import { realOrNah } from "./index";
import { revealDurationMs } from "./reveal-plan";
import { FACTS_PER_GAME, VOTE_MS, WRITE_MS } from "./types";

/** A full table fools itself: every other player's lie fools someone, the longest reveal plan. */
const LONGEST_REVEAL_MS = revealDurationMs({
  lies: Array.from({ length: realOrNah.maxPlayers - 1 }, (_, index) => ({
    optionId: `o${index + 1}`,
    fooledCount: 1,
  })),
});

/** Every fact's write and vote timers run out, then the longest reveal. */
const NOMINAL_MS = FACTS_PER_GAME * (WRITE_MS + VOTE_MS + LONGEST_REVEAL_MS);

describe("Real or Nah's advertised length", () => {
  it("is within 20% of what its phases add up to", () => {
    expect(minutesMatchLength(realOrNah.minutes, NOMINAL_MS)).toBe(true);
  });

  it("would catch a game picker that promised 5 minutes", () => {
    expect(minutesMatchLength(5, NOMINAL_MS)).toBe(false);
  });
});
