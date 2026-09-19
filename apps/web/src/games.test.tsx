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

function renderStubPhone(stage: StubStage) {
  const registered = registerGame({
    ui: stubUi,
    hostViewSchema: stubHostViewSchema,
    playerViewSchema: stubPlayerViewSchema,
  });
  const room = makePlayerView();
  render(
    <registered.Phone
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
  it("passes null straight through in a shared-screen room", () => {
    renderStubPhone(null);
    expect(screen.getByTestId("stage").textContent).toBe("null");
  });

  it("parses a valid stage with the game's own host view schema", () => {
    renderStubPhone({ secretWord: "otter" });
    expect(screen.getByTestId("stage").textContent).toBe(
      JSON.stringify({ secretWord: "otter" }),
    );
  });

  it("falls back to null instead of crashing on an unparseable stage", () => {
    renderStubPhone({ mismatchedFields: true });
    expect(screen.getByTestId("stage").textContent).toBe("null");
  });
});
