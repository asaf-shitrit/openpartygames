// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import type { PlayerSummary } from "@opg/protocol";
import { avatarOf, findPlayer, nameOf } from "./common";

const MAYA: PlayerSummary = {
  id: "maya",
  name: "Maya",
  avatar: "star",
  connected: true,
  isVip: false,
  crowns: 0,
  waitingForNextGame: false,
};

const PLAYERS = [MAYA];

describe("findPlayer", () => {
  it("finds a player by id", () => {
    expect(findPlayer(PLAYERS, "maya")).toEqual(MAYA);
  });

  it("is null for an id with no match", () => {
    expect(findPlayer(PLAYERS, "ghost")).toBeNull();
  });

  it("is null for a null id", () => {
    expect(findPlayer(PLAYERS, null)).toBeNull();
  });
});

describe("nameOf", () => {
  it("returns the matched player's name", () => {
    expect(nameOf(PLAYERS, "maya")).toBe("Maya");
  });

  it("falls back to the raw id when nobody matches", () => {
    expect(nameOf(PLAYERS, "ghost")).toBe("ghost");
  });

  it("falls back to 'Someone' for a null id", () => {
    expect(nameOf(PLAYERS, null)).toBe("Someone");
  });
});

describe("avatarOf", () => {
  it("returns the matched player's avatar", () => {
    expect(avatarOf(PLAYERS, "maya")).toBe("star");
  });

  it("is null when nobody matches", () => {
    expect(avatarOf(PLAYERS, "ghost")).toBeNull();
  });
});
