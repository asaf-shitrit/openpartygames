// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import type { CueId, ServerClock, SoundEngine } from "@opg/ui";
import { SoundProvider } from "@opg/ui";
import { HostReveal, measureTargets, wobbleTiles } from "./HostReveal";
import { REVEAL_PREVIEW_START, imposterPreviews } from "./preview";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

interface RecordingEngine extends SoundEngine {
  cues: CueId[];
}

/** Minimal engine: records every cue and never makes a sound. */
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
  const preview = imposterPreviews.find(
    (candidate) => candidate.label === label,
  );
  if (preview === undefined) throw new Error(`no preview labelled ${label}`);
  if (preview.room.role !== "host") throw new Error(`${label} is not a host`);
  if (!("votedIds" in preview.view)) {
    throw new Error(`${label} is not a host view`);
  }
  return { view: preview.view, room: preview.room };
}

/**
 * Mounts the reveal as if `elapsedMs` had passed since the reveal started.
 * `advanceTo` moves the fake clock and fake timers together, one beat at a time.
 */
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
  it("holds the stamp until the verdict and plays the cues in order", () => {
    vi.useFakeTimers();
    const { engine, advanceTo, rendered } = setup("Host: reveal", 0);

    expect(screen.queryByText("Imposter!")).toBeNull();
    expect(screen.queryByText("And the imposter is…")).toBeNull();

    advanceTo(4000);
    expect(screen.queryByText("Imposter!")).toBeNull();

    advanceTo(5600);
    expect(screen.getByText("And the imposter is…")).toBeTruthy();
    expect(screen.queryByText("Imposter!")).toBeNull();

    advanceTo(7900);
    expect(screen.queryByText("Imposter!")).toBeNull();
    const footer = rendered.container.querySelector(
      '[data-testid="reveal-footer"]',
    );
    if (!(footer instanceof HTMLElement)) throw new Error("no footer");
    expect(footer.style.visibility).toBe("hidden");

    advanceTo(8100);
    expect(screen.getByText("Imposter!")).toBeTruthy();
    const stampBadge =
      screen.getByText("Imposter!").parentElement?.parentElement;
    expect(stampBadge?.style.whiteSpace).toBe("nowrap");

    expect(engine.cues).toEqual([
      "whoosh",
      "scratch",
      "scratch",
      "scratch",
      "scratch",
      "scratch",
      "scratch",
      "drumroll",
      "slam",
    ]);

    advanceTo(9100);
    expect(screen.getByText("Priya's decoy word was")).toBeTruthy();
    expect(footer.style.visibility).toBe("visible");

    advanceTo(10600);
    expect(screen.getByText("One last chance, Priya…")).toBeTruthy();
    expect(engine.cues.at(-1)).toBe("tape");
  });
});

describe("HostReveal, mounted late", () => {
  it("renders the settled end state with no cues", () => {
    vi.useFakeTimers();
    const { engine } = setup("Host: reveal", 11200);

    expect(screen.getByText("Imposter!")).toBeTruthy();
    expect(screen.getByText("Priya's decoy word was")).toBeTruthy();
    expect(screen.getByText("One last chance, Priya…")).toBeTruthy();
    expect(engine.cues).toEqual([]);
  });

  it("states the caught verdict for screen readers", () => {
    vi.useFakeTimers();
    setup("Host: reveal", 11200);
    expect(screen.getByRole("status").textContent).toBe(
      "Priya was the imposter and got caught.",
    );
  });
});

describe("HostReveal, other outcomes", () => {
  it("says who was accused when the votes were wrong", () => {
    vi.useFakeTimers();
    setup("Host: reveal wrong", 11200);
    expect(screen.getByText("Not the imposter")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe(
      "Dov was not the imposter. Priya got away.",
    );
  });

  it("calls a tie a tie and never a catch", () => {
    vi.useFakeTimers();
    setup("Host: reveal tie", 11200);
    expect(screen.getByText("It's a tie!")).toBeTruthy();
    expect(screen.queryByText("Not the imposter")).toBeNull();
    expect(screen.getByRole("status").textContent).toBe(
      "It's a tie. Priya got away.",
    );
  });

  it("calls out a vote where nobody voted", () => {
    vi.useFakeTimers();
    setup("Host: reveal no votes", 11200);
    expect(screen.getByText("No votes?!")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe(
      "Nobody voted. Priya got away.",
    );
  });
});

describe("HostReveal, suspense", () => {
  it("cuts a spotlight hole over the top-voted tile", () => {
    vi.useFakeTimers();
    const { rendered } = setup("Host: reveal", 6500);
    const circles = rendered.container.querySelectorAll("mask circle");
    expect(circles).toHaveLength(1);
    expect(screen.getByText("And the imposter is…")).toBeTruthy();
  });

  it("counts the votes drawn so far with the right plural", () => {
    vi.useFakeTimers();
    setup("Host: reveal", 11200);
    expect(screen.getAllByText("1 vote").length).toBeGreaterThan(0);
    expect(screen.getAllByText("4 votes").length).toBeGreaterThan(0);
    expect(screen.getAllByText("0 votes").length).toBeGreaterThan(0);
  });
});

describe("HostReveal, reserved heights", () => {
  it("reserves the caption and centered verdict heights from mount", () => {
    vi.useFakeTimers();
    const { rendered, advanceTo } = setup("Host: reveal tie", 0);
    const caption = rendered.container.querySelector(
      '[data-testid="reveal-caption"]',
    );
    const verdict = rendered.container.querySelector(
      '[data-testid="reveal-centered-verdict"]',
    );
    if (!(caption instanceof HTMLElement)) throw new Error("no caption");
    if (!(verdict instanceof HTMLElement)) throw new Error("no verdict slot");
    const captionHeight = caption.style.height;
    const verdictHeight = verdict.style.height;
    expect(captionHeight).not.toBe("");
    expect(verdictHeight).not.toBe("");
    expect(caption.style.visibility).toBe("hidden");
    expect(verdict.style.visibility).toBe("hidden");

    advanceTo(8100);
    expect(caption.style.visibility).toBe("visible");
    expect(verdict.style.visibility).toBe("visible");
    expect(screen.getByText("It's a tie!")).toBeTruthy();
    expect(caption.style.height).toBe(captionHeight);
    expect(verdict.style.height).toBe(verdictHeight);
  });
});

describe("spotlight helpers", () => {
  it("measures a tile relative to the reveal root", () => {
    const root = document.createElement("div");
    const tile = document.createElement("div");
    tile.dataset.tileId = "priya";
    for (const [key, value] of Object.entries({
      offsetLeft: 100,
      offsetTop: 40,
      offsetWidth: 200,
      offsetHeight: 300,
    })) {
      Object.defineProperty(tile, key, { configurable: true, value });
    }
    root.append(tile);
    expect(measureTargets(root, ["priya"])).toEqual([
      { id: "priya", x: 200, y: 190, radius: 174 },
    ]);
  });

  it("measures nothing without a root", () => {
    expect(measureTargets(null, ["priya"])).toEqual([]);
  });

  it("skips targets that have no tile", () => {
    const root = document.createElement("div");
    expect(measureTargets(root, ["priya"])).toEqual([]);
  });

  it("wobbles nothing without a root", () => {
    expect(() => wobbleTiles(null, ["priya"], false)).not.toThrow();
  });
});
