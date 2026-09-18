import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { makeGame, makePlayer, makePlayerView } from "./fixtures/room";
import { PhoneWaiting } from "./PhoneWaiting";

const ME = makePlayer({ id: "p1", name: "Priya", avatar: "blob" });
const SAM = makePlayer({ id: "p2", name: "Sam", avatar: "drop" });
const LEE = makePlayer({
  id: "p3",
  name: "Lee",
  avatar: "cat",
  waitingForNextGame: true,
});

function setup(patch: Parameters<typeof makePlayerView>[0] = {}) {
  render(
    <PhoneWaiting
      view={makePlayerView({
        players: [ME, SAM, LEE],
        you: "p1",
        games: [makeGame()],
        game: {
          id: "imposter",
          view: null,
          stage: null,
          deadline: null,
          timerStartedAt: null,
        },
        ...patch,
      })}
    />,
  );
}

afterEach(cleanup);

describe("PhoneWaiting", () => {
  it("names the running game and greets the player", () => {
    setup();
    expect(screen.getByText("Imposter")).toBeTruthy();
    expect(screen.getByText("In progress")).toBeTruthy();
    expect(screen.getByText("You're in, Priya!")).toBeTruthy();
    expect(
      screen.getByText(
        "A game is already running. You'll join when the next one starts.",
      ),
    ).toBeTruthy();
  });

  it("lists every player and marks you", () => {
    setup();
    expect(screen.getByText("Who's playing (3)")).toBeTruthy();
    expect(screen.getByText("Priya (you)")).toBeTruthy();
    expect(screen.getByText("Sam")).toBeTruthy();
    expect(screen.getByText("Lee")).toBeTruthy();
  });

  it("falls back to a plain game label with no running game", () => {
    setup({ game: null });
    expect(screen.getByText("Game")).toBeTruthy();
    expect(screen.queryByText("Imposter")).toBeNull();
  });

  it("falls back when the player is not in the room view", () => {
    setup({ you: "ghost" });
    expect(screen.getByText("You're in, player!")).toBeTruthy();
  });

  it("shows neutral waiting copy in a shared-screen room", () => {
    setup({ sharedScreen: true });
    expect(screen.getByText("Hang tight until then.")).toBeTruthy();
  });

  it("shows the same neutral waiting copy with no shared screen", () => {
    setup({ sharedScreen: false });
    expect(screen.getByText("Hang tight until then.")).toBeTruthy();
  });
});
