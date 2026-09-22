// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { LocaleProvider } from "@opg/i18n";
import type { CueId, CueOptions, ServerClock, SoundEngine } from "@opg/ui";
import { SoundProvider } from "@opg/ui";
import type { ImposterHostView } from "../state";
import { HostLastChance } from "./HostLastChance";
import { imposterPreviews } from "./preview";

afterEach(cleanup);

interface RecordingEngine extends SoundEngine {
  calls: Array<{ cue: CueId; options?: CueOptions }>;
}

function recordingEngine(): RecordingEngine {
  const calls: Array<{ cue: CueId; options?: CueOptions }> = [];
  return {
    calls,
    status: () => "running",
    subscribe: () => () => undefined,
    unlock() {},
    setMuted() {},
    preload() {},
    play(cue, options) {
      calls.push({ cue, options });
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

const CLOCK: ServerClock = { now: () => 0 };

function renderLastChance(view: ImposterHostView, engine: SoundEngine) {
  const { room } = hostSample("Host: last chance");
  return render(
    <SoundProvider engine={engine}>
      <HostLastChance
        view={view}
        players={room.players}
        deadline={room.game?.deadline ?? null}
        timerStartedAt={room.game?.timerStartedAt ?? null}
        clock={CLOCK}
      />
    </SoundProvider>,
    { wrapper: LocaleProvider },
  );
}

describe("HostLastChance", () => {
  it("shows a blank tile per typed character, never the letters", () => {
    const { view } = hostSample("Host: last chance");
    renderLastChance({ ...view, guessLength: 5 }, recordingEngine());
    const tiles = screen.getByLabelText("5 letters");
    expect(tiles.children).toHaveLength(5);
    for (const tile of Array.from(tiles.children)) {
      expect(tile.textContent).toBe("");
    }
  });

  it("says thinking at zero and typing once a letter is in", () => {
    const { view } = hostSample("Host: last chance");
    renderLastChance({ ...view, guessLength: 0 }, recordingEngine());
    expect(screen.getByText("Priya is thinking…")).toBeTruthy();
    cleanup();
    renderLastChance({ ...view, guessLength: 3 }, recordingEngine());
    expect(screen.getByText("Priya is typing…")).toBeTruthy();
  });

  it("never plays a sound on mount", () => {
    const { view } = hostSample("Host: last chance");
    const engine = recordingEngine();
    renderLastChance({ ...view, guessLength: 4 }, engine);
    expect(engine.calls).toEqual([]);
  });

  it("plays scratch when the guess grows and a soft pop when it shrinks", () => {
    const { view } = hostSample("Host: last chance");
    const engine = recordingEngine();
    const { rerender } = renderLastChance(
      { ...view, guessLength: 2 },
      engine,
    );
    rerender(
      <SoundProvider engine={engine}>
        <HostLastChance
          view={{ ...view, guessLength: 4 }}
          players={hostSample("Host: last chance").room.players}
          deadline={null}
          timerStartedAt={null}
          clock={CLOCK}
        />
      </SoundProvider>,
    );
    expect(engine.calls).toEqual([{ cue: "scratch", options: undefined }]);

    rerender(
      <SoundProvider engine={engine}>
        <HostLastChance
          view={{ ...view, guessLength: 1 }}
          players={hostSample("Host: last chance").room.players}
          deadline={null}
          timerStartedAt={null}
          clock={CLOCK}
        />
      </SoundProvider>,
    );
    expect(engine.calls).toEqual([
      { cue: "scratch", options: undefined },
      { cue: "pop", options: { gain: 0.5 } },
    ]);
  });
});

describe("HostLastChance in Hebrew", () => {
  it("names the imposter and says thinking in Hebrew", () => {
    window.localStorage.setItem("opg:locale", "he");
    try {
      const { view } = hostSample("Host: last chance");
      renderLastChance({ ...view, guessLength: 0 }, recordingEngine());
      expect(screen.getByText("Priya חושב/ת…")).toBeTruthy();
    } finally {
      window.localStorage.removeItem("opg:locale");
    }
  });
});
