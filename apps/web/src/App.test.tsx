import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CueHandle, SoundEngine, SoundStatus } from "@opg/ui";
import { App, lazyEngine } from "./App";
import { resetFakeSockets } from "./screens/fixtures/socket";

class FakeEngine implements SoundEngine {
  preloadCount = 0;

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
    this.preloadCount += 1;
  }

  play(): CueHandle {
    return {
      stop() {
        /* nothing is playing */
      },
    };
  }

  playMusic(): void {
    /* no music in tests */
  }

  stopAll(): void {
    /* nothing is playing */
  }
}

function renderAt(path: string) {
  window.history.pushState(null, "", path);
  return render(<App />);
}

beforeEach(() => {
  resetFakeSockets();
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("App routing", () => {
  it("renders the TV landing at the root", () => {
    renderAt("/");
    expect(screen.getByText("Party games for")).toBeTruthy();
  });

  it("scales the landing inside the TV stage", () => {
    const { container } = renderAt("/");
    const stage = container.querySelector(".opg-grid-tv");
    expect(stage).not.toBeNull();
    expect(stage?.textContent).toContain("Party games for");
  });

  it("scales the credits page inside the TV stage", () => {
    const { container } = renderAt("/credits");
    expect(container.querySelector(".opg-grid-tv")).not.toBeNull();
  });

  it("renders the phone join form at /join", () => {
    renderAt("/join");
    expect(screen.getByText("Join a game")).toBeTruthy();
  });

  it("renders the player app at a room code", () => {
    renderAt("/BKTZ");
    expect(screen.getByText("Join a game")).toBeTruthy();
  });

  it("renders the host app at /host/<code>", () => {
    renderAt("/host/BKTZ");
    expect(
      screen.getByText("This room is hosted on another screen"),
    ).toBeTruthy();
  });

  it("renders the credits page", () => {
    renderAt("/credits");
    expect(screen.getByText("Credits")).toBeTruthy();
  });

  it("renders the privacy page", () => {
    renderAt("/privacy");
    expect(screen.getByText("Privacy")).toBeTruthy();
  });

  it("uses the injected engine on TV routes", () => {
    const engine = new FakeEngine();
    window.history.pushState(null, "", "/credits");
    render(<App engine={engine} />);
    expect(engine.preloadCount).toBe(1);
  });

  it("keeps phone routes on the silent engine", () => {
    const engine = new FakeEngine();
    window.history.pushState(null, "", "/join");
    render(<App engine={engine} />);
    expect(engine.preloadCount).toBe(0);
  });

  it("lazy-loads the dev sound board", async () => {
    renderAt("/dev/sounds");
    expect(await screen.findByText("Sound board")).toBeTruthy();
  });
});

describe("lazyEngine", () => {
  it("builds the engine only when asked, and only once", () => {
    const create = vi.fn<() => SoundEngine>(() => new FakeEngine());
    const get = lazyEngine(create);
    expect(create).not.toHaveBeenCalled();
    const first = get();
    expect(get()).toBe(first);
    expect(create).toHaveBeenCalledTimes(1);
  });
});
