import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LocaleProvider } from "@opg/i18n";
import { makeGame, makePlayer, makePlayerView } from "./fixtures/room";
import { PhoneStarting } from "./PhoneStarting";

function setup(patch: Parameters<typeof makePlayerView>[0] = {}) {
  render(
    <LocaleProvider>
      <PhoneStarting
        view={makePlayerView({
          phase: "starting",
          players: [makePlayer({ id: "p1", name: "Priya", avatar: "blob" })],
          you: "p1",
          ...patch,
        })}
      />
    </LocaleProvider>,
  );
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("PhoneStarting", () => {
  it("names the game the room is about to deal", () => {
    setup();
    expect(screen.getByText("Starting Imposter…")).toBeTruthy();
    expect(
      screen.getByText("Get ready. The first round is coming up."),
    ).toBeTruthy();
  });

  it("says the same words as the TV, which is the point", () => {
    setup({
      games: [makeGame({ id: "real-or-nah", name: "Real or Nah" })],
      selectedGameId: "real-or-nah",
    });
    expect(screen.getByText("Starting Real or Nah…")).toBeTruthy();
  });

  it("falls back when the room has no summary for the selected game", () => {
    setup({ selectedGameId: "no-such-game" });
    expect(screen.getByText("Starting the game…")).toBeTruthy();
  });

  it("never claims someone else's game is running", () => {
    setup();
    expect(screen.queryByText(/already running/)).toBeNull();
  });

  it("renders in Hebrew", () => {
    window.localStorage.setItem("opg:locale", "he");
    setup();
    expect(screen.getByText("מתחילים את Imposter…")).toBeTruthy();
    expect(screen.getByText("תתכוננו. הסיבוב הראשון בדרך.")).toBeTruthy();
  });
});
