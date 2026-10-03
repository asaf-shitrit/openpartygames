// plan/0004-no-tv-mode.md §7: a game that sets `noTv` must never ship a Phone that ignores
// `stage`. For every registered game whose rules opt in, every phase needs a "Phone (no-TV)"
// preview fixture, and that fixture's phone must render more with its stage than without it.
import { LocaleProvider } from "@opg/i18n";
import { doodleBluff } from "@opg/game-doodle-bluff";
import { doodlePhaseSchema } from "@opg/game-doodle-bluff/views";
import { imposter } from "@opg/game-imposter";
import { imposterPhaseSchema } from "@opg/game-imposter/views";
import { mostLikelyTo } from "@opg/game-most-likely-to";
import { mltPhaseSchema } from "@opg/game-most-likely-to/views";
import { realOrNah } from "@opg/game-real-or-nah";
import { ronPhaseSchema } from "@opg/game-real-or-nah/views";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { SCREENS, timingOf, type PhoneCase } from "./dev/screens";
import { gameUiFor, preloadGameUi } from "./games";
import { LOADING_ATTRIBUTE } from "./loading";

afterEach(cleanup);

// A game's screens are a lazy chunk, and the first import of one can take longer than a
// `waitFor` allows on a busy machine. Loading them up front keeps the waits below about
// rendering, not about how loaded the CPU is.
const PRELOAD_TIMEOUT_MS = 60_000;
// Even preloaded, the swap from placeholder to screen takes a few frames, which a starved CPU
// stretches past `waitFor`'s 1s. The wait still ends the moment the screen is in. A test that
// waits on it needs room to, so the file's test timeout is raised to match.
const LAZY_LOAD_TIMEOUT_MS = 20_000;
vi.setConfig({ testTimeout: 2 * LAZY_LOAD_TIMEOUT_MS });
beforeAll(async () => {
  await Promise.all(GAMES.map(({ definition }) => preloadGameUi(definition.id)));
}, PRELOAD_TIMEOUT_MS);

const NO_TV_LABEL = "Phone (no-TV)";

/** Every registered game, with every phase its rules (and so its stage) can be in. */
const GAMES = [
  { definition: imposter, phases: imposterPhaseSchema.options },
  { definition: realOrNah, phases: ronPhaseSchema.options },
  { definition: mostLikelyTo, phases: mltPhaseSchema.options },
  { definition: doodleBluff, phases: doodlePhaseSchema.options },
];

const stagePhaseSchema = z.object({ phase: z.string() });

/** The phase a fixture's stage is in, or null when it carries no stage at all. */
function stagePhaseOf(screen: PhoneCase): string | null {
  const parsed = stagePhaseSchema.safeParse(timingOf(screen.room).stage);
  return parsed.success ? parsed.data.phase : null;
}

/** The no-TV phone fixtures a game's preview ships, each with the phase its stage is in. */
function noTvFixturesOf(gameId: string): Array<{ screen: PhoneCase; phase: string | null }> {
  const fixtures: Array<{ screen: PhoneCase; phase: string | null }> = [];
  for (const screen of SCREENS) {
    if (screen.kind !== "game" || screen.surface !== "phone") continue;
    if (screen.gameId !== gameId || !screen.label.startsWith(NO_TV_LABEL)) continue;
    fixtures.push({ screen, phase: stagePhaseOf(screen) });
  }
  return fixtures;
}

/** Renders a fixture's phone, with its stage or without, and returns its settled text. */
async function phoneText(screen: PhoneCase, withStage: boolean): Promise<string> {
  const Ui = gameUiFor(screen.gameId);
  if (Ui === null) throw new Error(`${screen.gameId} is not registered`);
  const timing = timingOf(screen.room);
  const { container, unmount } = render(
    <LocaleProvider>
      <Ui.Phone
        view={screen.view}
        room={screen.room}
        deadline={timing.deadline}
        timerStartedAt={timing.timerStartedAt}
        clock={{ now: () => timing.anchor }}
        send={() => {}}
        stage={withStage ? timing.stage : null}
      />
    </LocaleProvider>,
  );
  await waitFor(() => expect(container.querySelector(`[${LOADING_ATTRIBUTE}]`)).toBeNull(), {
    timeout: LAZY_LOAD_TIMEOUT_MS,
  });
  const text = container.textContent ?? "";
  unmount();
  return text;
}

const noTvCases = GAMES.filter(({ definition }) => definition.noTv === true).flatMap(
  ({ definition, phases }) => phases.map((phase) => ({ gameId: definition.id, phase })),
);

describe("no-TV stage coverage", () => {
  it("finds at least one game that plays without a TV", () => {
    expect(noTvCases.length).toBeGreaterThan(0);
  });

  it("finds a no-TV fixture carrying a stage for every phase", () => {
    const missing = noTvCases.filter(
      ({ gameId, phase }) =>
        !noTvFixturesOf(gameId).some((fixture) => fixture.phase === phase),
    );
    expect(missing).toEqual([]);
  });

  it("gives every no-TV fixture a stage", () => {
    const stageless = GAMES.filter(({ definition }) => definition.noTv === true)
      .flatMap(({ definition }) => noTvFixturesOf(definition.id))
      .filter((fixture) => fixture.phase === null)
      .map((fixture) => fixture.screen.label);
    expect(stageless).toEqual([]);
  });

  it.each(noTvCases)("renders $gameId's stage during $phase", async ({ gameId, phase }) => {
    const fixture = noTvFixturesOf(gameId).find((entry) => entry.phase === phase);
    if (fixture === undefined) throw new Error(`no ${NO_TV_LABEL} fixture for ${gameId} ${phase}`);
    const withoutStage = await phoneText(fixture.screen, false);
    const withStage = await phoneText(fixture.screen, true);
    expect(withStage.trim()).not.toBe("");
    expect(withStage).not.toBe(withoutStage);
  });
});
