import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  makeGame,
  makePack,
  makePlayer,
  makePlayerView,
} from "./fixtures/room";
import { formatPlayerCount, PhoneVipControls } from "./PhoneVipControls";

const PRIYA = makePlayer({ id: "p1", name: "Priya", isVip: true });
const SAM = makePlayer({ id: "p2", name: "Sam", avatar: "star" });
const LEE = makePlayer({ id: "p3", name: "Lee", avatar: "cat" });
const PLAYERS = [PRIYA, SAM, LEE];

interface Handlers {
  onPickGame: ReturnType<typeof vi.fn<(id: string) => void>>;
  onSetPack: ReturnType<typeof vi.fn<(id: string, enabled: boolean) => void>>;
  onSetLocked: ReturnType<typeof vi.fn<(locked: boolean) => void>>;
  onKick: ReturnType<typeof vi.fn<(id: string) => void>>;
  onStartGame: ReturnType<typeof vi.fn<() => void>>;
}

function setup(
  patch: Parameters<typeof makePlayerView>[0] = {},
  error: string | null = null,
) {
  const handlers: Handlers = {
    onPickGame: vi.fn<(id: string) => void>(),
    onSetPack: vi.fn<(id: string, enabled: boolean) => void>(),
    onSetLocked: vi.fn<(locked: boolean) => void>(),
    onKick: vi.fn<(id: string) => void>(),
    onStartGame: vi.fn<() => void>(),
  };
  render(
    <PhoneVipControls
      view={makePlayerView({
        players: PLAYERS,
        vipId: "p1",
        you: "p1",
        games: [
          makeGame(),
          makeGame({ id: "real-or-nah", name: "Real or Nah" }),
        ],
        packs: [makePack()],
        ...patch,
      })}
      error={error}
      {...handlers}
    />,
  );
  return { handlers, user: userEvent.setup() };
}

afterEach(cleanup);

describe("PhoneVipControls", () => {
  it("sends pick-game when a game is chosen", async () => {
    const { handlers, user } = setup();
    await user.click(screen.getByRole("button", { name: /real or nah/i }));
    expect(handlers.onPickGame).toHaveBeenCalledWith("real-or-nah");
  });

  it("sends set-pack when a pack is toggled", async () => {
    const { handlers, user } = setup();
    await user.click(screen.getByRole("switch", { name: "Animals pack" }));
    expect(handlers.onSetPack).toHaveBeenCalledWith("animals", false);
  });

  it("sends set-locked when the lock is toggled", async () => {
    const { handlers, user } = setup();
    await user.click(screen.getByRole("switch", { name: "Lock room" }));
    expect(handlers.onSetLocked).toHaveBeenCalledWith(true);
  });

  it("sends kick for another player", async () => {
    const { handlers, user } = setup();
    await user.click(screen.getByRole("button", { name: "Kick Sam" }));
    expect(handlers.onKick).toHaveBeenCalledWith("p2");
  });

  it("sends start-game when the room is ready", async () => {
    const { handlers, user } = setup();
    await user.click(screen.getByRole("button", { name: /start imposter/i }));
    expect(handlers.onStartGame).toHaveBeenCalledTimes(1);
  });

  it("disables start until enough players are active", () => {
    setup({ players: [PRIYA, SAM] });
    expect(
      screen.getByRole("button", { name: /start imposter/i }),
    ).toHaveProperty("disabled", true);
    expect(screen.getByText("Need at least 3 players")).toBeTruthy();
  });

  it("disables start when no pack is enabled", () => {
    setup({ packs: [makePack({ enabled: false })] });
    expect(
      screen.getByRole("button", { name: /start imposter/i }),
    ).toHaveProperty("disabled", true);
    expect(screen.getByText("Turn on at least one pack")).toBeTruthy();
  });

  it("sends set-locked when an unlocked room is locked", async () => {
    const { handlers, user } = setup();
    await user.click(screen.getByRole("switch", { name: "Lock room" }));
    expect(handlers.onSetLocked).toHaveBeenCalledWith(true);
  });

  it("sends set-locked(false) when a locked room is unlocked", async () => {
    const { handlers, user } = setup({ locked: true });
    const lockedSwitch = screen.getByRole("switch", { name: "Lock room" });
    expect(lockedSwitch.getAttribute("aria-checked")).toBe("true");
    await user.click(lockedSwitch);
    expect(handlers.onSetLocked).toHaveBeenCalledWith(false);
  });

  it("asks the VIP to pick a game first", () => {
    setup({ selectedGameId: "" });
    expect(screen.getByText("Pick a game first")).toBeTruthy();
    expect(screen.getByRole("button", { name: /start game/i })).toHaveProperty(
      "disabled",
      true,
    );
    expect(screen.getByText("3–8 players · 3 here")).toBeTruthy();
  });

  it("shows the selected game's player limits", () => {
    setup({
      games: [makeGame({ minPlayers: 4, maxPlayers: 6 })],
      selectedGameId: "imposter",
    });
    expect(screen.getByText("4–6 players · 3 here")).toBeTruthy();
    expect(screen.getByText("Need at least 4 players")).toBeTruthy();
  });

  it("counts only players here for this game", () => {
    setup({
      players: [PRIYA, SAM, makePlayer({ id: "p4", waitingForNextGame: true })],
    });
    expect(screen.getByText("3–8 players · 2 here")).toBeTruthy();
    expect(screen.getByText("Need at least 3 players")).toBeTruthy();
  });

  it("shows the server error above the start button", () => {
    setup({}, "That game is not available.");
    expect(screen.getByText("That game is not available.")).toBeTruthy();
  });

  it("labels every rating", () => {
    setup({
      packs: [
        makePack({ id: "kite", name: "Kite", rating: "family" }),
        makePack({ id: "dare", name: "Dare", rating: "teen" }),
        makePack({ id: "risk", name: "Risk", rating: "adult" }),
      ],
    });
    expect(screen.getByText("Family")).toBeTruthy();
    expect(screen.getByText("Teen")).toBeTruthy();
    expect(screen.getByText("Adult")).toBeTruthy();
  });

  it("says so when a game has no packs", () => {
    setup({ packs: [] });
    expect(screen.getByText("No packs for this game yet.")).toBeTruthy();
    expect(screen.getByText("Turn on at least one pack")).toBeTruthy();
  });

  it("pluralizes the player count", () => {
    expect(formatPlayerCount(1)).toBe("1 player");
    expect(formatPlayerCount(2)).toBe("2 players");
    setup({ players: [makePlayer({ id: "p1", name: "Maya", isVip: true })] });
    expect(screen.getByText("Room BKTZ · 1 player")).toBeTruthy();
  });
});
