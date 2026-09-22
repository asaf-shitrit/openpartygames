// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import type { PlayerSummary } from "@opg/protocol";
import type { ServerClock } from "@opg/ui";
import { LocaleProvider } from "@opg/i18n";
import type { DoodleHostView, DoodlePlayerView, DoodleReveal } from "../state";
import { PhoneReveal } from "./PhoneReveal";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  window.localStorage.clear();
});

const START = 1_700_000_000_000;

const PLAYERS: PlayerSummary[] = [
  { id: "maya", name: "Maya", avatar: "star", connected: true, isVip: true, crowns: 0, waitingForNextGame: false },
];

const REVEAL: DoodleReveal = {
  artistId: "priya",
  drawingId: "priya:0",
  doodle: { v: 1, s: [] },
  truthOptionId: "o1",
  prompt: "a dog on a scooter",
  foundByIds: ["maya"],
  titles: [],
  artistPoints: 0,
};

function playerView(overrides: Partial<DoodlePlayerView> = {}): DoodlePlayerView {
  return {
    phase: "reveal",
    playerCount: 3,
    myPrompts: [],
    myStrokeCounts: {},
    myDone: {},
    drawnCount: 0,
    roundNumber: 1,
    roundCount: 6,
    currentDrawingId: "priya:0",
    isArtist: false,
    doodle: REVEAL.doodle,
    myTitle: null,
    titleError: null,
    titledCount: 2,
    options: null,
    myVote: "o1",
    votedCount: 2,
    reveal: REVEAL,
    myPoints: 1000,
    totals: { maya: 1000 },
    ...overrides,
  };
}

function setup(view: DoodlePlayerView, stage: DoodleHostView | null, elapsedMs: number) {
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
  render(
    <LocaleProvider>
      <PhoneReveal view={view} players={PLAYERS} me="maya" deadline={START + 12000} timerStartedAt={START} clock={clock} stage={stage} />
    </LocaleProvider>,
  );
  return { advanceTo };
}

describe("PhoneReveal, TV mode", () => {
  it("waits before the personal result lands", () => {
    vi.useFakeTimers();
    setup(playerView(), null, 0);
    expect(screen.getByText("Eyes on the TV")).toBeTruthy();
    expect(screen.queryByText("You found it!")).toBeNull();
  });

  it("shows the personal card once the follow beat is reached", () => {
    vi.useFakeTimers();
    const { advanceTo } = setup(playerView(), null, 0);
    advanceTo(7500);
    expect(screen.getByText("You found it!")).toBeTruthy();
    expect(screen.getByText("1,000 total")).toBeTruthy();
  });

  it("shows the artist's own result card", () => {
    vi.useFakeTimers();
    const { advanceTo } = setup(playerView({ isArtist: true, myVote: null, myPoints: 500 }), null, 0);
    advanceTo(7500);
    expect(screen.getByText("They found you!")).toBeTruthy();
  });

  it("still renders before the reveal has arrived on this device", () => {
    vi.useFakeTimers();
    setup(playerView({ reveal: null, myVote: null, myPoints: null }), null, 0);
    expect(screen.getByText("Eyes on the TV")).toBeTruthy();
  });
});

describe("PhoneReveal, no-TV mode", () => {
  it("stages the whole storyboard by reusing HostReveal", () => {
    vi.useFakeTimers();
    const stage: DoodleHostView = {
      phase: "reveal",
      playerIds: ["maya", "priya"],
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
      pointsThisRound: { maya: 1000, priya: 0 },
      totals: { maya: 1000, priya: 0 },
      gallery: null,
    };
    const { advanceTo } = setup(playerView(), stage, 0);
    advanceTo(7300);
    expect(screen.getByText("a dog on a scooter")).toBeTruthy();
  });
});

describe("PhoneReveal in Hebrew", () => {
  it("shows the personal card's Hebrew copy", () => {
    window.localStorage.setItem("opg:locale", "he");
    vi.useFakeTimers();
    const { advanceTo } = setup(playerView(), null, 0);
    advanceTo(7500);
    expect(screen.getByText("מצאתם את זה!")).toBeTruthy();
    expect(screen.getByText("סה\"כ 1,000")).toBeTruthy();
  });
});
