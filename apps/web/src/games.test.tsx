import { describe, expect, it } from "vitest";
import { imposter } from "@opg/game-imposter";
import { mostLikelyTo } from "@opg/game-most-likely-to";
import { realOrNah } from "@opg/game-real-or-nah";
import {
  awardCopyFor,
  gameIconFor,
  gameUiFor,
  LANDING_GAMES,
} from "./games";

describe("gameIconFor", () => {
  it("returns the icon for imposter", () => {
    expect(gameIconFor("imposter")).toBe("mask");
  });

  it("returns the icon for real-or-nah", () => {
    expect(gameIconFor("real-or-nah")).toBe("cards");
  });

  it("returns the icon for most-likely-to", () => {
    expect(gameIconFor("most-likely-to")).toBe("point");
  });

  it("falls back to cards for an unknown id", () => {
    expect(gameIconFor("some-future-game")).toBe("cards");
  });
});

describe("LANDING_GAMES", () => {
  it("has a unique id for every game", () => {
    const ids = LANDING_GAMES.map((game) => game.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("registry", () => {
  const definitions = [imposter, realOrNah, mostLikelyTo];

  it.each(definitions)("registers screens for $id", (game) => {
    expect(gameUiFor(game.id)).not.toBeNull();
  });

  it.each(definitions)("keeps $id landing details in step with its rules", (game) => {
    const landing = LANDING_GAMES.find((entry) => entry.id === game.id);
    expect(landing).toMatchObject({
      name: game.name,
      minPlayers: game.minPlayers,
      maxPlayers: game.maxPlayers,
      minutes: game.minutes,
    });
  });

  it("describes Most Likely To awards", () => {
    expect(
      awardCopyFor("most-likely-to", {
        id: "crowd-reader",
        playerIds: ["maya"],
        value: 4,
      }),
    ).toEqual({ title: "Crowd reader", detail: "Read the room 4 times" });
  });
});
