import { minutesMatchLength } from "@opg/sdk/testing";
import { describe, expect, it } from "vitest";
import { sketchPhone } from "./index";
import { DESCRIBE_MS, DRAW_MS, FAVOURITE_MS, PRESENT_MS, VOTE_MS, WRITE_MS } from "./state";
import { stepKind, transferRounds, chainLength } from "@opg/sdk";

/** Every phase runs to its deadline once, at a full table. */
function nominalMs(players: number): number {
  let total = WRITE_MS;
  for (let round = 1; round <= transferRounds(players); round += 1) {
    total += stepKind(round) === "drawing" ? DRAW_MS : DESCRIBE_MS;
  }
  total += players * (chainLength(players) * PRESENT_MS + VOTE_MS + FAVOURITE_MS);
  return total;
}

describe("Sketch Phone's advertised length", () => {
  it("is within 20% of what its phases add up to at eight players", () => {
    expect(sketchPhone.minutes).toBe(15);
    expect(minutesMatchLength(sketchPhone.minutes, nominalMs(sketchPhone.maxPlayers))).toBe(true);
  });

  it("would catch a game picker that promised 5 minutes", () => {
    expect(minutesMatchLength(5, nominalMs(sketchPhone.maxPlayers))).toBe(false);
  });
});
