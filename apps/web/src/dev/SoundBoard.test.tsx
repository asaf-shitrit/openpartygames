import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { CUE_IDS, SoundProvider } from "@opg/ui";
import type { CueHandle, CueId, SoundEngine, SoundStatus } from "@opg/ui";
import { SoundBoard } from "./SoundBoard";

class FakeEngine implements SoundEngine {
  unlockCount = 0;
  preloadCount = 0;
  readonly plays: CueId[] = [];
  readonly muteHistory: boolean[] = [];

  status(): SoundStatus {
    return "running";
  }

  subscribe(): () => void {
    return () => {
      /* status never changes */
    };
  }

  unlock(): void {
    this.unlockCount += 1;
  }

  setMuted(muted: boolean): void {
    this.muteHistory.push(muted);
  }

  preload(): void {
    this.preloadCount += 1;
  }

  play(cue: CueId): CueHandle {
    this.plays.push(cue);
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

afterEach(() => {
  cleanup();
  localStorage.clear();
});

function buttons(name: string): HTMLElement[] {
  return screen.getAllByRole("button", { name });
}

function nthButton(name: string, index: number): HTMLElement {
  const button = buttons(name)[index];
  if (!button) throw new Error(`no ${name} button at index ${index}`);
  return button;
}

describe("SoundBoard", () => {
  it("renders one card per cue", () => {
    render(
      <SoundProvider engine={new FakeEngine()}>
        <SoundBoard />
      </SoundProvider>,
    );
    expect(buttons("Sample").length).toBe(CUE_IDS.length);
    expect(buttons("Synth").length).toBe(CUE_IDS.length);
    expect(
      screen.getByText(/Whoosh #3 — Joseph SARDIN \(BigSoundBank\), CC0-1\.0/),
    ).toBeTruthy();
  });

  it("plays the sampled cue on the provider engine", async () => {
    const engine = new FakeEngine();
    const user = userEvent.setup();
    render(
      <SoundProvider engine={engine}>
        <SoundBoard />
      </SoundProvider>,
    );
    await user.click(nthButton("Sample", 0));
    expect(engine.plays).toEqual([CUE_IDS[0]]);
  });

  it("plays synth cues on a lazily created, unlocked second engine", async () => {
    const engine = new FakeEngine();
    const synth = new FakeEngine();
    const user = userEvent.setup();
    render(
      <SoundProvider engine={engine}>
        <SoundBoard createSynthEngine={() => synth} />
      </SoundProvider>,
    );
    await user.click(nthButton("Synth", 0));
    await user.click(nthButton("Synth", 1));
    expect(synth.unlockCount).toBe(2);
    expect(synth.plays).toEqual([CUE_IDS[0], CUE_IDS[1]]);
    expect(engine.plays.length).toBe(0);
  });

  it("unlocks and shows the mute state", async () => {
    const engine = new FakeEngine();
    const user = userEvent.setup();
    render(
      <SoundProvider engine={engine}>
        <SoundBoard />
      </SoundProvider>,
    );
    expect(screen.getByText("Engine: running")).toBeTruthy();
    await user.click(nthButton("Unlock sound", 0));
    expect(engine.unlockCount).toBe(1);
  });
});
