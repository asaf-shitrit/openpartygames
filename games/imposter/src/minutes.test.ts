import { minutesMatchLength } from "@opg/sdk/testing";
import { describe, expect, it } from "vitest";
import { imposter } from "./index";
import {
  LAST_CHANCE_MS,
  REVEAL_MS,
  RESULT_CAUGHT_MS,
  VOTE_MS,
  WORD_CHECK_MS,
  WORDS_PER_GAME,
} from "./state";

/**
 * Clue turns have no timer (CLUE_STALL_MS is only a backstop for a lost tap), so the table sets
 * the pace. One short phrase and an "I'm done" tap: about ten seconds a turn.
 */
const TYPICAL_CLUE_TURN_MS = 10_000;

/** A full table, every word: clues all round, the vote runs out, the imposter is caught and guesses. */
const NOMINAL_MS =
  WORDS_PER_GAME *
  (WORD_CHECK_MS +
    imposter.maxPlayers * TYPICAL_CLUE_TURN_MS +
    VOTE_MS +
    REVEAL_MS +
    LAST_CHANCE_MS +
    RESULT_CAUGHT_MS);

describe("Imposter's advertised length", () => {
  it("is within 20% of what its phases add up to", () => {
    expect(minutesMatchLength(imposter.minutes, NOMINAL_MS)).toBe(true);
  });

  it("would catch a game picker that promised 5 minutes", () => {
    expect(minutesMatchLength(5, NOMINAL_MS)).toBe(false);
  });
});
