// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { LocaleProvider } from "@opg/i18n";
import type { CueId, ServerClock, SoundEngine } from "@opg/ui";
import { SoundProvider } from "@opg/ui";
import { HostResult } from "./HostResult";
import { RESULT_PREVIEW_START, imposterPreviews } from "./preview";

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
 * Mounts the result as if `elapsedMs` had passed since the result started.
 * `advanceTo` moves the fake clock and fake timers together, one beat at a time.
 */
function setup(label: string, elapsedMs: number) {
  const { view, room } = hostSample(label);
  const engine = recordingEngine();
  let fakeNow = RESULT_PREVIEW_START + elapsedMs;
  const clock: ServerClock = { now: () => fakeNow };
  const advanceTo = (targetMs: number) => {
    const target = RESULT_PREVIEW_START + targetMs;
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
      <HostResult
        view={view}
        players={room.players}
        deadline={room.game?.deadline ?? null}
        timerStartedAt={RESULT_PREVIEW_START}
        clock={clock}
      />
    </SoundProvider>,
    { wrapper: LocaleProvider },
  );
  return { engine, advanceTo, rendered };
}

describe("HostResult, caught, staged from the start", () => {
  it("holds the letters and the stamp until their beats, and cues in order", () => {
    vi.useFakeTimers();
    const { engine, advanceTo } = setup("Host: result caught nope", 0);

    expect(screen.queryByLabelText("HORSE")).toBeNull();
    expect(screen.getByLabelText("5 letters")).toBeTruthy();
    expect(screen.queryByText("NOPE")).toBeNull();

    advanceTo(3400);
    expect(screen.queryByText("NOPE")).toBeNull();

    advanceTo(3600);
    expect(screen.getByText("NOPE")).toBeTruthy();
    expect(screen.getByLabelText("HORSE")).toBeTruthy();

    expect(engine.cues[0]).toBe("drumroll");
    expect(engine.cues.some((cue) => cue === "tick")).toBe(true);
    expect(engine.cues.at(-1)).toBe("buzzer");

    advanceTo(4600);
    expect(screen.getByText("The word was")).toBeTruthy();
    expect(screen.getByText("GIRAFFE")).toBeTruthy();

    advanceTo(5600);
    expect(screen.getByText("Points this word")).toBeTruthy();
  });

  it("slams on a correct guess", () => {
    vi.useFakeTimers();
    const { engine, advanceTo } = setup("Host: result caught got it", 3600);
    expect(screen.getByText("GOT IT!")).toBeTruthy();
    expect(engine.cues.at(-1)).toBe("slam");
    advanceTo(3600);
  });
});

describe("HostResult, mounted late", () => {
  it("renders the settled state with no cues", () => {
    vi.useFakeTimers();
    const { engine } = setup("Host: result caught nope", 12000);
    expect(screen.getByText("NOPE")).toBeTruthy();
    expect(screen.getByText("The word was")).toBeTruthy();
    expect(screen.getByText("Points this word")).toBeTruthy();
    expect(engine.cues).toEqual([]);
  });

  it("shows the final totals without counting up", () => {
    vi.useFakeTimers();
    setup("Host: result caught nope", 12000);
    expect(screen.getAllByText("1,500")).toHaveLength(2);
  });
});

describe("HostResult, escaped", () => {
  it("never shows a guess line", () => {
    vi.useFakeTimers();
    setup("Host: result escaped", 6000);
    expect(screen.queryByText(/guessed/)).toBeNull();
    expect(screen.getByText("Priya slipped away")).toBeTruthy();
  });
});

describe("HostResult, cancelled word", () => {
  it("shows only the cancelled headline and static standings", () => {
    vi.useFakeTimers();
    const { view, room } = hostSample("Host: result caught nope");
    const cancelled = { ...view, caught: null, guess: null, guessCorrect: null };
    render(
      <SoundProvider engine={recordingEngine()}>
        <HostResult
          view={cancelled}
          players={room.players}
          deadline={room.game?.deadline ?? null}
          timerStartedAt={RESULT_PREVIEW_START}
          clock={{ now: () => RESULT_PREVIEW_START }}
        />
      </SoundProvider>,
      { wrapper: LocaleProvider },
    );
    expect(screen.getByText("Word cancelled")).toBeTruthy();
    expect(screen.getByText("Standings")).toBeTruthy();
    expect(screen.queryByText(/guessed/)).toBeNull();
  });
});

describe("HostResult, countdown", () => {
  it("advances on whole-second boundaries with no setInterval polling", () => {
    vi.useFakeTimers();
    const setIntervalSpy = vi.spyOn(window, "setInterval");
    const { view, room } = hostSample("Host: result caught nope");
    let fakeNow = RESULT_PREVIEW_START + 12000;
    const deadline = fakeNow + 2500;
    const clock: ServerClock = { now: () => fakeNow };
    render(
      <SoundProvider engine={recordingEngine()}>
        <HostResult
          view={view}
          players={room.players}
          deadline={deadline}
          timerStartedAt={RESULT_PREVIEW_START}
          clock={clock}
        />
      </SoundProvider>,
      { wrapper: LocaleProvider },
    );
    expect(screen.getByText("0:03")).toBeTruthy();

    fakeNow += 500;
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByText("0:02")).toBeTruthy();
    expect(setIntervalSpy).not.toHaveBeenCalled();
  });
});

describe("HostResult, final word", () => {
  it("says final scores next instead of a countdown", () => {
    vi.useFakeTimers();
    const { view, room } = hostSample("Host: result caught nope");
    const finalWord = { ...view, wordNumber: view.wordCount };
    render(
      <SoundProvider engine={recordingEngine()}>
        <HostResult
          view={finalWord}
          players={room.players}
          deadline={room.game?.deadline ?? null}
          timerStartedAt={RESULT_PREVIEW_START}
          clock={{ now: () => RESULT_PREVIEW_START + 12000 }}
        />
      </SoundProvider>,
      { wrapper: LocaleProvider },
    );
    expect(screen.getByText("Final scores next")).toBeTruthy();
  });
});

describe("HostResult in Hebrew", () => {
  it("shows the cancelled headline and standings in Hebrew", () => {
    vi.useFakeTimers();
    window.localStorage.setItem("opg:locale", "he");
    try {
      const { view, room } = hostSample("Host: result caught nope");
      const cancelled = { ...view, caught: null, guess: null, guessCorrect: null };
      render(
        <SoundProvider engine={recordingEngine()}>
          <HostResult
            view={cancelled}
            players={room.players}
            deadline={room.game?.deadline ?? null}
            timerStartedAt={RESULT_PREVIEW_START}
            clock={{ now: () => RESULT_PREVIEW_START }}
          />
        </SoundProvider>,
        { wrapper: LocaleProvider },
      );
      expect(screen.getByText("המילה בוטלה")).toBeTruthy();
      expect(screen.getByText("הדירוג")).toBeTruthy();
    } finally {
      window.localStorage.removeItem("opg:locale");
    }
  });
});
