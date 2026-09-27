import { describe, expect, it } from "vitest";
import { APP_SCREEN_IDS } from "./app-screens";
import {
  SCREENS,
  casesFor,
  screenById,
  screenIdFromSearch,
  timingOf,
} from "./screens";
import type { AppCase, HostCase, PhoneCase, PreviewEntry, ScreenCase } from "./screens";

function isGameScreen(screen: ScreenCase): screen is HostCase | PhoneCase {
  return screen.kind === "game";
}

function isAppScreen(screen: ScreenCase): screen is AppCase {
  return screen.kind === "app";
}

const hostScreen = SCREENS.filter(isGameScreen).find((screen) => screen.surface === "host");
const phoneScreen = SCREENS.filter(isGameScreen).find((screen) => screen.surface === "phone");
const gameScreens = SCREENS.filter(isGameScreen);
const appScreens = SCREENS.filter(isAppScreen);

describe("SCREENS", () => {
  it("carries every game's previews, plus the app shell's own screens", () => {
    const games = new Set(SCREENS.map((screen) => screen.gameId));
    expect(games).toEqual(
      new Set(["doodle-bluff", "imposter", "most-likely-to", "real-or-nah", "app"]),
    );
  });

  it("gives every screen a unique id", () => {
    const ids = SCREENS.map((screen) => screen.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("matches each game screen's surface to the role of its room", () => {
    const mismatched = gameScreens
      .filter((screen) =>
        screen.surface === "host" ? screen.room.role !== "host" : screen.room.role !== "player",
      )
      .map(
        (screen) =>
          `${screen.id} "${screen.label}" is a ${screen.surface} on a ${screen.room.role} room`,
      );
    expect(mismatched).toEqual([]);
  });

  it("covers both surfaces for every game", () => {
    const missing = [...new Set(gameScreens.map((screen) => screen.gameId))].filter((gameId) => {
      const surfaces = new Set(
        gameScreens.filter((screen) => screen.gameId === gameId).map((screen) => screen.surface),
      );
      return !surfaces.has("host") || !surfaces.has("phone");
    });
    expect(missing).toEqual([]);
  });

  it("covers both surfaces for the app shell too", () => {
    const surfaces = new Set(appScreens.map((screen) => screen.surface));
    expect(surfaces.has("host")).toBe(true);
    expect(surfaces.has("phone")).toBe(true);
  });

  it("includes worst-case fixtures, which is what the layout suite is for", () => {
    const worstCase = SCREENS.filter((screen) => screen.label.includes("worst case"));
    expect(worstCase.length).toBeGreaterThan(0);
  });

  it("gives every app screen an appId app-screens.tsx actually renders", () => {
    const unregistered = appScreens
      .filter((screen) => !APP_SCREEN_IDS.includes(screen.appId))
      .map((screen) => screen.id);
    expect(unregistered).toEqual([]);
  });

  it("registers no app screen that nothing in screens.ts points to", () => {
    const used = new Set(appScreens.map((screen) => screen.appId));
    const orphaned = APP_SCREEN_IDS.filter((appId) => !used.has(appId));
    expect(orphaned).toEqual([]);
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

/**
 * Previews allowed to pin the gallery's clock to their phase start, each with the reason. Empty
 * on purpose: nothing has needed it yet, and an entry should have to argue for itself.
 */
const FROZEN_CLOCK_ALLOWED: Record<string, string> = {};

describe("no preview freezes its own ceremony", () => {
  /**
   * The gallery renders a screen at one fixed instant so a measurement cannot race a ticking
   * timer, and `timingOf` picks that instant as `timerStartedAt ?? serverNow`. A timed screen
   * resolves its own first beat the same way — `anchorAt` (packages/ui/src/moment/timeline.ts)
   * returns `timerStartedAt` when it is set, and `deadline - durationMs` when it is not.
   *
   * So a fixture that sets `timerStartedAt` makes those two values identical, `elapsed` comes
   * out as exactly 0, and the screen renders its intro beat no matter what the label promises.
   * That is not a subtle failure mode: it hid 25 previews across four games, including every
   * personal reveal card and both worst cases in two of them, and the layout suite happily
   * measured the same placeholder over and over for all of them.
   *
   * `distinct-previews.spec.ts` catches the version of this where two frozen previews collide,
   * but four previews each frozen on a *different* intro beat sail through it. This asks about
   * the cause instead of one of its symptoms, needs no browser, and cannot be fooled.
   *
   * Leaving `timerStartedAt` null costs nothing: `deadline` alone still drives the countdown,
   * and the beat anchor falls back to `deadline - durationMs`, which is the real phase start.
   */
  it("no game preview sets timerStartedAt", () => {
    // The listed entries are the failure message: each is `id "label"`, which is what a reader
    // needs to find the fixture. The why is in the describe comment above, because vitest's
    // `expect` takes no message argument.
    const frozen = gameScreens
      .filter((screen) => FROZEN_CLOCK_ALLOWED[screen.id] === undefined)
      .filter((screen) => (screen.room.game?.timerStartedAt ?? null) !== null)
      .map((screen) => `${screen.id} "${screen.label}" freezes its ceremony at elapsed 0`);
    expect(frozen).toEqual([]);
  });
});
