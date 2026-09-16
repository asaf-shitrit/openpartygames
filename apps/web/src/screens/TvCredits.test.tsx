import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SoundProvider } from "@opg/ui";
import type { CueHandle, SoundEngine, SoundStatus } from "@opg/ui";
import { AUDIO_CREDITS, MUSIC_CREDITS } from "@opg/ui";
import { TvCredits, musicCreditLines, soundCreditLines } from "./TvCredits";

class FakeEngine implements SoundEngine {
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
    /* no samples */
  }

  play(): CueHandle {
    return {
      stop() {
        /* nothing is playing */
      },
    };
  }

  playMusic(): void {
    /* nothing to play */
  }

  stopAll(): void {
    /* nothing is playing */
  }
}

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("soundCreditLines", () => {
  it("groups one line per author with their licenses", () => {
    const lines = soundCreditLines(AUDIO_CREDITS);
    expect(lines.map((line) => line.author)).toEqual([
      ...new Set(AUDIO_CREDITS.map((credit) => credit.author)),
    ]);
    for (const line of lines) {
      expect(line.licenses.length).toBeGreaterThan(0);
    }
    expect(lines.map((line) => line.author)).toContain("Kenney (kenney.nl)");
    expect(lines.map((line) => line.author)).toContain(
      "Joseph SARDIN (BigSoundBank)",
    );
  });
});

describe("musicCreditLines", () => {
  it("names every music file's title and author once", () => {
    const lines = musicCreditLines(MUSIC_CREDITS);
    expect(lines).toHaveLength(MUSIC_CREDITS.length);
    for (const credit of MUSIC_CREDITS) {
      expect(lines.some((line) => line.includes(credit.title))).toBe(true);
      expect(lines.some((line) => line.includes(credit.author))).toBe(true);
    }
  });
});

describe("TvCredits", () => {
  it("lists every audio author", () => {
    render(
      <SoundProvider engine={new FakeEngine()}>
        <TvCredits />
      </SoundProvider>,
    );
    for (const credit of AUDIO_CREDITS) {
      expect(screen.getAllByText(credit.author).length).toBeGreaterThan(0);
    }
    expect(screen.getByText("CC0")).toBeTruthy();
  });

  it("lists every music author on the Music card", () => {
    render(
      <SoundProvider engine={new FakeEngine()}>
        <TvCredits />
      </SoundProvider>,
    );
    for (const credit of MUSIC_CREDITS) {
      expect(
        screen.getByText(new RegExp(credit.author.replace(/[()]/gu, "\\$&"))),
      ).toBeTruthy();
    }
  });

  it("credits a cue's author under sound effects", () => {
    render(
      <SoundProvider engine={new FakeEngine()}>
        <TvCredits />
      </SoundProvider>,
    );
    expect(screen.getByText("Sound effects")).toBeTruthy();
    const author = AUDIO_CREDITS[0]?.author ?? "";
    expect(author).not.toBe("");
    expect(
      screen.getByText(new RegExp(author.replace(/[()]/gu, "\\$&"))),
    ).toBeTruthy();
  });
});
