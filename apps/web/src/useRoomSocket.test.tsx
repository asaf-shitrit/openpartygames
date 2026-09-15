import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RoomView } from "@opg/protocol";
import { useRoomSocket } from "./useRoomSocket";

type Listener = (event: Event) => void;

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readonly url: string;
  readyState = FakeWebSocket.CONNECTING;
  readonly sent: string[] = [];
  private readonly listeners = new Map<string, Set<Listener>>();

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: Listener): void {
    const set = this.listeners.get(type) ?? new Set<Listener>();
    set.add(listener);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, listener: Listener): void {
    this.listeners.get(type)?.delete(listener);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.emit("close");
  }

  open(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.emit("open");
  }

  serverClose(): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.emit("close");
  }

  receive(data: string): void {
    this.emit("message", new MessageEvent("message", { data }));
  }

  private emit(type: string, event: Event = new Event(type)): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

function lastSocket(): FakeWebSocket {
  const socket = FakeWebSocket.instances.at(-1);
  if (!socket) throw new Error("no socket was opened");
  return socket;
}

function testView(): RoomView {
  return {
    role: "player",
    you: "p1",
    code: "BKTZ",
    phase: "lobby",
    lobbyScreen: "join",
    players: [],
    vipId: null,
    locked: false,
    games: [],
    selectedGameId: "",
    packs: [],
    lastResult: null,
    game: null,
    serverNow: 0,
  };
}

beforeEach(() => {
  FakeWebSocket.instances = [];
  localStorage.clear();
  sessionStorage.clear();
  vi.stubGlobal("WebSocket", FakeWebSocket);
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useRoomSocket", () => {
  it("sends host-hello once open for the host role", () => {
    renderHook(() =>
      useRoomSocket({ code: "BKTZ", role: "host", hostToken: "host-tok" }),
    );
    const socket = lastSocket();
    expect(socket.url).toContain("/ws/BKTZ");
    act(() => socket.open());
    expect(socket.sent).toEqual([
      JSON.stringify({ t: "host-hello", hostToken: "host-tok" }),
    ]);
  });

  it("joins with a stored player token", () => {
    localStorage.setItem("opg:player:BKTZ", "stored-tok");
    renderHook(() => useRoomSocket({ code: "BKTZ", role: "player" }));
    const socket = lastSocket();
    act(() => socket.open());
    expect(socket.sent).toEqual([
      JSON.stringify({ t: "join", name: "", token: "stored-tok" }),
    ]);
  });

  it("joins with the provided name when there is no token", () => {
    renderHook(() =>
      useRoomSocket({ code: "BKTZ", role: "player", name: "Priya" }),
    );
    const socket = lastSocket();
    act(() => socket.open());
    expect(socket.sent).toEqual([JSON.stringify({ t: "join", name: "Priya" })]);
  });

  it("stores the token and player id from a player welcome", () => {
    const { result } = renderHook(() =>
      useRoomSocket({ code: "BKTZ", role: "player" }),
    );
    const socket = lastSocket();
    act(() => socket.open());
    act(() =>
      socket.receive(
        JSON.stringify({
          t: "welcome",
          role: "player",
          playerId: "p1",
          token: "fresh-tok",
        }),
      ),
    );
    expect(result.current.playerId).toBe("p1");
    expect(localStorage.getItem("opg:player:BKTZ")).toBe("fresh-tok");
  });

  it("updates the view on state and clears it on error", () => {
    const { result } = renderHook(() =>
      useRoomSocket({ code: "BKTZ", role: "player" }),
    );
    const socket = lastSocket();
    act(() => socket.open());
    const view = testView();
    act(() => socket.receive(JSON.stringify({ t: "state", view })));
    expect(result.current.view).toEqual(view);
    act(() =>
      socket.receive(
        JSON.stringify({ t: "error", code: "name-taken", message: "taken" }),
      ),
    );
    expect(result.current.lastError).toEqual({
      code: "name-taken",
      message: "taken",
    });
  });

  it("ignores malformed frames instead of throwing", () => {
    const { result } = renderHook(() =>
      useRoomSocket({ code: "BKTZ", role: "player" }),
    );
    const socket = lastSocket();
    act(() => socket.open());
    act(() => socket.receive("not json"));
    act(() => socket.receive(JSON.stringify({ t: "nope" })));
    act(() => socket.receive(JSON.stringify({ t: "state", view: null })));
    expect(result.current.view).toBeNull();
    expect(result.current.lastError).toBeNull();
  });

  it("marks kicked and closes the connection", () => {
    const { result } = renderHook(() =>
      useRoomSocket({ code: "BKTZ", role: "player" }),
    );
    const socket = lastSocket();
    act(() => socket.open());
    act(() => socket.receive(JSON.stringify({ t: "kicked" })));
    expect(result.current.kicked).toBe(true);
    expect(result.current.status).toBe("closed");
  });

  it("sends a ping every 25 seconds while open", () => {
    renderHook(() => useRoomSocket({ code: "BKTZ", role: "player" }));
    const socket = lastSocket();
    act(() => socket.open());
    act(() => {
      vi.advanceTimersByTime(25_000);
    });
    expect(socket.sent).toContain("ping");
  });

  it("reconnects with backoff capped at 5 seconds", () => {
    renderHook(() => useRoomSocket({ code: "BKTZ", role: "player" }));
    act(() => lastSocket().open());
    expect(FakeWebSocket.instances).toHaveLength(1);

    const delays = [500, 1000, 2000, 4000, 5000, 5000];
    let opened = 1;
    for (const delay of delays) {
      act(() => lastSocket().serverClose());
      act(() => {
        vi.advanceTimersByTime(delay - 1);
      });
      expect(FakeWebSocket.instances).toHaveLength(opened);
      act(() => {
        vi.advanceTimersByTime(1);
      });
      opened += 1;
      expect(FakeWebSocket.instances).toHaveLength(opened);
    }
  });

  it("only sends messages once the socket is open", () => {
    const { result } = renderHook(() =>
      useRoomSocket({ code: "BKTZ", role: "player" }),
    );
    const socket = lastSocket();
    act(() => result.current.send({ t: "skip-phase" }));
    expect(socket.sent).toEqual([]);
    act(() => socket.open());
    act(() => result.current.send({ t: "skip-phase" }));
    expect(socket.sent).toContain(JSON.stringify({ t: "skip-phase" }));
  });

  it("does nothing when disabled", () => {
    const { result } = renderHook(() =>
      useRoomSocket({ code: "BKTZ", role: "player", enabled: false }),
    );
    expect(FakeWebSocket.instances).toHaveLength(0);
    expect(result.current.status).toBe("closed");
  });
});