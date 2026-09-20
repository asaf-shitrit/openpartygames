// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import type { CueId, ServerClock, SoundEngine } from "@opg/ui";
import { SoundProvider } from "@opg/ui";
import type { PlayerSummary } from "@opg/protocol";
import type { DoodleHostView, DoodleReveal } from "../state";
import { HostReveal } from "./HostReveal";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function recordingEngine(): SoundEngine & { cues: CueId[] } {
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

const START = 1_700_000_000_000;

const PLAYERS: PlayerSummary[] = [
  { id: "maya", name: "Maya", avatar: "star", connected: true, isVip: true, crowns: 0, waitingForNextGame: false },
  { id: "dov", name: "Dov", avatar: "toast", connected: true, isVip: false, crowns: 0, waitingForNextGame: false },
  { id: "priya", name: "Priya", avatar: "drop", connected: true, isVip: false, crowns: 0, waitingForNextGame: false },
];

const REVEAL: DoodleReveal = {
  artistId: "priya",
  drawingId: "priya:0",
  doodle: { v: 1, s: [{ c: 0, d: 200, g: 0, p: [10, 10, 4, 4] }] },
  truthOptionId: "o1",
  prompt: "a dog on a scooter",
  foundByIds: ["maya"],
  titles: [
    { optionId: "o2", text: "a cat riding a skateboard", authorId: "dov", fooledIds: ["maya"], points: 500 },
  ],
  artistPoints: 500,
};

function hostView(overrides: Partial<DoodleHostView> = {}): DoodleHostView {
  return {
    phase: "reveal",
    playerIds: ["maya", "dov", "priya"],
    drawnIds: [],
    drawnCounts: {},
    roundNumber: 1,
    roundCount: 6,
    artistId: "priya",
    doodle: REVEAL.doodle,
    writtenIds: [],
    votedIds: [],
    options: null,
    reveal: REVEAL,
    pointsThisRound: { maya: 1000, dov: 500, priya: 500 },
    totals: { maya: 1000, dov: 500, priya: 500 },
    gallery: null,
    ...overrides,
  };
}

function setup(elapsedMs: number, view: DoodleHostView = hostView()) {
  const engine = recordingEngine();
  let fakeNow = START + elapsedMs;
  const clock: ServerClock = { now: () => fakeNow };
  const advanceTo = (targetMs: number) => {
    const target = START + targetMs;
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
      <HostReveal view={view} players={PLAYERS} deadline={START + 12000} timerStartedAt={START} clock={clock} />
    </SoundProvider>,
  );
  return { engine, advanceTo, rendered };
}

describe("HostReveal, staged from the start", () => {
  it("holds the truth until its beat", () => {
    vi.useFakeTimers();
    setup(0);
    expect(screen.queryByText("a dog on a scooter")).toBeNull();
  });

  it("reveals the truth, finders and artist points at the truth beat", () => {
    vi.useFakeTimers();
    const { advanceTo } = setup(0);
    advanceTo(7300);
    expect(screen.getByText("a dog on a scooter")).toBeTruthy();
    expect(screen.getByText("Maya")).toBeTruthy();
    expect(screen.getByText(/Drawn by Priya/)).toBeTruthy();
  });

  it("shows the fake title once its beat is reached", () => {
    vi.useFakeTimers();
    const { advanceTo } = setup(0);
    advanceTo(2700);
    expect(screen.getByText("a cat riding a skateboard")).toBeTruthy();
    expect(screen.getByText("Written by Dov")).toBeTruthy();
  });

  it("shows nobody found it when foundByIds is empty", () => {
    vi.useFakeTimers();
    const view = hostView({
      reveal: { ...REVEAL, foundByIds: [], artistPoints: 0 },
    });
    const { advanceTo } = setup(0, view);
    advanceTo(7300);
    expect(screen.getByText("Nobody found it! Tricky one.")).toBeTruthy();
  });
});

describe("HostReveal, mounted mid-phase", () => {
  it("lands the right frame and fires no already-played cues", () => {
    vi.useFakeTimers();
    const { engine } = setup(7500);
    expect(screen.getByText("a dog on a scooter")).toBeTruthy();
    expect(engine.cues).not.toContain("whoosh");
  });
});

describe("HostReveal with no reveal yet", () => {
  it("renders nothing", () => {
    vi.useFakeTimers();
    const { rendered } = setup(0, hostView({ reveal: null }));
    expect(rendered.container.textContent).toBe("");
  });
});
