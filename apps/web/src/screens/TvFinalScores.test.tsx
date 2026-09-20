// @vitest-environment happy-dom
import type { ReactNode } from "react";
import { LocaleProvider } from "@opg/i18n";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import type { CueId, ServerClock, SoundEngine } from "@opg/ui";
import { SoundProvider } from "@opg/ui";
import { makeHostView, makePlayer, makeResult } from "./fixtures/room";
import { TvFinalScores, finaleMusic } from "./TvFinalScores";

/** These screens read their copy from the dictionary, so every render needs a provider. */
function renderLocalized(ui: ReactNode) {
  return render(<LocaleProvider>{ui}</LocaleProvider>);
}

const PRIYA = makePlayer({ id: "p1", name: "Priya", avatar: "drop" });
const SAM = makePlayer({ id: "p2", name: "Sam", avatar: "star", crowns: 1 });
const LEE = makePlayer({ id: "p3", name: "Lee", avatar: "cat" });
const DOV = makePlayer({ id: "p4", name: "Dov", avatar: "toast" });

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

/** Mounts the ceremony as if `elapsedMs` had passed since `finishedAt`. */
function setup(
  overrides: Parameters<typeof makeResult>[0],
  elapsedMs: number,
  players = [PRIYA, SAM, LEE, DOV],
) {
  const finishedAt = 1_700_000_000_000;
  const engine = recordingEngine();
  let fakeNow = finishedAt + elapsedMs;
  const clock: ServerClock = { now: () => fakeNow };
  const advanceTo = (targetMs: number) => {
    const target = finishedAt + targetMs;
    while (fakeNow < target) {
      const step = Math.min(400, target - fakeNow);
      fakeNow += step;
      act(() => {
        vi.advanceTimersByTime(step);
      });
    }
  };
  const rendered = renderLocalized(
    <SoundProvider engine={engine}>
      <TvFinalScores
        view={makeHostView({
          players,
          lobbyScreen: "results",
          lastResult: makeResult({ finishedAt, ...overrides }),
        })}
        clock={clock}
      />
    </SoundProvider>,
  );
  return { engine, advanceTo, rendered };
}

describe("TvFinalScores, settled (finishedAt 0)", () => {
  it("shows the scoreboard with zero cues", () => {
    const engine = recordingEngine();
    renderLocalized(
      <SoundProvider engine={engine}>
        <TvFinalScores
          view={makeHostView({
            players: [PRIYA, SAM, LEE],
            lastResult: makeResult({
              finishedAt: 0,
              scores: { p1: 10, p2: 30, p3: 5 },
              winnerIds: ["p2"],
            }),
          })}
        />
      </SoundProvider>,
    );
    expect(screen.getAllByText("Sam wins the crown!").length).toBeGreaterThan(
      0,
    );
    expect(screen.getByText("30")).toBeTruthy();
    expect(engine.cues).toEqual([]);
  });
});

describe("TvFinalScores, ceremony from the start", () => {
  it("plays the awards, then the crown, in order with no early crown", () => {
    vi.useFakeTimers();
    const { engine, advanceTo } = setup(
      {
        scores: { p1: 10, p2: 30, p3: 20, p4: 5 },
        winnerIds: ["p2"],
        awards: [{ id: "word-thief", playerIds: ["p4"], value: 2 }],
      },
      0,
    );

    expect(screen.queryByText("Word thief")).toBeNull();
    expect(screen.queryByText("Sam wins the crown!")).toBeNull();

    advanceTo(2100);
    expect(screen.getByText("Word thief")).toBeTruthy();

    advanceTo(5100);
    expect(screen.getByText("And the crown goes to…")).toBeTruthy();
    expect(screen.queryByText("Sam wins the crown!")).toBeNull();

    advanceTo(13100);
    expect(screen.getAllByText("Sam wins the crown!").length).toBeGreaterThan(
      0,
    );

    expect(engine.cues).toEqual([
      "whoosh",
      "tape",
      "drumroll",
      "pop",
      "pop",
      "fanfare",
    ]);
  });

  it("plays no tape cue for an award its game cannot describe", () => {
    vi.useFakeTimers();
    const { engine, advanceTo } = setup(
      {
        awards: [
          { id: "word-thief", playerIds: ["p1"], value: 2 },
          { id: "not-a-real-award", playerIds: ["p1"], value: 1 },
        ],
      },
      0,
    );

    advanceTo(12_000);

    expect(engine.cues.filter((cue) => cue === "tape")).toHaveLength(1);
  });

  it("plays no rank cues when everyone ties for the lead", () => {
    vi.useFakeTimers();
    const { engine, advanceTo } = setup(
      { scores: { p1: 10, p2: 10, p3: 10 }, winnerIds: ["p1", "p2", "p3"] },
      0,
      [PRIYA, SAM, LEE],
    );

    advanceTo(20_000);

    expect(engine.cues.filter((cue) => cue === "pop")).toHaveLength(0);
    expect(engine.cues).toContain("fanfare");
  });
});

describe("TvFinalScores, mounted late", () => {
  it("shows the settled scoreboard with no cues", () => {
    vi.useFakeTimers();
    const { engine } = setup(
      {
        scores: { p1: 10, p2: 30, p3: 20, p4: 5 },
        winnerIds: ["p2"],
      },
      30_000,
    );
    expect(screen.getAllByText("Sam wins the crown!").length).toBeGreaterThan(
      0,
    );
    expect(engine.cues).toEqual([]);
  });

  it("states the crown winner for screen readers", () => {
    vi.useFakeTimers();
    setup({ scores: { p1: 10, p2: 30 }, winnerIds: ["p2"] }, 30_000, [
      PRIYA,
      SAM,
    ]);
    expect(screen.getByRole("status").textContent).toBe(
      "The crown is decided. Sam wins the crown!",
    );
  });

  it("renders the ranked list without any ceremony elements", () => {
    vi.useFakeTimers();
    setup(
      {
        scores: { p1: 10, p2: 30, p3: 20, p4: 5 },
        winnerIds: ["p2"],
        awards: [{ id: "word-thief", playerIds: ["p4"], value: 2 }],
      },
      30_000,
    );
    expect(screen.getAllByText("Final scores").length).toBeGreaterThan(0);
    expect(screen.getByText("30")).toBeTruthy();
    expect(screen.queryByText("That's a wrap!")).toBeNull();
    expect(screen.queryByText("And the crown goes to…")).toBeNull();
    expect(screen.queryByText("3rd place")).toBeNull();
    expect(screen.queryByText("2nd place")).toBeNull();
  });
});

describe("TvFinalScores, not completed", () => {
  it("shows Game over with no crown copy", () => {
    renderLocalized(
      <TvFinalScores
        view={makeHostView({
          players: [PRIYA, SAM],
          lastResult: makeResult({
            completed: false,
            finishedAt: 1_700_000_000_000,
            scores: { p1: 10, p2: 4 },
            winnerIds: [],
          }),
        })}
      />,
    );
    expect(screen.getAllByText("Game over").length).toBeGreaterThan(0);
    expect(screen.queryByText(/wins the crown/)).toBeNull();
    expect(screen.queryByText(/share the crown/)).toBeNull();
  });

  it("plays no ceremony cues for a game that ended early", () => {
    vi.useFakeTimers();
    const { engine, advanceTo } = setup(
      {
        completed: false,
        scores: { p1: 10, p2: 4 },
        winnerIds: [],
        awards: [],
      },
      0,
    );

    advanceTo(20_000);

    expect(engine.cues).toEqual([]);
    expect(screen.getAllByText("Game over").length).toBeGreaterThan(0);
  });
});

describe("TvFinalScores, footer", () => {
  it("names the VIP", () => {
    renderLocalized(
      <TvFinalScores
        view={makeHostView({
          players: [PRIYA, SAM],
          vipId: "p2",
          lastResult: makeResult({
            finishedAt: 0,
            scores: { p1: 10, p2: 4 },
            winnerIds: ["p1"],
          }),
        })}
      />,
    );
    expect(screen.getAllByText("Sam").length).toBeGreaterThan(0);
    expect(
      screen.getByText("picks the next game from their phone"),
    ).toBeTruthy();
  });
});

describe("TvFinalScores, ties", () => {
  it("names every winner when the game ends in a tie", () => {
    renderLocalized(
      <TvFinalScores
        view={makeHostView({
          players: [PRIYA, SAM, LEE],
          lastResult: makeResult({
            finishedAt: 0,
            scores: { p1: 20, p2: 20, p3: 5 },
            winnerIds: ["p1", "p2"],
          }),
        })}
      />,
    );
    expect(
      screen.getAllByText("Priya and Sam share the crown!").length,
    ).toBeGreaterThan(0);
  });
});

describe("TvFinalScores, waiting", () => {
  it("waits when there is no result yet", () => {
    renderLocalized(<TvFinalScores view={makeHostView({ lastResult: null })} />);
    expect(screen.getByText("Waiting for final scores")).toBeTruthy();
  });
});

describe("finaleMusic", () => {
  it("stays quiet during the ceremony and brings the lobby loop back after", () => {
    const result = makeResult();
    expect(finaleMusic({ ...result, completed: true }, false)).toBeNull();
    expect(finaleMusic({ ...result, completed: true }, true)).toBe("lobby");
    expect(finaleMusic({ ...result, completed: false }, false)).toBe("lobby");
    expect(finaleMusic(null, false)).toBe("lobby");
  });
});
