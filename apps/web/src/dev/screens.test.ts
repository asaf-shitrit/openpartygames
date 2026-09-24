import { describe, expect, it } from "vitest";
import {
  SCREENS,
  casesFor,
  screenById,
  screenIdFromSearch,
  timingOf,
} from "./screens";
import type { PreviewEntry } from "./screens";

const hostScreen = SCREENS.find((screen) => screen.surface === "host");
const phoneScreen = SCREENS.find((screen) => screen.surface === "phone");

describe("SCREENS", () => {
  it("carries every game's previews", () => {
    const games = new Set(SCREENS.map((screen) => screen.gameId));
    expect(games).toEqual(
      new Set(["doodle-bluff", "imposter", "most-likely-to", "real-or-nah"]),
    );
  });

  it("gives every screen a unique id", () => {
    const ids = SCREENS.map((screen) => screen.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("matches each screen's surface to the role of its room", () => {
    const mismatched = SCREENS.filter((screen) =>
      screen.surface === "host" ? screen.room.role !== "host" : screen.room.role !== "player",
    ).map((screen) => `${screen.id} "${screen.label}" is a ${screen.surface} on a ${screen.room.role} room`);
    expect(mismatched).toEqual([]);
  });

  it("covers both surfaces for every game", () => {
    const missing = [...new Set(SCREENS.map((screen) => screen.gameId))].filter((gameId) => {
      const surfaces = new Set(
        SCREENS.filter((screen) => screen.gameId === gameId).map((screen) => screen.surface),
      );
      return !surfaces.has("host") || !surfaces.has("phone");
    });
    expect(missing).toEqual([]);
  });

  it("includes worst-case fixtures, which is what the layout suite is for", () => {
    const worstCase = SCREENS.filter((screen) => screen.label.includes("worst case"));
    expect(worstCase.length).toBeGreaterThan(0);
  });
});

describe("screenById", () => {
  it("finds a screen by its id", () => {
    const first = SCREENS[0];
    expect(first).toBeDefined();
    expect(screenById(first?.id ?? "")).toBe(first);
  });

  it("returns null for an id nothing has", () => {
    expect(screenById("imposter/9999")).toBeNull();
  });
});

describe("screenIdFromSearch", () => {
  it("reads the id parameter", () => {
    expect(screenIdFromSearch("?id=imposter/3")).toBe("imposter/3");
  });

  it("is null when the query carries none", () => {
    expect(screenIdFromSearch("")).toBeNull();
    expect(screenIdFromSearch("?other=1")).toBeNull();
  });
});

describe("casesFor", () => {
  it("keeps a preview whose room matches its surface", () => {
    expect(hostScreen).toBeDefined();
    if (hostScreen === undefined) return;
    const preview: PreviewEntry = {
      label: hostScreen.label,
      surface: "host",
      view: hostScreen.view,
      room: hostScreen.room,
    };
    expect(casesFor("imposter", [preview])).toHaveLength(1);
  });

  it("drops a preview whose room disagrees with its surface", () => {
    expect(phoneScreen).toBeDefined();
    if (phoneScreen === undefined) return;
    // A phone fixture labelled as a host screen: the gallery must never be handed this.
    const mismatched: PreviewEntry = {
      label: phoneScreen.label,
      surface: "host",
      view: phoneScreen.view,
      room: phoneScreen.room,
    };
    expect(casesFor("imposter", [mismatched])).toEqual([]);
  });

  it("numbers cases by their place in the game's previews", () => {
    expect(hostScreen).toBeDefined();
    if (hostScreen === undefined) return;
    const preview: PreviewEntry = {
      label: hostScreen.label,
      surface: "host",
      view: hostScreen.view,
      room: hostScreen.room,
    };
    expect(casesFor("real-or-nah", [preview, preview])[1]?.id).toBe("real-or-nah/1");
  });
});

describe("timingOf", () => {
  it("takes the deadline, timer start and stage from the running game", () => {
    expect(phoneScreen).toBeDefined();
    if (phoneScreen === undefined) return;
    const game = phoneScreen.room.game;
    expect(game).not.toBeNull();
    const timing = timingOf(phoneScreen.room);
    expect(timing.deadline).toBe(game?.deadline ?? null);
    expect(timing.timerStartedAt).toBe(game?.timerStartedAt ?? null);
    expect(timing.stage).toBe(game?.stage ?? null);
  });

  it("falls back to the room's own clock when nothing is running", () => {
    expect(phoneScreen).toBeDefined();
    if (phoneScreen === undefined) return;
    const timing = timingOf({ ...phoneScreen.room, game: null });
    expect(timing).toEqual({
      deadline: null,
      timerStartedAt: null,
      stage: null,
      anchor: phoneScreen.room.serverNow,
    });
  });

  it("anchors on the room clock when a game is running without a timer", () => {
    expect(phoneScreen).toBeDefined();
    if (phoneScreen === undefined) return;
    const game = phoneScreen.room.game;
    if (game === null) return;
    const untimed = { ...phoneScreen.room, game: { ...game, timerStartedAt: null } };
    expect(timingOf(untimed).anchor).toBe(phoneScreen.room.serverNow);
  });
});
