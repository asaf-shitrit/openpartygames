import { act, cleanup, render, screen } from "@testing-library/react";
import type { RoomView } from "@opg/protocol";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SoundProvider } from "@opg/ui";
import type { CueHandle, CueId, MusicId, SoundEngine, SoundStatus } from "@opg/ui";
import { FakeWebSocket, lastSocket, resetFakeSockets } from "./fixtures/socket";
import {
  FakeWakeLockSentinel,
  restoreWakeLock,
  stubWakeLock,
} from "./fixtures/wakeLock";
import {
  makeHostView,
  makePlayer,
  makePlayerView,
  makeResult,
} from "./fixtures/room";
import { realOrNahPreviews } from "@opg/game-real-or-nah/ui";
import { HostApp } from "./HostApp";

class FakeEngine implements SoundEngine {
  readonly cues: CueId[] = [];
  readonly musicCalls: (MusicId | null)[] = [];

  status(): SoundStatus {
    return "running";
  }

  subscribe(): () => void {
    return () => {
      /* status never changes */
    };
  }

  unlock(): void {
    /* nothing to resume */
  }

  setMuted(): void {
    /* nothing to mute */
  }

  preload(): void {
    /* no samples */
  }

  play(cue: CueId): CueHandle {
    this.cues.push(cue);
    return {
      stop() {
        /* nothing is playing */
      },
    };
  }

  playMusic(id: MusicId | null): void {
    this.musicCalls.push(id);
  }

  stopAll(): void {
    /* nothing is playing */
  }
}

function renderHost(engine: SoundEngine, code = "BKTZ") {
  return render(
    <SoundProvider engine={engine}>
      <HostApp code={code} />
    </SoundProvider>,
  );
}

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
  restoreWakeLock();
});


/** Music claims reach the engine on a microtask, so same-commit changes coalesce. */
async function flushMusicClaims(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

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
        game: {
          id: "real-or-nah",
          view: preview.view,
          stage: null,
          deadline: null,
          timerStartedAt: null,
        },
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
        game: {
          id: "no-such-game",
          view: {},
          stage: null,
          deadline: null,
          timerStartedAt: null,
        },
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

  it("keeps the board and overlays a reconnect when the socket drops mid-game", () => {
    localStorage.setItem("opg:host:BKTZ", "tok");
    const { container } = render(<HostApp code="BKTZ" />);
    const socket = connectHost();
    showState(socket, makeHostView());
    act(() => socket.serverClose());
    expect(screen.getByText("Grab your phone!")).toBeTruthy();
    expect(screen.getByText("Reconnecting…")).toBeTruthy();
    const overlay = container.querySelector("output");
    expect(overlay).not.toBeNull();
    expect(overlay?.getAttribute("aria-live")).toBe("polite");
  });

  it("drops the reconnect overlay once a fresh state arrives on an open socket", () => {
    localStorage.setItem("opg:host:BKTZ", "tok");
    render(<HostApp code="BKTZ" />);
    const socket = connectHost();
    showState(socket, makeHostView());
    act(() => socket.serverClose());
    expect(screen.getByText("Reconnecting…")).toBeTruthy();
    act(() => socket.open());
    showState(socket, makeHostView());
    expect(screen.queryByText("Reconnecting…")).toBeNull();
  });

  it("shows no reconnect overlay while the socket stays open", () => {
    localStorage.setItem("opg:host:BKTZ", "tok");
    const { container } = render(<HostApp code="BKTZ" />);
    const socket = connectHost();
    showState(socket, makeHostView());
    expect(screen.queryByText("Reconnecting…")).toBeNull();
    expect(container.querySelector("output")).toBeNull();
  });

  it("keeps connecting when a frame that is not a host view arrives", () => {
    localStorage.setItem("opg:host:BKTZ", "tok");
    render(<HostApp code="BKTZ" />);
    const socket = connectHost();
    showState(socket, makePlayerView());
    expect(screen.getByText("Finding the room.")).toBeTruthy();
  });

  it("keeps the screen awake while hosting", () => {
    localStorage.setItem("opg:host:BKTZ", "tok");
    const request = vi.fn<() => Promise<FakeWakeLockSentinel>>(() =>
      Promise.resolve(new FakeWakeLockSentinel()),
    );
    stubWakeLock(request);
    render(<HostApp code="BKTZ" />);
    const socket = connectHost();
    showState(socket, makeHostView());
    expect(request).toHaveBeenCalledWith("screen");
  });

  it("claims the lobby music for the join and pick screens", async () => {
    localStorage.setItem("opg:host:BKTZ", "tok");
    const engine = new FakeEngine();
    renderHost(engine);
    const socket = connectHost();
    showState(socket, makeHostView({ lobbyScreen: "join" }));
    await flushMusicClaims();
    expect(engine.musicCalls).toEqual(["lobby"]);
    showState(socket, makeHostView({ lobbyScreen: "pick" }));
    await flushMusicClaims();
    expect(engine.musicCalls).toEqual(["lobby"]);
  });

  it("drops the music while starting and in-game", async () => {
    localStorage.setItem("opg:host:BKTZ", "tok");
    const engine = new FakeEngine();
    renderHost(engine);
    const socket = connectHost();
    showState(socket, makeHostView());
    await flushMusicClaims();
    expect(engine.musicCalls).toEqual(["lobby"]);
    showState(socket, makeHostView({ phase: "starting" }));
    await flushMusicClaims();
    expect(engine.musicCalls).toEqual(["lobby", null]);
  });

  it("plays the start stinger on a live phase change to starting, not on mount", () => {
    localStorage.setItem("opg:host:BKTZ", "tok");
    const engine = new FakeEngine();
    renderHost(engine);
    const socket = connectHost();
    showState(socket, makeHostView({ phase: "starting" }));
    expect(engine.cues).not.toContain("jingle-start");
    showState(socket, makeHostView());
    showState(socket, makeHostView({ phase: "starting" }));
    expect(engine.cues).toContain("jingle-start");
  });

  it("plays a whoosh on a live screen change but not on the first screen shown", () => {
    localStorage.setItem("opg:host:BKTZ", "tok");
    const engine = new FakeEngine();
    renderHost(engine);
    const socket = connectHost();
    showState(socket, makeHostView({ lobbyScreen: "join" }));
    expect(engine.cues).not.toContain("whoosh");
    showState(socket, makeHostView({ lobbyScreen: "pick" }));
    expect(engine.cues).toContain("whoosh");
  });
});
