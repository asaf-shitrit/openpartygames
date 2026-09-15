import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { makeGame, makeHostView, makePack, makePlayer } from "./fixtures/room";
import { TvGamePicker } from "./TvGamePicker";

const IMPOSTER = makeGame({ id: "imposter", name: "Imposter" });
const DRAW = makeGame({ id: "draw", name: "Draw It" });

function switchState(name: string): string | null {
  return screen.getByRole("switch", { name }).getAttribute("aria-checked");
}

afterEach(cleanup);

describe("TvGamePicker", () => {
  it("marks the picked game and names its packs", () => {
    render(
      <TvGamePicker
        view={makeHostView({
          games: [IMPOSTER, DRAW],
          selectedGameId: "imposter",
        })}
      />,
    );
    expect(screen.getAllByText("Picked").length).toBe(1);
    expect(screen.getByText("Imposter packs")).toBeTruthy();
  });

  it("shows no picked stamp while the VIP has not chosen", () => {
    render(
      <TvGamePicker
        view={makeHostView({
          games: [IMPOSTER, DRAW],
          selectedGameId: "",
        })}
      />,
    );
    expect(screen.queryByText("Picked")).toBeNull();
    expect(screen.getByText("Packs")).toBeTruthy();
  });

  it("names the VIP who is picking", () => {
    render(
      <TvGamePicker
        view={makeHostView({
          players: [makePlayer({ id: "p1", name: "Priya", isVip: true })],
          vipId: "p1",
        })}
      />,
    );
    expect(screen.getByText("Priya")).toBeTruthy();
    expect(
      screen.getByText(/Priya starts the game from their phone/),
    ).toBeTruthy();
  });

  it("falls back when no VIP has joined", () => {
    render(<TvGamePicker view={makeHostView({ players: [], vipId: null })} />);
    expect(screen.getByText("Someone")).toBeTruthy();
    expect(
      screen.getByText(/The VIP starts the game from their phone/),
    ).toBeTruthy();
  });

  it("shows an adult pack as on and a teen pack as off", () => {
    render(
      <TvGamePicker
        view={makeHostView({
          packs: [
            makePack({
              id: "after-dark",
              name: "After Dark",
              rating: "adult",
              enabled: true,
            }),
            makePack({
              id: "school",
              name: "School",
              rating: "teen",
              enabled: false,
            }),
          ],
        })}
      />,
    );
    expect(screen.getByText("Adult")).toBeTruthy();
    expect(screen.getByText("Teen")).toBeTruthy();
    expect(switchState("After Dark pack")).toBe("true");
    expect(switchState("School pack")).toBe("false");
  });

  it("counts the players who are still playing", () => {
    render(
      <TvGamePicker
        view={makeHostView({
          players: [
            makePlayer({ id: "p1" }),
            makePlayer({ id: "p2", waitingForNextGame: true }),
            makePlayer({ id: "p3" }),
          ],
        })}
      />,
    );
    expect(screen.getByText(/· 2 players/)).toBeTruthy();
  });

  it("counts a lone player in the singular", () => {
    render(<TvGamePicker view={makeHostView({ players: [makePlayer()] })} />);
    expect(screen.getByText(/· 1 player$/)).toBeTruthy();
  });

  it("says when a game has no packs yet", () => {
    render(<TvGamePicker view={makeHostView({ packs: [] })} />);
    expect(screen.getByText("No packs for this game yet.")).toBeTruthy();
  });
});
