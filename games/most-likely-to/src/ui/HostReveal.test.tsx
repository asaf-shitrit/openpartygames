// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import type { CueId, ServerClock, SoundEngine } from "@opg/ui";
import { SoundProvider } from "@opg/ui";
import { fireCue, HostReveal, joinNames, measureTargets } from "./HostReveal";
import { REVEAL_PREVIEW_START, mostLikelyToPreviews } from "./preview";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

interface RecordingEngine extends SoundEngine {
  cues: CueId[];
}

function recordingEngine(): RecordingEngine {
  const cues: CueId[] = [];
  return {
    cues,
    status: () => "running",
    subscribe: () => () => undefined,
    unlock() {},
    setMuted() {},
    preload() {},
    play(cue) {
      cues.push(cue);
      return { stop() {} };
    },
    playMusic() {},
    stopAll() {},
  };
}

function hostSample(label: string) {
  const preview = mostLikelyToPreviews.find(
    (candidate) => candidate.label === label,
  );
  if (preview === undefined) throw new Error(`no preview labelled ${label}`);
  if (preview.room.role !== "host") throw new Error(`${label} is not a host`);
  if (!("votedIds" in preview.view)) {
    throw new Error(`${label} is not a host view`);
  }
  return { view: preview.view, room: preview.room };
}

function setup(label: string, elapsedMs: number) {
  const { view, room } = hostSample(label);
  const engine = recordingEngine();
  let fakeNow = REVEAL_PREVIEW_START + elapsedMs;
  const clock: ServerClock = { now: () => fakeNow };
  const advanceTo = (targetMs: number) => {
    const target = REVEAL_PREVIEW_START + targetMs;
    while (fakeNow < target) {
      const step = Math.min(400, target - fakeNow);
      fakeNow += step;
      act(() => {
        vi.advanceTimersByTime(step);
      });
    }
  };
  const rendered = render(
    <SoundProvider engine={engine}>
      <HostReveal
        view={view}
        players={room.players}
        deadline={room.game?.deadline ?? null}
        timerStartedAt={room.game?.timerStartedAt ?? null}
        clock={clock}
      />
    </SoundProvider>,
  );
  return { engine, advanceTo, rendered };
}

describe("HostReveal, staged from the start", () => {
  it("holds the stamp until the verdict beat", () => {
    vi.useFakeTimers();
    const { advanceTo } = setup("Host: reveal picked", 0);

    expect(screen.queryByText("Most likely!")).toBeNull();
    advanceTo(4000);
    expect(screen.queryByText("Most likely!")).toBeNull();
    advanceTo(7900);
    expect(screen.queryByText("Most likely!")).toBeNull();

    advanceTo(8100);
    expect(screen.getByText("Most likely!")).toBeTruthy();
  });

  it("plays the cues in order", () => {
    vi.useFakeTimers();
    const { engine, advanceTo } = setup("Host: reveal picked", 0);
    advanceTo(10600);
    expect(engine.cues[0]).toBe("whoosh");
    expect(engine.cues.filter((cue) => cue === "scratch").length).toBe(6);
    expect(engine.cues).toContain("drumroll");
    expect(engine.cues).toContain("slam");
    expect(engine.cues).toContain("pop");
    expect(engine.cues.at(-1)).toBe("tape");
  });
});

describe("HostReveal, verdict per outcome", () => {
  it("stamps the pick's tile and names them at settle", () => {
    vi.useFakeTimers();
    setup("Host: reveal picked", 11200);
    expect(screen.getByText("Most likely!")).toBeTruthy();
    expect(screen.getByText("Explain yourself, Dov!")).toBeTruthy();
  });

  it("stamps a tie and explains both names", () => {
    vi.useFakeTimers();
    setup("Host: reveal tie", 11200);
    expect(screen.getByText("It's a tie!")).toBeTruthy();
    expect(screen.getByText("Explain yourselves, Dov and Priya!")).toBeTruthy();
  });

  it("says no clear pick on a split vote", () => {
    vi.useFakeTimers();
    const { rendered } = setup("Host: reveal split", 11200);
    const verdict = rendered.container.querySelector(
      '[data-testid="reveal-centered-verdict"]',
    );
    expect(verdict?.textContent).toBe("No clear pick");
    expect(screen.queryByText(/Explain/)).toBeNull();
  });

  it("says no votes when nobody voted", () => {
    vi.useFakeTimers();
    const { rendered } = setup("Host: reveal no votes", 11200);
    const verdict = rendered.container.querySelector(
      '[data-testid="reveal-centered-verdict"]',
    );
    expect(verdict?.textContent).toBe("No votes?!");
  });
});

describe("HostReveal, points line", () => {
  it("shows nothing before the points beat", () => {
    vi.useFakeTimers();
    const { advanceTo } = setup("Host: reveal picked", 0);
    advanceTo(8500);
    expect(
      screen.queryByText("Maya, Priya, Sam and Noa read the room: +500 each"),
    ).toBeNull();
  });

  it("names everyone who matched, +500 each", () => {
    vi.useFakeTimers();
    setup("Host: reveal picked", 11200);
    expect(
      screen.getByText("Maya, Priya, Sam and Noa read the room: +500 each"),
    ).toBeTruthy();
  });

  it("says nobody read the room on a split vote", () => {
    vi.useFakeTimers();
    setup("Host: reveal split", 11200);
    expect(screen.getByText("Nobody read the room this time")).toBeTruthy();
  });
});

describe("HostReveal, next note", () => {
  it("points to the next prompt mid-game", () => {
    vi.useFakeTimers();
    setup("Host: reveal picked", 11200);
    expect(screen.getByText("Next prompt coming up")).toBeTruthy();
  });

  it("points to final scores on the last round", () => {
    vi.useFakeTimers();
    const { view, room } = hostSample("Host: reveal picked");
    const finalView = { ...view, roundNumber: view.roundCount };
    const clock: ServerClock = { now: () => REVEAL_PREVIEW_START + 11200 };
    render(
      <HostReveal
        view={finalView}
        players={room.players}
        deadline={room.game?.deadline ?? null}
        timerStartedAt={room.game?.timerStartedAt ?? null}
        clock={clock}
      />,
    );
    expect(screen.getByText("Final scores next")).toBeTruthy();
  });
});

describe("HostReveal, mounted late", () => {
  it("renders the settled end state with no cues", () => {
    vi.useFakeTimers();
    const { engine } = setup("Host: reveal picked", 11200);
    expect(screen.getByText("Most likely!")).toBeTruthy();
    expect(engine.cues).toEqual([]);
  });

  it("states the verdict for screen readers", () => {
    vi.useFakeTimers();
    setup("Host: reveal picked", 11200);
    expect(screen.getByRole("status").textContent).toBe(
      "Most likely! Explain yourself, Dov!",
    );
  });
});

describe("HostReveal, after a kick", () => {
  it("falls back to Someone for the kicked player's tile", () => {
    vi.useFakeTimers();
    setup("Host: reveal after kick", 11200);
    expect(screen.getAllByText("Someone").length).toBeGreaterThan(0);
    expect(screen.getByText("Explain yourself, Someone!")).toBeTruthy();
  });
});

describe("HostReveal, no reveal yet", () => {
  it("falls back to a no-votes storyboard instead of crashing", () => {
    vi.useFakeTimers();
    const { view, room } = hostSample("Host: reveal picked");
    const clock: ServerClock = { now: () => REVEAL_PREVIEW_START + 11200 };
    const { container } = render(
      <HostReveal
        view={{ ...view, reveal: null }}
        players={room.players}
        deadline={room.game?.deadline ?? null}
        timerStartedAt={room.game?.timerStartedAt ?? null}
        clock={clock}
      />,
    );
    const verdict = container.querySelector(
      '[data-testid="reveal-centered-verdict"]',
    );
    expect(verdict?.textContent).toBe("No votes?!");
  });
});

describe("fireCue", () => {
  it("plays a beat's cue", () => {
    const calls: unknown[] = [];
    const play = (cue: CueId) => {
      calls.push(cue);
      return { stop() {} };
    };
    fireCue(play, { id: "suspense", atMs: 5500, cue: "drumroll" });
    expect(calls).toEqual(["drumroll"]);
  });

  it("does nothing for a beat with no cue", () => {
    const calls: unknown[] = [];
    const play = (cue: CueId) => {
      calls.push(cue);
      return { stop() {} };
    };
    fireCue(play, { id: "silent", atMs: 0 });
    expect(calls).toEqual([]);
  });
});

describe("joinNames", () => {
  it("joins one, two and several names in prose", () => {
    expect(joinNames(["Maya"])).toBe("Maya");
    expect(joinNames(["Maya", "Dov"])).toBe("Maya and Dov");
    expect(joinNames(["Maya", "Dov", "Priya"])).toBe("Maya, Dov and Priya");
    expect(joinNames([])).toBe("");
  });
});

describe("measureTargets", () => {
  it("measures a tile relative to the reveal root", () => {
    const root = document.createElement("div");
    const tile = document.createElement("div");
    tile.dataset.tileId = "dov";
    for (const [key, value] of Object.entries({
      offsetLeft: 100,
      offsetTop: 40,
      offsetWidth: 200,
      offsetHeight: 300,
    })) {
      Object.defineProperty(tile, key, { configurable: true, value });
    }
    root.append(tile);
    expect(measureTargets(root, ["dov"])).toEqual([
      { id: "dov", x: 200, y: 190, radius: 174 },
    ]);
  });

  it("measures nothing without a root", () => {
    expect(measureTargets(null, ["dov"])).toEqual([]);
  });

  it("skips targets that have no tile", () => {
    const root = document.createElement("div");
    expect(measureTargets(root, ["dov"])).toEqual([]);
  });
});
