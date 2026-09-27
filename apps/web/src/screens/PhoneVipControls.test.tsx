import type { ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { en, LocaleProvider } from "@opg/i18n";
import {
  makeGame,
  makePack,
  makePlayer,
  makePlayerView,
} from "./fixtures/room";
import { formatPlayerCount, PhoneVipControls } from "./PhoneVipControls";

/** This screen reads its copy from the dictionary, so every render needs a provider. */
function renderLocalized(ui: ReactNode) {
  return render(<LocaleProvider>{ui}</LocaleProvider>);
}

const PRIYA = makePlayer({ id: "p1", name: "Priya", isVip: true });
const SAM = makePlayer({ id: "p2", name: "Sam", avatar: "star" });
const LEE = makePlayer({ id: "p3", name: "Lee", avatar: "cat" });
const PLAYERS = [PRIYA, SAM, LEE];

interface Handlers {
  onPickGame: ReturnType<typeof vi.fn<(id: string) => void>>;
  onSetPack: ReturnType<typeof vi.fn<(id: string, enabled: boolean) => void>>;
  onSetLocked: ReturnType<typeof vi.fn<(locked: boolean) => void>>;
  onSetSharedScreen: ReturnType<typeof vi.fn<(value: boolean) => void>>;
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
    onSetSharedScreen: vi.fn<(value: boolean) => void>(),
    onKick: vi.fn<(id: string) => void>(),
    onStartGame: vi.fn<() => void>(),
  };
  renderLocalized(
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

/** Like `setup`, but exposes a `rerender` that changes only the `error` prop — used to
 * simulate the server's next state frame rejecting a start attempt. */
function setupWithRerender() {
  const handlers: Handlers = {
    onPickGame: vi.fn<(id: string) => void>(),
    onSetPack: vi.fn<(id: string, enabled: boolean) => void>(),
    onSetLocked: vi.fn<(locked: boolean) => void>(),
    onSetSharedScreen: vi.fn<(value: boolean) => void>(),
    onKick: vi.fn<(id: string) => void>(),
    onStartGame: vi.fn<() => void>(),
  };
  const view = makePlayerView({
    players: PLAYERS,
    vipId: "p1",
    you: "p1",
    games: [makeGame(), makeGame({ id: "real-or-nah", name: "Real or Nah" })],
    packs: [makePack()],
  });
  const { rerender: rerenderRoot } = renderLocalized(
    <PhoneVipControls view={view} error={null} {...handlers} />,
  );
  const rerender = (error: string | null) =>
    rerenderRoot(
      <LocaleProvider>
        <PhoneVipControls view={view} error={error} {...handlers} />
      </LocaleProvider>,
    );
  return { handlers, user: userEvent.setup(), rerender };
}

const lockSwitch = () => screen.getByRole("switch", { name: "Lock room" });

/** Like `setup`, but exposes a `rerender` that changes only `view.locked` — the server's next
 * state frame either confirming a lock the VIP just tapped, or contradicting it. */
function setupWithLockRerender(locked = false) {
  const handlers: Handlers = {
    onPickGame: vi.fn<(id: string) => void>(),
    onSetPack: vi.fn<(id: string, enabled: boolean) => void>(),
    onSetLocked: vi.fn<(locked: boolean) => void>(),
    onSetSharedScreen: vi.fn<(value: boolean) => void>(),
    onKick: vi.fn<(id: string) => void>(),
    onStartGame: vi.fn<() => void>(),
  };
  const viewWith = (value: boolean) =>
    makePlayerView({
      players: PLAYERS,
      vipId: "p1",
      you: "p1",
      games: [makeGame()],
      packs: [makePack()],
      locked: value,
    });
  const { rerender: rerenderRoot } = renderLocalized(
    <PhoneVipControls view={viewWith(locked)} error={null} {...handlers} />,
  );
  const rerender = (value: boolean) =>
    rerenderRoot(
      <LocaleProvider>
        <PhoneVipControls view={viewWith(value)} error={null} {...handlers} />
      </LocaleProvider>,
    );
  return { handlers, user: userEvent.setup(), rerender };
}

afterEach(cleanup);

describe("PhoneVipControls", () => {
  it("sends pick-game when a game is chosen", async () => {
    const { handlers, user } = setup();
    const gameButton = screen.getByRole("button", { name: /real or nah/i });
    expect(gameButton.classList.contains("opg-pressable")).toBe(true);
    await user.click(gameButton);
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

  it("asks for confirmation before kicking, and can be cancelled", async () => {
    const { handlers, user } = setup();
    await user.click(screen.getByRole("button", { name: "Kick Sam" }));
    expect(handlers.onKick).not.toHaveBeenCalled();
    expect(screen.getByText("Remove Sam from the room?")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText("Remove Sam from the room?")).toBeNull();
    expect(screen.getByRole("button", { name: "Kick Sam" })).toBeTruthy();
  });

  it("puts focus on cancel when the kick confirm opens", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: "Kick Sam" }));
    // Cancel, not "Yes, remove": the Enter that opened this step can still be held, and an
    // auto-repeat onto a focused destructive button would remove the player with no second
    // decision. Landing anywhere is also better than <body>, which is where focus went before.
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Cancel" }),
    );
  });

  it("sends kick for another player once the removal is confirmed", async () => {
    const { handlers, user } = setup();
    await user.click(screen.getByRole("button", { name: "Kick Sam" }));
    await user.click(screen.getByRole("button", { name: "Yes, remove" }));
    expect(handlers.onKick).toHaveBeenCalledWith("p2");
  });

  it("sends start-game when the room is ready", async () => {
    const { handlers, user } = setup();
    await user.click(screen.getByRole("button", { name: /start imposter/i }));
    expect(handlers.onStartGame).toHaveBeenCalledTimes(1);
  });

  it("disables and relabels start after one tap, so a slow link cannot send it twice", async () => {
    const { handlers, user } = setup();
    const startButton = screen.getByRole("button", { name: /start imposter/i });
    await user.click(startButton);
    expect(handlers.onStartGame).toHaveBeenCalledTimes(1);
    const pendingButton = screen.getByRole("button", { name: "Starting…" });
    expect(pendingButton).toHaveProperty("disabled", true);
    await user.click(pendingButton);
    expect(handlers.onStartGame).toHaveBeenCalledTimes(1);
  });

  it("announces why the start the VIP asked for did not happen", async () => {
    const { user, rerender } = setupWithRerender();
    await user.click(screen.getByRole("button", { name: /start imposter/i }));
    rerender("That game is not available.");
    // The explanation renders above the button it explains, so without a live region a screen
    // reader moving forward from the button never reaches it.
    expect(screen.getByRole("alert").textContent).toContain(
      "That game is not available.",
    );
  });

  it("re-enables start once the server rejects the attempt with an error", async () => {
    const { handlers, user, rerender } = setupWithRerender();
    const startButton = screen.getByRole("button", { name: /start imposter/i });
    await user.click(startButton);
    expect(screen.getByRole("button", { name: "Starting…" })).toBeTruthy();
    rerender("That game is not available.");
    const retryButton = screen.getByRole("button", { name: /start imposter/i });
    expect(retryButton).toHaveProperty("disabled", false);
    await user.click(retryButton);
    expect(handlers.onStartGame).toHaveBeenCalledTimes(2);
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

  it("shows all three games and lets the third be picked", async () => {
    const { handlers, user } = setup({
      games: [
        makeGame(),
        makeGame({ id: "real-or-nah", name: "Real or Nah" }),
        makeGame({ id: "most-likely-to", name: "Most Likely To" }),
      ],
    });
    expect(screen.getByText("Imposter")).toBeTruthy();
    expect(screen.getByText("Real or Nah")).toBeTruthy();
    expect(screen.getByText("Most Likely To")).toBeTruthy();
    const gameButton = screen.getByRole("button", {
      name: /most likely to/i,
    });
    await user.click(gameButton);
    expect(handlers.onPickGame).toHaveBeenCalledWith("most-likely-to");
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

  it("shows the lock switch flipped immediately, before any server view confirms it", async () => {
    const { user } = setup({ locked: false });
    const lockedSwitch = screen.getByRole("switch", { name: "Lock room" });
    expect(lockedSwitch.getAttribute("aria-checked")).toBe("false");
    // The `view` prop this screen was given never changes in this test — there is no
    // server round trip here — so a switch reading its own state straight from `view`
    // would still show "false". It shows "true" because the optimistic value it renders
    // is its own last choice, not the committed prop.
    await user.click(lockedSwitch);
    expect(lockedSwitch.getAttribute("aria-checked")).toBe("true");
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
    expect(formatPlayerCount(en, 1)).toBe("1 player");
    expect(formatPlayerCount(en, 2)).toBe("2 players");
    setup({ players: [makePlayer({ id: "p1", name: "Maya", isVip: true })] });
    expect(screen.getByText("Room BKTZ · 1 player")).toBeTruthy();
  });

  it("shows a game that plays on a shared screen as selectable, dimmed and labelled", async () => {
    const { handlers, user } = setup({
      games: [
        makeGame({ noTv: true }),
        makeGame({ id: "real-or-nah", name: "Real or Nah", noTv: false }),
      ],
      sharedScreen: false,
    });
    const tile = screen.getByRole("button", { name: /real or nah/i });
    expect(tile.getAttribute("style")).toContain("opacity: 0.45");
    expect(screen.getByText("Plays on a shared screen.")).toBeTruthy();
    await user.click(tile);
    expect(handlers.onPickGame).toHaveBeenCalledWith("real-or-nah");
  });

  it("disables start with the reason when the picked game needs a shared screen", () => {
    setup({
      games: [makeGame({ id: "real-or-nah", name: "Real or Nah", noTv: false })],
      selectedGameId: "real-or-nah",
      sharedScreen: false,
    });
    expect(
      screen.getByRole("button", { name: /start real or nah/i }),
    ).toHaveProperty("disabled", true);
    expect(
      screen.getByText(
        "Real or Nah plays on a shared screen. Turn that on to start it.",
      ),
    ).toBeTruthy();
  });

  it("sends set-shared-screen when the toggle is flipped", async () => {
    const { handlers, user } = setup({ sharedScreen: false });
    await user.click(
      screen.getByRole("switch", { name: "Add a shared screen" }),
    );
    expect(handlers.onSetSharedScreen).toHaveBeenCalledWith(true);
  });

  it("names the shared-screen games the toggle would add", () => {
    setup({
      games: [
        makeGame({ noTv: true }),
        makeGame({ id: "real-or-nah", name: "Real or Nah", noTv: false }),
      ],
      sharedScreen: false,
    });
    expect(
      screen.getByText("Play on a TV or laptop — adds Real or Nah"),
    ).toBeTruthy();
  });

  it("says the shared screen is already on", () => {
    setup({ sharedScreen: true });
    expect(
      screen.getByText("A shared screen is on for this room."),
    ).toBeTruthy();
  });

  it("spells out the room code as the hero in a no-TV room", () => {
    setup({ sharedScreen: false, code: "BKTZ" });
    expect(screen.getByText("Your room code")).toBeTruthy();
    for (const letter of "BKTZ") {
      expect(screen.getAllByText(letter).length).toBeGreaterThan(0);
    }
  });

  it("offers the join link as a QR you can also tap to share", () => {
    setup({ sharedScreen: false, code: "BKTZ" });
    const share = screen.getByLabelText("Share the link to join this room");
    expect(share).toBeTruthy();
    // The QR encodes the join URL, so a scan lands on the room rather than the home page.
    expect(share.querySelector("svg.opg-qr")).toBeTruthy();
    expect(screen.getByText("Scan it, or tap to share")).toBeTruthy();
  });

  it("keeps the join link off a shared-screen room, where the TV shows it", () => {
    setup({ sharedScreen: true });
    expect(
      screen.queryByLabelText("Share the link to join this room"),
    ).toBeNull();
  });

  it("drops the hero code in a shared-screen room", () => {
    setup({ sharedScreen: true });
    expect(screen.queryByText("Your room code")).toBeNull();
  });
});

describe("PhoneVipControls, a toggle waiting on the server", () => {
  it("keeps the VIP's choice while the room still says otherwise", async () => {
    const { user } = setupWithLockRerender(false);
    await user.click(lockSwitch());
    // No view has arrived yet; the switch shows the tap, not the stale committed value.
    expect(lockSwitch().getAttribute("aria-checked")).toBe("true");
  });

  it("does not flicker when the room's echo agrees with the tap", async () => {
    const { user, rerender } = setupWithLockRerender(false);
    await user.click(lockSwitch());
    rerender(true);
    expect(lockSwitch().getAttribute("aria-checked")).toBe("true");
  });

  it("lets a later view that disagrees win, once the room has caught up", async () => {
    const { user, rerender } = setupWithLockRerender(false);
    await user.click(lockSwitch());
    rerender(true);
    // The optimistic value has served its purpose and let go, so the room unlocking the
    // room from somewhere else shows through instead of being masked by the old tap.
    rerender(false);
    expect(lockSwitch().getAttribute("aria-checked")).toBe("false");
  });

  it("follows the room when nothing was tapped", () => {
    const { rerender } = setupWithLockRerender(false);
    rerender(true);
    expect(lockSwitch().getAttribute("aria-checked")).toBe("true");
  });

  it("holds the second of two quick taps against the echo of the first", async () => {
    const { handlers, user, rerender } = setupWithLockRerender(false);
    await user.click(lockSwitch());
    await user.click(lockSwitch());
    expect(handlers.onSetLocked).toHaveBeenNthCalledWith(1, true);
    expect(handlers.onSetLocked).toHaveBeenNthCalledWith(2, false);
    // The first send lands and the room says "locked" — but that is an answer to the tap
    // before the last one. Flipping the switch back under the VIP's thumb here is exactly
    // the thing the optimistic value exists to prevent.
    rerender(true);
    expect(lockSwitch().getAttribute("aria-checked")).toBe("false");
  });
});

describe("PhoneVipControls, players who are away", () => {
  const AWAY_LEE = makePlayer({
    id: "p3",
    name: "Lee",
    avatar: "cat",
    connected: false,
  });

  it("counts Start by the players the server can still reach", () => {
    setup({ players: [PRIYA, SAM, AWAY_LEE] });
    // Three names on the roster, two phones the room can start on. The server gates on the
    // same two, so an enabled button here could only have been refused.
    expect(
      screen.getByRole("button", { name: /start imposter/i }),
    ).toHaveProperty("disabled", true);
    expect(screen.getByText("Need at least 3 players")).toBeTruthy();
    expect(screen.getByText("3–8 players · 2 here")).toBeTruthy();
  });

  it("marks the away player on the roster, and still lists them", () => {
    setup({ players: [PRIYA, SAM, AWAY_LEE] });
    expect(screen.getByText("Lee")).toBeTruthy();
    expect(screen.getByText("Away")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Kick Lee" })).toBeTruthy();
    expect(screen.getByText("Players (3)")).toBeTruthy();
  });

  it("tags nobody when every phone is here", () => {
    setup();
    expect(screen.queryByText("Away")).toBeNull();
    expect(screen.getByText("3–8 players · 3 here")).toBeTruthy();
  });
});

describe("PhoneVipControls, in Hebrew", () => {
  afterEach(() => {
    window.localStorage.removeItem("opg:locale");
  });

  it("renders the VIP heading and start button in Hebrew", () => {
    window.localStorage.setItem("opg:locale", "he");
    setup();
    expect(screen.getByText("אתם ה-VIP")).toBeTruthy();
    expect(screen.getByText("בחרו משחק")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /התחילו את/ }),
    ).toBeTruthy();
  });
});
