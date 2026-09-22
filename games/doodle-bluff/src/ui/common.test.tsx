// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import type { PlayerSummary } from "@opg/protocol";
import { en, he } from "@opg/i18n";
import { avatarOf, drawingLabel, findPlayer, nameOf } from "./common";

const PLAYERS: PlayerSummary[] = [
  {
    id: "dov",
    name: "Dov",
    avatar: "toast",
    connected: true,
    isVip: false,
    crowns: 0,
    waitingForNextGame: false,
  },
  {
    id: "maya",
    name: "Maya",
    avatar: "star",
    connected: true,
    isVip: true,
    crowns: 1,
    waitingForNextGame: false,
  },
];

describe("findPlayer", () => {
  it("finds a player by id", () => {
    expect(findPlayer(PLAYERS, "dov")).toEqual(PLAYERS[0]);
  });

  it("returns null for a null id", () => {
    expect(findPlayer(PLAYERS, null)).toBeNull();
  });

  it("returns null for an id not in the roster", () => {
    expect(findPlayer(PLAYERS, "zed")).toBeNull();
  });
});

describe("nameOf", () => {
  it("returns the player's name", () => {
    expect(nameOf(PLAYERS, "dov", en.common.someone)).toBe("Dov");
  });

  it("falls back to the someone fallback for an unknown id", () => {
    expect(nameOf(PLAYERS, "zed", en.common.someone)).toBe("Someone");
  });

  it("falls back to the someone fallback for a null id", () => {
    expect(nameOf(PLAYERS, null, en.common.someone)).toBe("Someone");
  });
});

describe("avatarOf", () => {
  it("returns the player's avatar", () => {
    expect(avatarOf(PLAYERS, "maya")).toBe("star");
  });

  it("returns null for an unknown id", () => {
    expect(avatarOf(PLAYERS, "zed")).toBeNull();
  });

  it("returns null for a null id", () => {
    expect(avatarOf(PLAYERS, null)).toBeNull();
  });
});

describe("drawingLabel", () => {
  it("names whose drawing it is, in English", () => {
    expect(drawingLabel(en, "Dov")).toBe("Dov's drawing");
  });

  it("names whose drawing it is, in Hebrew", () => {
    expect(drawingLabel(he, "דוב")).toBe("הציור של דוב");
  });
});
