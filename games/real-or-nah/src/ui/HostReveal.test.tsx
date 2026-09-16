// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import type { CueId, ServerClock, SoundEngine } from "@opg/ui";
import { SoundProvider } from "@opg/ui";
import type { RonHostView } from "../types";
import { HostReveal } from "./HostReveal";
import { RON_REVEAL_PREVIEW_START, realOrNahPreviews } from "./preview";

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
  const preview = realOrNahPreviews.find((candidate) => candidate.label === label);
  if (preview === undefined) throw new Error(`no preview labelled ${label}`);
  if (preview.room.role !== "host") throw new Error(`${label} is not a host`);
  if (!("submittedIds" in preview.view)) {
    throw new Error(`${label} is not a host view`);
  }
  return { view: preview.view, room: preview.room };
}

/** Mounts the reveal as if `elapsedMs` had passed since the reveal started. */
function setup(label: string, elapsedMs: number) {
  const { view, room } = hostSample(label);
  const engine = recordingEngine();
  let fakeNow = RON_REVEAL_PREVIEW_START + elapsedMs;
  const clock: ServerClock = { now: () => fakeNow };
  const advanceTo = (targetMs: number) => {
    const target = RON_REVEAL_PREVIEW_START + targetMs;
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
  it("stages duds, lies, the truth and standings across the beats", () => {
    vi.useFakeTimers();
    const { advanceTo } = setup("Host: reveal, 3 foolers", 0);

    expect(screen.getByText("Let's see who fooled who")).toBeTruthy();
    expect(screen.queryByText("These fooled nobody")).toBeNull();

    advanceTo(2050);
    expect(screen.getByText("These fooled nobody")).toBeTruthy();

    advanceTo(4050);
    expect(screen.getByText("rabbits")).toBeTruthy();
    expect(screen.queryByText("Noa")).toBeNull();

    advanceTo(5800);
    expect(screen.getByText("Noa")).toBeTruthy();

    advanceTo(14550);
    expect(screen.getByText("The truth")).toBeTruthy();
    expect(screen.getByText("?")).toBeTruthy();

    advanceTo(15750);
    expect(screen.getByText("emus")).toBeTruthy();
    expect(screen.getByText("REAL")).toBeTruthy();

    advanceTo(16350);
    expect(screen.getByText("+1,000 each")).toBeTruthy();

    advanceTo(18550);
    expect(screen.getByText("Standings")).toBeTruthy();
  });
});

describe("HostReveal, mounted late", () => {
  it("renders the settled end state with no cues", () => {
    vi.useFakeTimers();
    const { engine } = setup("Host: reveal, 3 foolers", 21999);

    expect(screen.getByText("These fooled nobody")).toBeTruthy();
    expect(screen.getByText("emus")).toBeTruthy();
    expect(screen.getByText("REAL")).toBeTruthy();
    expect(screen.getByText("Standings")).toBeTruthy();
    expect(engine.cues).toEqual([]);
  });

  it("states the truth for screen readers once it is stamped", () => {
    vi.useFakeTimers();
    setup("Host: reveal, 3 foolers", 21999);
    expect(screen.getByRole("status").textContent).toBe(
      "The real answer is emus.",
    );
  });
});

describe("HostReveal, a lie's author was kicked mid-reveal", () => {
  it("renders the beat as a removed card instead of crashing", () => {
    vi.useFakeTimers();
    setup("Host: reveal after a kick", 29999);
    expect(screen.getByText("(removed)")).toBeTruthy();
    expect(screen.getByText("Standings")).toBeTruthy();
  });
});

describe("HostReveal, other lie counts", () => {
  it("skips the duds row when nobody wrote a dud lie", () => {
    vi.useFakeTimers();
    setup("Host: reveal, 2 foolers plus a dud", 21999);
    expect(screen.getByText("These fooled nobody")).toBeTruthy();
  });

  it("never shows the duds row for an all-duds reveal", () => {
    vi.useFakeTimers();
    setup("Host: reveal, 0 foolers (duds only)", 21999);
    expect(screen.getByText("These fooled nobody")).toBeTruthy();
    expect(screen.queryByText("Fooled everyone!")).toBeNull();
  });

  it("says nobody found it when foundByIds is empty", () => {
    vi.useFakeTimers();
    const { view, room } = hostSample("Host: reveal, 3 foolers");
    const emptyFound: RonHostView = {
      ...view,
      reveal: view.reveal ? { ...view.reveal, foundByIds: [] } : null,
    };
    const clock: ServerClock = { now: () => RON_REVEAL_PREVIEW_START + 21999 };
    render(
      <HostReveal
        view={emptyFound}
        players={room.players}
        deadline={null}
        timerStartedAt={RON_REVEAL_PREVIEW_START}
        clock={clock}
      />,
    );
    expect(screen.getByText("Nobody found it! Tricky one.")).toBeTruthy();
  });
});
