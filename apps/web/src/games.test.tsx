import { en, he } from "@opg/i18n";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { imposter } from "@opg/game-imposter";
import { mostLikelyTo } from "@opg/game-most-likely-to";
import { mostLikelyToAwardCopy } from "@opg/game-most-likely-to/award-copy";
import { doodleBluff } from "@opg/game-doodle-bluff";
import { realOrNah } from "@opg/game-real-or-nah";
import type { GameUi } from "@opg/ui";
import {
  awardCopyFor,
  describableAwards,
  gameIconFor,
  gameUiFor,
  LANDING_GAMES,
  preloadGameUi,
  registerGame,
} from "./games";
import { crownCueId, finaleBeats } from "./screens/finale-timeline";
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

  it("describes Most Likely To awards", () => {
    expect(
      awardCopyFor(
        "most-likely-to",
        { id: "crowd-reader", playerIds: ["maya"], value: 4 },
        en,
      ),
    ).toEqual({ title: "Crowd reader", detail: "Read the room 4 times" });
  });

  it("describes them in the reader's language", () => {
    expect(
      awardCopyFor(
        "most-likely-to",
        { id: "crowd-reader", playerIds: ["maya"], value: 4 },
        he,
      ),
    ).toEqual({ title: "קורא קהל", detail: "קרא את החדר 4 פעמים" });
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

type StubScreens = Pick<typeof stubUi, "Host" | "Phone">;
type StubStage = null | { secretWord: string } | { mismatchedFields: boolean };

const PHONE_PROPS = {
  room: makePlayerView(),
  deadline: null,
  timerStartedAt: null,
  clock: { now: () => 0 },
  send: () => {},
} as const;

function stubEntry(loadScreens: () => Promise<StubScreens>) {
  return {
    loadScreens,
    hostViewSchema: stubHostViewSchema,
    playerViewSchema: stubPlayerViewSchema,
  };
}

function renderStubPhone(stage: StubStage) {
  const registered = registerGame(stubEntry(() => Promise.resolve(stubUi)));
  render(
    <registered.ui.Phone
      view={{ myWord: "cat" }}
      stage={stage}
      {...PHONE_PROPS}
    />,
  );
}

// The screens load behind Suspense, so the real content shows one microtask later:
// findByTestId waits for it, getByTestId would not.
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

describe("registerGame's lazy screens", () => {
  it("shows a message, not a blank screen, until the screens arrive", async () => {
    let arrive: (() => void) | undefined;
    const registered = registerGame(
      stubEntry(
        () =>
          new Promise<StubScreens>((resolve) => {
            arrive = () => resolve(stubUi);
          }),
      ),
    );
    render(
      <registered.ui.Phone
        view={{ myWord: "cat" }}
        stage={null}
        {...PHONE_PROPS}
      />,
    );
    expect(screen.queryByTestId("stage")).toBeNull();
    expect(document.body.textContent).not.toBe("");
    arrive?.();
    expect(await screen.findByTestId("stage")).toBeTruthy();
  });

  it("loads a game's screens once, however often preload is called", async () => {
    const loadScreens = vi.fn<() => Promise<StubScreens>>(() => Promise.resolve(stubUi));
    const registered = registerGame(stubEntry(loadScreens));
    await Promise.all([registered.preload(), registered.preload()]);
    await registered.preload();
    expect(loadScreens).toHaveBeenCalledTimes(1);
  });

  it("does nothing for a game id it does not know", async () => {
    await expect(preloadGameUi("some-future-game")).resolves.toBeUndefined();
  });
});

// The finale stages one beat per describable award, and every device (the TV and each
// phone) counts them itself. That count must not depend on whether this device has
// downloaded the game's screens yet, or the crown lands at a different moment per device.
function crownAt(awardCount: number): number | undefined {
  const beats = finaleBeats({
    awardCount,
    rankedCount: 3,
    crownCue: crownCueId(),
  });
  return beats.find((beat) => beat.id === "crown")?.atMs;
}

describe("the finale does not depend on a game's screens having loaded", () => {
  const AWARDS = [
    { id: "crowd-reader", playerIds: ["maya"], value: 4 },
    { id: "no-such-award", playerIds: ["maya"], value: 1 },
  ];

  async function pendingAndLoaded() {
    const pending = registerGame({
      ...stubEntry(() => new Promise<StubScreens>(() => {})),
      awardCopy: mostLikelyToAwardCopy,
    });
    const loaded = registerGame({
      ...stubEntry(() => Promise.resolve(stubUi)),
      awardCopy: mostLikelyToAwardCopy,
    });
    await loaded.preload();
    return { pending, loaded };
  }

  type Registered = Awaited<ReturnType<typeof pendingAndLoaded>>["pending"];

  function describable(game: Registered) {
    return AWARDS.filter((award) => Boolean(game.ui.awardCopy?.(award, en)));
  }

  it("answers awardCopy the same before and after the chunk arrives", async () => {
    const { pending, loaded } = await pendingAndLoaded();
    expect(describable(pending)).toEqual(describable(loaded));
    expect(describable(pending)).toHaveLength(1);
  });

  it("stages the crown at the same beat on a device whose chunk is late", async () => {
    const { pending, loaded } = await pendingAndLoaded();
    expect(crownAt(describable(pending).length)).toBe(
      crownAt(describable(loaded).length),
    );
    expect(crownAt(describable(pending).length)).toBe(crownAt(1));
  });

  it.each(["imposter", "real-or-nah", "most-likely-to", "doodle-bluff"])(
    "has %s's award copy in the registry before any chunk is asked for",
    (id) => {
      expect(gameUiFor(id)?.awardCopy).toBeTypeOf("function");
    },
  );

  it("counts describable awards synchronously from the real registry", () => {
    expect(describableAwards("most-likely-to", AWARDS, en)).toHaveLength(1);
  });
});
