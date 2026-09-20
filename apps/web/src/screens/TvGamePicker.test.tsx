import type { ReactElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LocaleProvider } from "@opg/i18n";
import { SoundProvider } from "@opg/ui";
import type { CueHandle, CueId, SoundEngine, SoundStatus } from "@opg/ui";
import { makeGame, makeHostView, makePack, makePlayer } from "./fixtures/room";
import { TvGamePicker } from "./TvGamePicker";

/** This screen reads its copy from the dictionary, so every render needs a provider. */
function renderLocalized(ui: ReactElement) {
  return render(ui, { wrapper: LocaleProvider });
}

class FakeEngine implements SoundEngine {
  readonly cues: CueId[] = [];

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

  play(cue: CueId): CueHandle {
    this.cues.push(cue);
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

const IMPOSTER = makeGame({ id: "imposter", name: "Imposter" });
const DRAW = makeGame({ id: "draw", name: "Draw It" });
const CHARADES = makeGame({ id: "charades", name: "Charades" });

function switchState(name: string): string | null {
  return screen.getByRole("switch", { name }).getAttribute("aria-checked");
}

afterEach(cleanup);

describe("TvGamePicker", () => {
  it("marks the picked game and names its packs", () => {
    renderLocalized(
      <TvGamePicker
        view={makeHostView({
          games: [IMPOSTER, DRAW],
          selectedGameId: "imposter",
        })}
      />,
    );
    expect(screen.getAllByText("Picked").length).toBe(1);
    expect(screen.getByText("Imposter packs")).toBeTruthy();
  });

  it("shows no picked stamp while the VIP has not chosen", () => {
    renderLocalized(
      <TvGamePicker
        view={makeHostView({
          games: [IMPOSTER, DRAW],
          selectedGameId: "",
        })}
      />,
    );
    expect(screen.queryByText("Picked")).toBeNull();
    expect(screen.getByText("Packs")).toBeTruthy();
  });

  it("names the VIP who is picking", () => {
    renderLocalized(
      <TvGamePicker
        view={makeHostView({
          players: [makePlayer({ id: "p1", name: "Priya", isVip: true })],
          vipId: "p1",
        })}
      />,
    );
    expect(screen.getByText("Priya")).toBeTruthy();
    expect(
      screen.getByText(/Priya starts the game from their phone/),
    ).toBeTruthy();
  });

  it("falls back when no VIP has joined", () => {
    renderLocalized(<TvGamePicker view={makeHostView({ players: [], vipId: null })} />);
    expect(screen.getByText("Someone")).toBeTruthy();
    expect(
      screen.getByText(/The VIP starts the game from their phone/),
    ).toBeTruthy();
  });

  it("shows an adult pack as on and a teen pack as off", () => {
    renderLocalized(
      <TvGamePicker
        view={makeHostView({
          packs: [
            makePack({
              id: "after-dark",
              name: "After Dark",
              rating: "adult",
              enabled: true,
            }),
            makePack({
              id: "school",
              name: "School",
              rating: "teen",
              enabled: false,
            }),
          ],
        })}
      />,
    );
    expect(screen.getByText("Adult")).toBeTruthy();
    expect(screen.getByText("Teen")).toBeTruthy();
    expect(switchState("After Dark pack")).toBe("true");
    expect(switchState("School pack")).toBe("false");
  });

  it("counts the players who are still playing", () => {
    renderLocalized(
      <TvGamePicker
        view={makeHostView({
          players: [
            makePlayer({ id: "p1" }),
            makePlayer({ id: "p2", waitingForNextGame: true }),
            makePlayer({ id: "p3" }),
          ],
        })}
      />,
    );
    expect(screen.getByText(/· 2 players/)).toBeTruthy();
  });

  it("counts a lone player in the singular", () => {
    renderLocalized(<TvGamePicker view={makeHostView({ players: [makePlayer()] })} />);
    expect(screen.getByText(/· 1 player$/)).toBeTruthy();
  });

  it("says when a game has no packs yet", () => {
    renderLocalized(<TvGamePicker view={makeHostView({ packs: [] })} />);
    expect(screen.getByText("No packs for this game yet.")).toBeTruthy();
  });

  it("plays no cue on mount, even with a game already picked", () => {
    const engine = new FakeEngine();
    renderLocalized(
      <SoundProvider engine={engine}>
        <TvGamePicker
          view={makeHostView({
            games: [IMPOSTER, DRAW],
            selectedGameId: "imposter",
          })}
        />
      </SoundProvider>,
    );
    expect(engine.cues).toEqual([]);
  });

  it("shows all three games and lets the third be picked", () => {
    renderLocalized(
      <TvGamePicker
        view={makeHostView({
          games: [IMPOSTER, DRAW, CHARADES],
          selectedGameId: "charades",
        })}
      />,
    );
    expect(screen.getByText("Imposter")).toBeTruthy();
    expect(screen.getByText("Draw It")).toBeTruthy();
    expect(screen.getByText("Charades")).toBeTruthy();
    expect(screen.getAllByText("Picked").length).toBe(1);
    expect(screen.getByText("Charades packs")).toBeTruthy();
  });

  it("pops and tapes the newly picked card when the pick changes live", () => {
    const engine = new FakeEngine();
    const { rerender } = renderLocalized(
      <SoundProvider engine={engine}>
        <TvGamePicker
          view={makeHostView({
            games: [IMPOSTER, DRAW],
            selectedGameId: "imposter",
          })}
        />
      </SoundProvider>,
    );
    rerender(
      <SoundProvider engine={engine}>
        <TvGamePicker
          view={makeHostView({
            games: [IMPOSTER, DRAW],
            selectedGameId: "draw",
          })}
        />
      </SoundProvider>,
    );
    expect(engine.cues).toEqual(["tape"]);
  });
});

describe("TvGamePicker, in Hebrew", () => {
  afterEach(() => {
    window.localStorage.removeItem("opg:locale");
  });

  it("renders the pick heading and packs panel in Hebrew", () => {
    window.localStorage.setItem("opg:locale", "he");
    renderLocalized(
      <TvGamePicker
        view={makeHostView({
          players: [makePlayer({ id: "p1", name: "Priya", isVip: true })],
          vipId: "p1",
        })}
      />,
    );
    expect(screen.getByText("בוחר/ת משחק")).toBeTruthy();
    expect(screen.getAllByText(/חפיסות/).length).toBeGreaterThan(0);
  });
});
