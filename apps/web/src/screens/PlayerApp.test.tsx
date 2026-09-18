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

  it("shows results above the VIP controls for the VIP, who can still pick", () => {
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
    expect(screen.getByText(/finished/)).toBeTruthy();
    expect(screen.getByText("You're the VIP")).toBeTruthy();
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

  it("renders the active game UI for a playing player", () => {
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
    expect(screen.getByText(/went to war against/)).toBeTruthy();
  });

  it("keeps rendering the game when a shared stage rides along with the view", () => {
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
    expect(screen.getByText(/went to war against/)).toBeTruthy();
  });

  it("keeps rendering the game when the shared stage is malformed", () => {
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
    expect(screen.getByText(/went to war against/)).toBeTruthy();
  });

  it("shows the reconnecting overlay when the socket drops with a seat", () => {
    sessionStorage.setItem("opg:avatarPicked:BKTZ:p1", "1");
    render(
      <LocaleProvider>
        <PlayerApp code="BKTZ" />
      </LocaleProvider>,
    );
    const socket = joinPlayer();
    act(() => socket.receive({ t: "state", view: makePlayerView() }));
    act(() => socket.serverClose());
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

  it("falls back to the server message for an unmapped error code", () => {
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
    expect(screen.getByText("Huh?")).toBeTruthy();
  });

  it("shows generic copy when the server sends no error message", () => {
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
    expect(screen.getByText("Something went wrong. Try again.")).toBeTruthy();
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
