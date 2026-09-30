import { minutesMatchLength } from "@opg/sdk/testing";
import { describe, expect, it } from "vitest";
import { doodleBluff } from "./index";
import {
  DRAW_MS,
  GALLERY_MS,
  REVEAL_MS,
  TITLE_MS,
  VOTE_MS,
  shownCount,
} from "./state";

/** A full table: one drawing window, every shown doodle's title and vote timers run out, then the gallery. */
const NOMINAL_MS =
  DRAW_MS +
  shownCount(doodleBluff.maxPlayers) * (TITLE_MS + VOTE_MS + REVEAL_MS) +
  GALLERY_MS;

describe("Doodle Bluff's advertised length", () => {
  it("is within 20% of what its phases add up to", () => {
    expect(minutesMatchLength(doodleBluff.minutes, NOMINAL_MS)).toBe(true);
  });

  it("would catch a game picker that promised 5 minutes", () => {
    expect(minutesMatchLength(5, NOMINAL_MS)).toBe(false);
  });
});
