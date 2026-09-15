import { act, cleanup, render, screen } from "@testing-library/react";
import type { RoomView } from "@opg/protocol";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeWebSocket, lastSocket, resetFakeSockets } from "./fixtures/socket";
import {
  makeHostView,
  makePlayer,
  makePlayerView,
  makeResult,
} from "./fixtures/room";
import { realOrNahPreviews } from "@opg/game-real-or-nah/ui";
import { HostApp } from "./HostApp";

function connectHost(): FakeWebSocket {
  const socket = lastSocket();
  act(() => socket.open());
  act(() => socket.receive({ t: "welcome", role: "host" }));
  return socket;
}

function showState(socket: FakeWebSocket, view: RoomView) {
  act(() => socket.receive({ t: "state", view }));
}

beforeEach(() => {
  resetFakeSockets();
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("HostApp", () => {
  it("explains that the room is hosted elsewhere when there is no host token", () => {
    render(<HostApp code="BKTZ" />);
    expect(
      screen.getByText("This room is hosted on another screen"),
    ).toBeTruthy();
    expect(FakeWebSocket.instances).toHaveLength(0);
  });

  it("explains the same when the host token is rejected", () => {
    localStorage.setItem("opg:host:BKTZ", "tok");
    render(<HostApp code="BKTZ" />);
    const socket = connectHost();
    act(() =>
      socket.receive({
        t: "error",
        code: "host-token-invalid",
        message: "no",
      }),
    );
    expect(
      screen.getByText("This room is hosted on another screen"),
    ).toBeTruthy();
  });

  it("shows the connecting copy until the first view arrives", () => {
    localStorage.setItem("opg:host:BKTZ", "tok");
    render(<HostApp code="BKTZ" />);
    connectHost();
    expect(screen.getByText("Connecting…")).toBeTruthy();
    expect(screen.getByText("Finding the room.")).toBeTruthy();
  });

  it("shows the lobby for the join lobby screen", () => {
    localStorage.setItem("opg:host:BKTZ", "tok");
    const { container } = render(<HostApp code="BKTZ" />);
    const socket = connectHost();
    showState(socket, makeHostView());
    expect(screen.getByText("Who's here")).toBeTruthy();
    expect(screen.getByText("BKTZ")).toBeTruthy();
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("shows the game picker for the pick lobby screen", () => {
    localStorage.setItem("opg:host:BKTZ", "tok");
    render(<HostApp code="BKTZ" />);
    const socket = connectHost();
    showState(socket, makeHostView({ lobbyScreen: "pick" }));
    expect(screen.getByText("is picking a game")).toBeTruthy();
  });

  it("shows final scores for the results lobby screen", () => {
    localStorage.setItem("opg:host:BKTZ", "tok");
    const players = [
      makePlayer({ id: "p1", name: "Priya", isVip: true, crowns: 1 }),
      makePlayer({ id: "p2", name: "Sam", avatar: "star" }),
    ];
    render(<HostApp code="BKTZ" />);
    const socket = connectHost();
    showState(
      socket,
      makeHostView({
        lobbyScreen: "results",
        players,
        lastResult: makeResult({
          scores: { p1: 10, p2: 30 },
          winnerIds: ["p2"],
        }),
      }),
    );
    expect(screen.getByText("Sam wins the crown!")).toBeTruthy();
  });

  it("shows the starting copy while the room starts a game", () => {
    localStorage.setItem("opg:host:BKTZ", "tok");
    render(<HostApp code="BKTZ" />);
    const socket = connectHost();
    showState(socket, makeHostView({ phase: "starting" }));
    expect(screen.getByText("Starting Imposter…")).toBeTruthy();
  });

  it("shows the game stage when a game is running", () => {
    localStorage.setItem("opg:host:BKTZ", "tok");
    render(<HostApp code="BKTZ" />);
    const socket = connectHost();
    const preview = realOrNahPreviews.find((p) => p.surface === "host");
    if (!preview) throw new Error("missing host preview");
    showState(
      socket,
      makeHostView({
        phase: "in-game",
        game: { id: "real-or-nah", view: preview.view, deadline: null },
      }),
    );
    expect(screen.getByText(/went to war against/)).toBeTruthy();
  });

  it("explains when the room picked a game this screen cannot show", () => {
    localStorage.setItem("opg:host:BKTZ", "tok");
    render(<HostApp code="BKTZ" />);
    const socket = connectHost();
    showState(
      socket,
      makeHostView({
        phase: "in-game",
        game: { id: "no-such-game", view: {}, deadline: null },
      }),
    );
    expect(screen.getByText("Game not found")).toBeTruthy();
  });

  it("reports a reconnect when the socket drops mid-game", () => {
    localStorage.setItem("opg:host:BKTZ", "tok");
    render(<HostApp code="BKTZ" />);
    const socket = connectHost();
    act(() => socket.serverClose());
    expect(screen.getByText("Connecting…")).toBeTruthy();
    expect(screen.getByText("Reconnecting to the room.")).toBeTruthy();
  });

  it("keeps connecting when a frame that is not a host view arrives", () => {
    localStorage.setItem("opg:host:BKTZ", "tok");
    render(<HostApp code="BKTZ" />);
    const socket = connectHost();
    showState(socket, makePlayerView());
    expect(screen.getByText("Finding the room.")).toBeTruthy();
  });
});
