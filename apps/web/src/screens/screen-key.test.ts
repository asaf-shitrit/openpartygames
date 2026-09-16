import { describe, expect, it } from "vitest";
import { screenKey } from "./screen-key";
import { makeGame, makeHostView } from "./fixtures/room";

describe("screenKey", () => {
  it("keys the join and pick lobby screens", () => {
    expect(screenKey(makeHostView({ lobbyScreen: "join" }))).toBe(
      "lobby:join",
    );
    expect(screenKey(makeHostView({ lobbyScreen: "pick" }))).toBe(
      "lobby:pick",
    );
  });

  it("keys the results lobby screen", () => {
    expect(screenKey(makeHostView({ lobbyScreen: "results" }))).toBe(
      "lobby:results",
    );
  });

  it("keys the starting phase regardless of lobby screen", () => {
    expect(
      screenKey(makeHostView({ phase: "starting", lobbyScreen: "pick" })),
    ).toBe("starting");
  });

  it("keys an in-game phase by the running game's id", () => {
    const view = makeHostView({
      phase: "in-game",
      game: { id: "imposter", view: {}, deadline: null, timerStartedAt: null },
    });
    expect(screenKey(view)).toBe("game:imposter");
  });

  it("falls back to the selected game id when the game view has not landed yet", () => {
    const view = makeHostView({
      phase: "in-game",
      selectedGameId: "real-or-nah",
      games: [makeGame({ id: "real-or-nah" })],
    });
    expect(screenKey(view)).toBe("game:real-or-nah");
  });
});
