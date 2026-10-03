import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "@opg/i18n";
import { lastSocket, resetFakeSockets } from "./fixtures/socket";
import type { FakeWebSocket } from "./fixtures/socket";
import {
  FakeWakeLockSentinel,
  restoreWakeLock,
  stubWakeLock,
} from "./fixtures/wakeLock";
import { makePlayer, makePlayerView } from "./fixtures/room";
import { realOrNahPreviews } from "@opg/game-real-or-nah/ui";
import { stashJoin, takeJoin } from "../join-handoff";
import { PlayerApp } from "./PlayerApp";

function stubRoomInfo(): void {
  const mock = vi.fn<typeof fetch>(async () =>
    Response.json({
      code: "BKTZ",
      exists: true,
      locked: false,
      inGame: false,
      playerCount: 1,
      joinable: true,
    }),
  );
  vi.stubGlobal("fetch", mock);
}

function joinPlayer(): FakeWebSocket {
  const socket = lastSocket();
  act(() => socket.open());
  act(() =>
    socket.receive({
      t: "welcome",
      role: "player",
      playerId: "p1",
      token: "tok",
    }),
  );
  return socket;
}

beforeEach(() => {
  resetFakeSockets();
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  restoreWakeLock();
});

/** A lobby view where the phone player is a plain player, not the VIP. */
function lobbyWithVipElsewhere() {
  return makePlayerView({
    vipId: "p2",
    players: [makePlayer({ id: "p1" }), makePlayer({ id: "p2", name: "Sam" })],
  });
}

describe("PlayerApp", () => {
  it("joins by itself with the name the join form handed over, once", () => {
    stubRoomInfo();
    stashJoin("BKTZ", "Zed");
    render(
      <LocaleProvider>
        <PlayerApp code="BKTZ" />
      </LocaleProvider>,
    );
    const socket = lastSocket();
    act(() => socket.open());
    expect(socket.sent).toContain(JSON.stringify({ t: "join", name: "Zed" }));
    expect(takeJoin("BKTZ")).toBeNull();
  });

  it("joins with the handed-over name even when an old token is saved for the room", () => {
    // A removed player re-enters the code on "/": the stale token no longer seats them, so
    // the name they just typed is what joins them, with the token tried first by the room.
    stubRoomInfo();
    localStorage.setItem("opg:player:BKTZ", "stale");
    stashJoin("BKTZ", "Zed");
    render(
      <LocaleProvider>
        <PlayerApp code="BKTZ" />
      </LocaleProvider>,
    );
    const socket = lastSocket();
    act(() => socket.open());
    expect(socket.sent).toContain(JSON.stringify({ t: "join", name: "Zed", token: "stale" }));
  });

  it("does not scold a reload for a name nobody typed", async () => {
    // A removed player's saved token no longer matches a seat, so the reconnect arrives at the
    // server as a join with no name and comes back "name-invalid".
    stubRoomInfo();
    localStorage.setItem("opg:player:BKTZ", "stale");
    render(
      <LocaleProvider>
        <PlayerApp code="BKTZ" />
      </LocaleProvider>,
    );
    const socket = lastSocket();
    act(() => socket.open());
    act(() =>
      socket.receive({ t: "error", code: "name-invalid", message: "Names are 1-12 characters." }),
    );
    expect(screen.queryByText("Names are 1–12 characters.")).toBeNull();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Your name"), "Priya");
    await user.click(screen.getByRole("button", { name: /join/i }));
    act(() =>
      socket.receive({ t: "error", code: "name-invalid", message: "Names are 1-12 characters." }),
    );
    expect(screen.getByText("Names are 1–12 characters.")).toBeTruthy();
  });

  it("does not join on its own when nothing was handed over", () => {
    stubRoomInfo();
    render(
      <LocaleProvider>
        <PlayerApp code="BKTZ" />
      </LocaleProvider>,
    );
    const socket = lastSocket();
    act(() => socket.open());
    expect(socket.sent.some((frame) => frame.includes('"t":"join"'))).toBe(false);
  });

  it("joins from the form, then shows the avatar picker once", async () => {
    stubRoomInfo();
    const user = userEvent.setup();
    render(
      <LocaleProvider>
        <PlayerApp code="BKTZ" />
      </LocaleProvider>,
    );
    const socket = lastSocket();
    act(() => socket.open());

    await user.type(screen.getByLabelText("Your name"), "Priya");
    await user.click(screen.getByRole("button", { name: /join/i }));
    await waitFor(() =>
      expect(socket.sent).toContain(
        JSON.stringify({ t: "join", name: "Priya" }),
      ),
    );

    act(() =>
      socket.receive({
        t: "welcome",
        role: "player",
        playerId: "p1",
        token: "tok",
      }),
    );
    act(() => socket.receive({ t: "state", view: makePlayerView() }));
    expect(screen.getByText("Pick your doodle")).toBeTruthy();
  });

  it("skips the picker when the avatar was already picked", () => {
    sessionStorage.setItem("opg:avatarPicked:BKTZ:p1", "1");
    render(
      <LocaleProvider>
        <PlayerApp code="BKTZ" />
      </LocaleProvider>,
    );
    const socket = joinPlayer();
    act(() =>
      socket.receive({
        t: "state",
        view: makePlayerView({
          vipId: "p2",
          players: [
            makePlayer({ id: "p1" }),
            makePlayer({ id: "p2", name: "Sam", avatar: "star" }),
          ],
        }),
      }),
    );
    expect(screen.queryByText("Pick your doodle")).toBeNull();
    expect(screen.getByText("You're in!")).toBeTruthy();
  });

  it("shows the VIP controls to the VIP", () => {
    sessionStorage.setItem("opg:avatarPicked:BKTZ:p1", "1");
    render(
      <LocaleProvider>
        <PlayerApp code="BKTZ" />
      </LocaleProvider>,
    );
    const socket = joinPlayer();
    act(() =>
      socket.receive({
        t: "state",
        view: makePlayerView({ vipId: "p1", you: "p1" }),
      }),
    );
    expect(screen.getByText("You're the VIP")).toBeTruthy();
  });

  it("shows the results screen to a non-VIP phone after a game", () => {
    sessionStorage.setItem("opg:avatarPicked:BKTZ:p1", "1");
    render(
      <LocaleProvider>
        <PlayerApp code="BKTZ" />
      </LocaleProvider>,
    );
    const socket = joinPlayer();
    act(() =>
      socket.receive({
        t: "state",
        view: makePlayerView({
          ...lobbyWithVipElsewhere(),
          lobbyScreen: "results",
          lastResult: {
            gameId: "imposter",
            scores: { p1: 10, p2: 4 },
            winnerIds: ["p1"],
            completed: true,
            finishedAt: 0,
            awards: [],
          },
        }),
      }),
    );
    expect(screen.getByText(/finished/)).toBeTruthy();
    expect(screen.queryByText("You're the VIP")).toBeNull();
  });

  it("gives the VIP the finale, with the next game one tap away", async () => {
    sessionStorage.setItem("opg:avatarPicked:BKTZ:p1", "1");
    const user = userEvent.setup();
    render(
      <LocaleProvider>
        <PlayerApp code="BKTZ" />
      </LocaleProvider>,
    );
    const socket = joinPlayer();
    act(() =>
      socket.receive({
        t: "state",
        view: makePlayerView({
          vipId: "p1",
          you: "p1",
          lobbyScreen: "results",
          lastResult: {
            gameId: "imposter",
            scores: { p1: 10 },
            winnerIds: ["p1"],
            completed: true,
            finishedAt: 0,
            awards: [],
          },
        }),
      }),
    );
    // The VIP played too: the ceremony is theirs, and the picker is not stacked under it.
    expect(screen.getByText(/finished/)).toBeTruthy();
    expect(screen.queryByText("You're the VIP")).toBeNull();

    await user.click(
      screen.getByRole("button", { name: /pick the next game/i }),
    );
    expect(screen.getByText("You're the VIP")).toBeTruthy();
    expect(screen.queryByText(/finished/)).toBeNull();
  });

  it("lets the crown ceremony finish before the doodle picker opens", () => {
    render(
      <LocaleProvider>
        <PlayerApp code="BKTZ" />
      </LocaleProvider>,
    );
    const socket = joinPlayer();
    act(() =>
      socket.receive({
        t: "state",
        view: makePlayerView({
          ...lobbyWithVipElsewhere(),
          lobbyScreen: "results",
          lastResult: {
            gameId: "imposter",
            scores: { p1: 10, p2: 4 },
            winnerIds: ["p1"],
            completed: true,
            finishedAt: 0,
            awards: [],
          },
        }),
      }),
    );
    // This phone has never picked a doodle — it joined mid-game — but the crown goes first.
    expect(screen.queryByText("Pick your doodle")).toBeNull();
    expect(screen.getByText(/finished/)).toBeTruthy();
  });

  it("shows the waiting screen for a player joining mid-game", () => {
    sessionStorage.setItem("opg:avatarPicked:BKTZ:p1", "1");
    render(
      <LocaleProvider>
        <PlayerApp code="BKTZ" />
      </LocaleProvider>,
    );
    const socket = joinPlayer();
    act(() =>
      socket.receive({
        t: "state",
        view: makePlayerView({
          phase: "in-game",
          players: [makePlayer({ id: "p1", waitingForNextGame: true })],
          game: {
            id: "imposter",
            view: {},
            stage: null,
            deadline: null,
            timerStartedAt: null,
          },
        }),
      }),
    );
    expect(screen.getByText(/You're in,/)).toBeTruthy();
  });

  it("renders the active game UI for a playing player", async () => {
    sessionStorage.setItem("opg:avatarPicked:BKTZ:p1", "1");
    render(
      <LocaleProvider>
        <PlayerApp code="BKTZ" />
      </LocaleProvider>,
    );
    const socket = joinPlayer();
    const preview = realOrNahPreviews.find((p) => p.surface === "phone");
    if (!preview) throw new Error("missing phone preview");
    act(() => socket.receive({ t: "state", view: preview.room }));
    expect(await screen.findByText(/went to war against/)).toBeTruthy();
  });

  it("keeps rendering the game when a shared stage rides along with the view", async () => {
    sessionStorage.setItem("opg:avatarPicked:BKTZ:p1", "1");
    render(
      <LocaleProvider>
        <PlayerApp code="BKTZ" />
      </LocaleProvider>,
    );
    const socket = joinPlayer();
    const phonePreview = realOrNahPreviews.find((p) => p.surface === "phone");
    const hostPreview = realOrNahPreviews.find((p) => p.surface === "host");
    if (!phonePreview || !hostPreview) throw new Error("missing preview");
    const room = phonePreview.room;
    if (room.role !== "player" || !room.game) throw new Error("expected a phone room with a game");
    const game = room.game;
    act(() =>
      socket.receive({
        t: "state",
        view: {
          ...room,
          sharedScreen: false,
          game: { ...game, stage: hostPreview.view },
        },
      }),
    );
    expect(await screen.findByText(/went to war against/)).toBeTruthy();
  });

  it("keeps rendering the game when the shared stage is malformed", async () => {
    sessionStorage.setItem("opg:avatarPicked:BKTZ:p1", "1");
    render(
      <LocaleProvider>
        <PlayerApp code="BKTZ" />
      </LocaleProvider>,
    );
    const socket = joinPlayer();
    const phonePreview = realOrNahPreviews.find((p) => p.surface === "phone");
    if (!phonePreview) throw new Error("missing phone preview");
    const room = phonePreview.room;
    if (room.role !== "player" || !room.game) throw new Error("expected a phone room with a game");
    const game = room.game;
    act(() =>
      socket.receive({
        t: "state",
        view: {
          ...room,
          sharedScreen: false,
          game: { ...game, stage: { totally: "not a host view" } },
        },
      }),
    );
    expect(await screen.findByText(/went to war against/)).toBeTruthy();
  });

  it("keeps the game mounted through a blip and says so in a banner", async () => {
    sessionStorage.setItem("opg:avatarPicked:BKTZ:p1", "1");
    render(
      <LocaleProvider>
        <PlayerApp code="BKTZ" />
      </LocaleProvider>,
    );
    const socket = joinPlayer();
    const preview = realOrNahPreviews.find((p) => p.surface === "phone");
    if (!preview) throw new Error("missing phone preview");
    act(() => socket.receive({ t: "state", view: preview.room }));
    const claim = await screen.findByText(/went to war against/);

    act(() => socket.serverClose());

    expect(screen.getByText("Reconnecting… your taps are saved.")).toBeTruthy();
    // The very same node, not a remount. Every draft on a phone — a vote picked but not
    // sent, a half-typed guess — is local state that an unmount would take with it.
    expect(claim.isConnected).toBe(true);
  });

  it("shows the whole reconnect screen when the drop comes before any view", () => {
    localStorage.setItem("opg:player:BKTZ", "tok");
    render(
      <LocaleProvider>
        <PlayerApp code="BKTZ" />
      </LocaleProvider>,
    );
    act(() => lastSocket().serverClose());
    expect(screen.getByText("Reconnecting…")).toBeTruthy();
  });

  it("shows the kicked screen after being removed", () => {
    sessionStorage.setItem("opg:avatarPicked:BKTZ:p1", "1");
    render(
      <LocaleProvider>
        <PlayerApp code="BKTZ" />
      </LocaleProvider>,
    );
    const socket = joinPlayer();
    act(() => socket.receive({ t: "state", view: makePlayerView() }));
    act(() => socket.receive({ t: "kicked" }));
    expect(screen.getByText("You were removed")).toBeTruthy();
  });

  it("remembers the picked doodle and closes the picker", async () => {
    const user = userEvent.setup();
    render(
      <LocaleProvider>
        <PlayerApp code="BKTZ" />
      </LocaleProvider>,
    );
    const socket = joinPlayer();
    act(() => socket.receive({ t: "state", view: lobbyWithVipElsewhere() }));

    await user.click(
      screen.getByRole("button", { name: "Choose the star avatar" }),
    );
    expect(socket.sent).toContain(
      JSON.stringify({ t: "set-avatar", avatar: "star" }),
    );

    await user.click(screen.getByRole("button", { name: /that's me/i }));
    expect(sessionStorage.getItem("opg:avatarPicked:BKTZ:p1")).toBe("1");
    expect(screen.queryByText("Pick your doodle")).toBeNull();
    expect(screen.getByText("You're in!")).toBeTruthy();
  });

  it("reopens the picker from the lobby with a change of doodle", async () => {
    sessionStorage.setItem("opg:avatarPicked:BKTZ:p1", "1");
    const user = userEvent.setup();
    render(
      <LocaleProvider>
        <PlayerApp code="BKTZ" />
      </LocaleProvider>,
    );
    const socket = joinPlayer();
    act(() => socket.receive({ t: "state", view: lobbyWithVipElsewhere() }));

    await user.click(screen.getByRole("button", { name: /change doodle/i }));
    expect(screen.getByText("Pick your doodle")).toBeTruthy();
  });

  it("shows plain copy for a known join error code", () => {
    render(
      <LocaleProvider>
        <PlayerApp code="BKTZ" />
      </LocaleProvider>,
    );
    const socket = lastSocket();
    act(() => socket.open());
    act(() =>
      socket.receive({
        t: "error",
        code: "room-full",
        message: "the room is full",
      }),
    );
    expect(screen.getByText("That room is full.")).toBeTruthy();
  });

  it("translates a code the server only describes in English", () => {
    render(
      <LocaleProvider>
        <PlayerApp code="BKTZ" />
      </LocaleProvider>,
    );
    const socket = lastSocket();
    act(() => socket.open());
    act(() =>
      socket.receive({ t: "error", code: "bad-message", message: "Huh?" }),
    );
    expect(
      screen.getByText("This phone and the room lost step. Reload the page."),
    ).toBeTruthy();
    expect(screen.queryByText("Huh?")).toBeNull();
  });

  it("has copy for a code the server sends with no message at all", () => {
    render(
      <LocaleProvider>
        <PlayerApp code="BKTZ" />
      </LocaleProvider>,
    );
    const socket = lastSocket();
    act(() => socket.open());
    act(() =>
      socket.receive({ t: "error", code: "rate-limited", message: "" }),
    );
    expect(screen.getByText("Slow down a moment, then try again.")).toBeTruthy();
  });

  it("shows a code the frame parser used to drop on the floor", () => {
    render(
      <LocaleProvider>
        <PlayerApp code="BKTZ" />
      </LocaleProvider>,
    );
    const socket = lastSocket();
    act(() => socket.open());
    // "no-language-packs" was missing from the socket's code list, so the whole frame failed
    // to parse and the phone showed nothing at all.
    act(() =>
      socket.receive({ t: "error", code: "no-language-packs", message: "" }),
    );
    expect(screen.getByText(/plays in another language/)).toBeTruthy();
  });

  it("shows the newest codes the protocol added", () => {
    render(
      <LocaleProvider>
        <PlayerApp code="BKTZ" />
      </LocaleProvider>,
    );
    const socket = lastSocket();
    act(() => socket.open());
    act(() =>
      socket.receive({ t: "error", code: "start-failed", message: "" }),
    );
    expect(screen.getByText("That game couldn't start. Try again.")).toBeTruthy();
  });

  it("gives the VIP in-game controls that skip and end the game", async () => {
    sessionStorage.setItem("opg:avatarPicked:BKTZ:p1", "1");
    const user = userEvent.setup();
    render(
      <LocaleProvider>
        <PlayerApp code="BKTZ" />
      </LocaleProvider>,
    );
    const socket = joinPlayer();
    const preview = realOrNahPreviews.find((p) => p.surface === "phone");
    if (!preview) throw new Error("missing phone preview");
    const room = preview.room;
    if (room.role !== "player") throw new Error("expected a phone room");

    act(() =>
      socket.receive({
        t: "state",
        view: {
          ...room,
          players: room.players.map((p) =>
            Object.assign({}, p, { isVip: p.id === room.you }),
          ),
        },
      }),
    );

    await user.click(screen.getByRole("button", { name: "Skip this part" }));
    expect(socket.sent).toContain(JSON.stringify({ t: "skip-phase" }));

    await user.click(screen.getByRole("button", { name: "End game" }));
    await user.click(screen.getByRole("button", { name: "Yes, end it" }));
    expect(socket.sent).toContain(JSON.stringify({ t: "end-game" }));
  });

  it("waits when the room's game has no screen here", () => {
    sessionStorage.setItem("opg:avatarPicked:BKTZ:p1", "1");
    render(
      <LocaleProvider>
        <PlayerApp code="BKTZ" />
      </LocaleProvider>,
    );
    const socket = joinPlayer();
    act(() =>
      socket.receive({
        t: "state",
        view: makePlayerView({
          phase: "in-game",
          game: {
            id: "no-such-game",
            view: {},
            stage: null,
            deadline: null,
            timerStartedAt: null,
          },
        }),
      }),
    );
    expect(screen.getByText("You're in, Priya!")).toBeTruthy();
  });

  it("waits when a game is running without a payload yet", () => {
    sessionStorage.setItem("opg:avatarPicked:BKTZ:p1", "1");
    render(
      <LocaleProvider>
        <PlayerApp code="BKTZ" />
      </LocaleProvider>,
    );
    const socket = joinPlayer();
    act(() =>
      socket.receive({
        t: "state",
        view: makePlayerView({
          phase: "in-game",
          game: {
            id: "imposter",
            view: null,
            stage: null,
            deadline: null,
            timerStartedAt: null,
          },
        }),
      }),
    );
    expect(screen.getByText("You're in, Priya!")).toBeTruthy();
  });

  it("waits when the room has no game at all", () => {
    sessionStorage.setItem("opg:avatarPicked:BKTZ:p1", "1");
    render(
      <LocaleProvider>
        <PlayerApp code="BKTZ" />
      </LocaleProvider>,
    );
    const socket = joinPlayer();
    act(() =>
      socket.receive({
        t: "state",
        view: makePlayerView({ phase: "in-game", game: null }),
      }),
    );
    expect(screen.getByText("You're in, Priya!")).toBeTruthy();
  });

  it("tells a phone its own game is starting, not that one is already running", () => {
    sessionStorage.setItem("opg:avatarPicked:BKTZ:p1", "1");
    render(
      <LocaleProvider>
        <PlayerApp code="BKTZ" />
      </LocaleProvider>,
    );
    const socket = joinPlayer();
    act(() =>
      socket.receive({ t: "state", view: makePlayerView({ phase: "starting" }) }),
    );
    expect(screen.getByText("Starting Imposter…")).toBeTruthy();
    expect(screen.queryByText(/already running/)).toBeNull();
  });

  it("keeps the waiting copy for a phone that joined during the start", () => {
    sessionStorage.setItem("opg:avatarPicked:BKTZ:p1", "1");
    render(
      <LocaleProvider>
        <PlayerApp code="BKTZ" />
      </LocaleProvider>,
    );
    const socket = joinPlayer();
    act(() =>
      socket.receive({
        t: "state",
        view: makePlayerView({
          phase: "starting",
          players: [makePlayer({ id: "p1", waitingForNextGame: true })],
        }),
      }),
    );
    expect(screen.getByText(/already running/)).toBeTruthy();
  });

  it("clears 'not enough players' once the players arrive", () => {
    sessionStorage.setItem("opg:avatarPicked:BKTZ:p1", "1");
    render(
      <LocaleProvider>
        <PlayerApp code="BKTZ" />
      </LocaleProvider>,
    );
    const socket = joinPlayer();
    act(() =>
      socket.receive({ t: "state", view: makePlayerView({ vipId: "p1" }) }),
    );
    act(() =>
      socket.receive({ t: "error", code: "not-enough-players", message: "" }),
    );
    expect(screen.getByText("Not enough players yet.")).toBeTruthy();

    act(() =>
      socket.receive({
        t: "state",
        view: makePlayerView({
          vipId: "p1",
          players: [
            makePlayer({ id: "p1" }),
            makePlayer({ id: "p2", name: "Sam" }),
            makePlayer({ id: "p3", name: "Ada" }),
          ],
        }),
      }),
    );
    expect(screen.queryByText("Not enough players yet.")).toBeNull();
  });

  it("leaves an error up while it is still true", () => {
    sessionStorage.setItem("opg:avatarPicked:BKTZ:p1", "1");
    render(
      <LocaleProvider>
        <PlayerApp code="BKTZ" />
      </LocaleProvider>,
    );
    const socket = joinPlayer();
    act(() =>
      socket.receive({ t: "state", view: makePlayerView({ vipId: "p1" }) }),
    );
    act(() =>
      socket.receive({ t: "error", code: "not-enough-players", message: "" }),
    );
    act(() =>
      socket.receive({
        t: "state",
        view: makePlayerView({
          vipId: "p1",
          players: [makePlayer({ id: "p1" }), makePlayer({ id: "p2", name: "Sam" })],
        }),
      }),
    );
    // Two of the three the game needs: the complaint has not been answered yet.
    expect(screen.getByText("Not enough players yet.")).toBeTruthy();
  });

  it("counts a disconnected phone the way the server does when clearing the error", () => {
    sessionStorage.setItem("opg:avatarPicked:BKTZ:p1", "1");
    render(
      <LocaleProvider>
        <PlayerApp code="BKTZ" />
      </LocaleProvider>,
    );
    const socket = joinPlayer();
    act(() =>
      socket.receive({ t: "state", view: makePlayerView({ vipId: "p1" }) }),
    );
    act(() =>
      socket.receive({ t: "error", code: "players-away", message: "" }),
    );
    expect(screen.getByText(/Some players are away/)).toBeTruthy();

    act(() =>
      socket.receive({
        t: "state",
        view: makePlayerView({
          vipId: "p1",
          players: [
            makePlayer({ id: "p1" }),
            makePlayer({ id: "p2", name: "Sam" }),
            makePlayer({ id: "p3", name: "Ada", connected: false }),
          ],
        }),
      }),
    );
    expect(screen.getByText(/Some players are away/)).toBeTruthy();
  });

  it("treats a retried join as in flight and drops the last complaint", async () => {
    stubRoomInfo();
    const user = userEvent.setup();
    render(
      <LocaleProvider>
        <PlayerApp code="BKTZ" />
      </LocaleProvider>,
    );
    const socket = lastSocket();
    act(() => socket.open());

    const nameField = screen.getByLabelText("Your name");
    await user.type(nameField, "Priya");
    await user.click(screen.getByRole("button", { name: /join/i }));
    act(() =>
      socket.receive({ t: "error", code: "name-taken", message: "taken" }),
    );
    expect(screen.getByText("That name is taken. Try another.")).toBeTruthy();

    await user.clear(nameField);
    await user.type(nameField, "Ada");
    await user.click(screen.getByRole("button", { name: /join/i }));
    await waitFor(() =>
      expect(socket.sent).toContain(JSON.stringify({ t: "join", name: "Ada" })),
    );
    expect(screen.queryByText("That name is taken. Try another.")).toBeNull();
    expect(screen.getByText("Joining…")).toBeTruthy();
  });

  it("keeps the screen awake once this phone has joined", () => {
    sessionStorage.setItem("opg:avatarPicked:BKTZ:p1", "1");
    const request = vi.fn<() => Promise<FakeWakeLockSentinel>>(() =>
      Promise.resolve(new FakeWakeLockSentinel()),
    );
    stubWakeLock(request);
    render(
      <LocaleProvider>
        <PlayerApp code="BKTZ" />
      </LocaleProvider>,
    );
    const socket = joinPlayer();
    act(() => socket.receive({ t: "state", view: makePlayerView() }));
    expect(request).toHaveBeenCalledWith("screen");
  });

  it("does not keep the screen awake before this phone joins", () => {
    const request = vi.fn<() => Promise<FakeWakeLockSentinel>>(() =>
      Promise.resolve(new FakeWakeLockSentinel()),
    );
    stubWakeLock(request);
    render(
      <LocaleProvider>
        <PlayerApp code="BKTZ" />
      </LocaleProvider>,
    );
    const socket = lastSocket();
    act(() => socket.open());
    expect(request).not.toHaveBeenCalled();
  });
});
