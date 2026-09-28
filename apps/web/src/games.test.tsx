import { en, he } from "@opg/i18n";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { imposter } from "@opg/game-imposter";
import { mostLikelyTo } from "@opg/game-most-likely-to";
import { doodleBluff } from "@opg/game-doodle-bluff";
import { realOrNah } from "@opg/game-real-or-nah";
import type { GameUi } from "@opg/ui";
import {
  awardCopyFor,
  gameIconFor,
  gameUiFor,
  LANDING_GAMES,
  preloadGameUi,
  registerGame,
} from "./games";
import { makePlayerView } from "./screens/fixtures/room";

afterEach(cleanup);

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

  it("gives every game its own avatar, so no two cards look alike", () => {
    const avatars = LANDING_GAMES.map((game) => game.avatar);
    expect(new Set(avatars).size).toBe(avatars.length);
  });
});

describe("registry", () => {
  const definitions = [imposter, realOrNah, mostLikelyTo, doodleBluff];

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

  // awardCopy reads from the game's `/ui` module, which now loads lazily — so, unlike before
  // code splitting, it is only guaranteed to answer once that module has loaded. In the app
  // this happens naturally (the game's Host/Phone rendered during play); here we drive it
  // explicitly with preloadGameUi, the seam built for exactly this.
  it("describes Most Likely To awards", async () => {
    await preloadGameUi("most-likely-to");
    expect(
      awardCopyFor(
        "most-likely-to",
        { id: "crowd-reader", playerIds: ["maya"], value: 4 },
        en,
      ),
    ).toEqual({ title: "Crowd reader", detail: "Read the room 4 times" });
  });

  it("describes them in the reader's language", async () => {
    await preloadGameUi("most-likely-to");
    expect(
      awardCopyFor(
        "most-likely-to",
        { id: "crowd-reader", playerIds: ["maya"], value: 4 },
        he,
      ),
    ).toEqual({ title: "קורא/ת קהל", detail: "קרא/ה את החדר 4 פעמים" });
  });
});

describe("awardCopy before a game's ui has loaded", () => {
  it("returns null instead of crashing", async () => {
    // A fresh registerGame with a loader that never resolves: models a device that reaches
    // the finale without this game's Host/Phone ever having rendered in this session (e.g. a
    // reconnect straight into the results screen, before anything preloads it).
    const registered = registerGame({
      loadUi: () => new Promise<typeof stubUi>(() => {}),
      hostViewSchema: stubHostViewSchema,
      playerViewSchema: stubPlayerViewSchema,
    });
    expect(
      registered.ui.awardCopy?.({ id: "crowd-reader", playerIds: [], value: 1 }, en),
    ).toBeNull();
  });
});

const stubHostViewSchema = z.object({ secretWord: z.string() });
const stubPlayerViewSchema = z.object({ myWord: z.string() });

const stubUi: GameUi<
  z.infer<typeof stubHostViewSchema>,
  z.infer<typeof stubPlayerViewSchema>,
  { t: "noop" }
> = {
  Host: () => null,
  Phone: (props) => (
    <div data-testid="stage">{JSON.stringify(props.stage)}</div>
  ),
};

type StubStage = null | { secretWord: string } | { mismatchedFields: boolean };

// registerGame now loads the game's ui lazily (behind Suspense), even for this in-memory
// stub, so a render only shows the real content once that microtask resolves — hence
// `findByTestId` (which waits) rather than `getByTestId` (which does not) below.
function renderStubPhone(stage: StubStage) {
  const registered = registerGame({
    loadUi: () => Promise.resolve(stubUi),
    hostViewSchema: stubHostViewSchema,
    playerViewSchema: stubPlayerViewSchema,
  });
  const room = makePlayerView();
  render(
    <registered.ui.Phone
      view={{ myWord: "cat" }}
      room={room}
      deadline={null}
      timerStartedAt={null}
      clock={{ now: () => 0 }}
      send={() => {}}
      stage={stage}
    />,
  );
}

describe("registerGame's stage parsing", () => {
  it("passes null straight through in a shared-screen room", async () => {
    renderStubPhone(null);
    expect((await screen.findByTestId("stage")).textContent).toBe("null");
  });

  it("parses a valid stage with the game's own host view schema", async () => {
    renderStubPhone({ secretWord: "otter" });
    expect((await screen.findByTestId("stage")).textContent).toBe(
      JSON.stringify({ secretWord: "otter" }),
    );
  });

  it("falls back to null instead of crashing on an unparseable stage", async () => {
    renderStubPhone({ mismatchedFields: true });
    expect((await screen.findByTestId("stage")).textContent).toBe("null");
  });
});

describe("registerGame's lazy loading", () => {
  it("shows a non-blank loading state before the ui module resolves, then the real screen", async () => {
    let resolveUi: ((ui: typeof stubUi) => void) | undefined;
    const pending = new Promise<typeof stubUi>((resolve) => {
      resolveUi = resolve;
    });
    const registered = registerGame({
      loadUi: () => pending,
      hostViewSchema: stubHostViewSchema,
      playerViewSchema: stubPlayerViewSchema,
    });
    const room = makePlayerView();
    render(
      <registered.ui.Phone
        view={{ myWord: "cat" }}
        room={room}
        deadline={null}
        timerStartedAt={null}
        clock={{ now: () => 0 }}
        send={() => {}}
        stage={null}
      />,
    );
    // Before the module resolves: no blank screen, and no crash from an undefined component.
    expect(screen.queryByTestId("stage")).toBeNull();
    expect(document.body.textContent).not.toBe("");
    resolveUi?.(stubUi);
    expect((await screen.findByTestId("stage")).textContent).toBe("null");
  });
});
