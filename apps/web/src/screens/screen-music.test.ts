import { describe, expect, it } from "vitest";
import { screenMusic } from "./screen-music";
import { makeHostView } from "./fixtures/room";

describe("screenMusic", () => {
  it("claims the lobby loop on the join screen", () => {
    expect(screenMusic(makeHostView({ lobbyScreen: "join" }))).toBe("lobby");
  });

  it("claims the lobby loop on the game-pick screen", () => {
    expect(screenMusic(makeHostView({ lobbyScreen: "pick" }))).toBe("lobby");
  });

  it("claims nothing on the results screen", () => {
    expect(screenMusic(makeHostView({ lobbyScreen: "results" }))).toBeNull();
  });

  it("claims nothing while starting", () => {
    expect(screenMusic(makeHostView({ phase: "starting" }))).toBeNull();
  });

  it("claims nothing in-game, leaving it to the game", () => {
    expect(screenMusic(makeHostView({ phase: "in-game" }))).toBeNull();
  });
});
