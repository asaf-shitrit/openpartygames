import type { ReactNode } from "react";
import { LocaleProvider, en } from "@opg/i18n";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { imposterPreviews } from "@opg/game-imposter/preview";
import { preloadGameUi } from "../games";
import { LOADING_ATTRIBUTE } from "../loading";
import {
  MOMENT_SOURCES,
  MomentPlayer,
  devMoments,
  devMomentsFor,
  elapsedAt,
  momentGameIds,
  secondsLabel,
} from "./MomentPlayer";
import type { DevMoment } from "./MomentPlayer";

/** These dev screens render real game UI, which reads its copy from the dictionary. */
function renderLocalized(ui: ReactNode) {
  return render(<LocaleProvider>{ui}</LocaleProvider>);
}

afterEach(cleanup);

const DEV_MOMENTS = devMoments();

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
  await Promise.all(momentGameIds(DEV_MOMENTS).map((id) => preloadGameUi(id)));
}, PRELOAD_TIMEOUT_MS);

function momentOf(gameId: string, chip: string): DevMoment {
  const found = DEV_MOMENTS.find(
    (moment) => moment.gameId === gameId && moment.chip === chip,
  );
  if (found === undefined) throw new Error(`no ${gameId} moment with chip ${chip}`);
  return found;
}

const CAUGHT_REVEAL = momentOf("imposter", "caught");
const WRONG_REVEAL = momentOf("imposter", "wrong");

function renderMoments(moments: readonly DevMoment[]) {
  renderLocalized(<MomentPlayer moments={moments} />);
}

/** Waits until every lazily loaded game screen has swapped in for its placeholder. */
async function screensLoaded(): Promise<void> {
  await waitFor(
    () => {
      expect(document.querySelector(`[${LOADING_ATTRIBUTE}]`)).toBeNull();
    },
    { timeout: LAZY_LOAD_TIMEOUT_MS },
  );
}

/** A picker chip, selected ("✓ …") or not. */
function pickerChip(label: string): HTMLElement {
  return screen.getByRole("button", {
    name: (name) => name === label || name === `✓ ${label}`,
  });
}

/** Scrubs the shared slider, in ms. */
function scrubTo(ms: number): void {
  fireEvent.change(screen.getByLabelText("Scrub the reveal"), {
    target: { value: String(ms) },
  });
}

/** A surface's text with whitespace collapsed. */
function textOf(element: Element | null | undefined): string {
  return (element?.textContent ?? "").replace(/\s+/gu, " ");
}

function tvText(): string {
  return textOf(document.querySelector(".opg-grid-tv"));
}

describe("elapsedAt", () => {
  it("holds the base value while paused", () => {
    expect(elapsedAt(null, 3000, 9999, 12_000)).toBe(3000);
  });

  it("advances from the play start and clamps to the duration", () => {
    expect(elapsedAt(1000, 0, 1500, 12_000)).toBe(500);
    expect(elapsedAt(1000, 500, 1500, 12_000)).toBe(1000);
    expect(elapsedAt(1000, 11_800, 1500, 12_000)).toBe(12_000);
    expect(elapsedAt(1000, 0, 400, 12_000)).toBe(0);
  });
});

describe("secondsLabel", () => {
  it("shows one decimal", () => {
    expect(secondsLabel(0)).toBe("0.0s");
    expect(secondsLabel(5500)).toBe("5.5s");
  });
});

describe("moment registry", () => {
  it("offers moments from every game", () => {
    expect(momentGameIds(DEV_MOMENTS)).toEqual([
      "imposter",
      "real-or-nah",
      "most-likely-to",
      "doodle-bluff",
    ]);
  });

  it.each(MOMENT_SOURCES.map((source) => [source.gameId, source]))(
    "resolves every preview the %s moments name",
    (_gameId, source) => {
      const moments = devMomentsFor(source);
      expect(moments).toHaveLength(source.moments.length);
      for (const [index, moment] of moments.entries()) {
        const declared = source.moments[index];
        expect(moment.host.label).toBe(declared?.host);
        expect(moment.phones.map((phone) => phone.label)).toEqual(declared?.phones);
        expect(moment.noTvPhones.map((phone) => phone.label)).toEqual(
          declared?.noTvPhones,
        );
        expect(moment.durationMs).toBeGreaterThan(0);
      }
    },
  );

  it("gives every moment a unique id", () => {
    const ids = DEV_MOMENTS.map((moment) => moment.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("drops a moment whose host is missing or is a phone, and phones it cannot find", () => {
    const moments = devMomentsFor({
      gameId: "imposter",
      previews: imposterPreviews,
      moments: [
        { host: "Host: nope", chip: "x", durationMs: 1, phones: [], noTvPhones: [] },
        { host: "Phone: Dov reveal", chip: "y", durationMs: 1, phones: [], noTvPhones: [] },
        {
          host: "Host: reveal",
          chip: "z",
          durationMs: 1,
          phones: ["Phone: Dov reveal", "Host: vote", "Phone: nobody"],
          noTvPhones: ["Phone: nobody"],
        },
      ],
    });
    expect(moments.map((moment) => moment.chip)).toEqual(["z"]);
    expect(moments[0]?.phones.map((phone) => phone.label)).toEqual(["Phone: Dov reveal"]);
    expect(moments[0]?.noTvPhones).toEqual([]);
  });
});

describe("Imposter moments", () => {
  const imposter = DEV_MOMENTS.filter((moment) => moment.gameId === "imposter");

  it("keeps the reveal, last-chance and result chips in their order", () => {
    expect(imposter.map((moment) => moment.chip)).toEqual([
      "caught",
      "wrong",
      "tie",
      "no votes",
      "typing",
      "got it",
      "nope",
      "escaped",
    ]);
  });

  it("gives every moment its own phase duration", () => {
    expect(CAUGHT_REVEAL.durationMs).toBe(12_000);
    expect(momentOf("imposter", "typing").durationMs).toBe(15_000);
    expect(momentOf("imposter", "got it").durationMs).toBeGreaterThan(
      momentOf("imposter", "escaped").durationMs,
    );
  });

  it("puts the reveal phones and the settled no-TV phone beside a reveal", () => {
    expect(CAUGHT_REVEAL.phones.map((phone) => phone.label)).toEqual([
      "Phone: Dov reveal",
      "Phone: Leo reveal",
      "Phone: Priya reveal caught",
      "Phone: Priya reveal free",
    ]);
    expect(CAUGHT_REVEAL.noTvPhones.map((phone) => phone.label)).toEqual([
      "Phone (no-TV): Dov reveal settled",
    ]);
  });
});

describe("other games' moments", () => {
  it("runs each Real or Nah reveal for as long as its own lies need", () => {
    const durations = DEV_MOMENTS.filter((moment) => moment.gameId === "real-or-nah").map(
      (moment) => moment.durationMs,
    );
    expect(new Set(durations).size).toBeGreaterThan(1);
  });

  it("replays the Doodle Bluff gallery on its own, longer clock", () => {
    const gallery = momentOf("doodle-bluff", "gallery");
    expect(gallery.durationMs).toBeGreaterThan(momentOf("doodle-bluff", "found").durationMs);
    expect(gallery.noTvPhones.map((phone) => phone.label)).toEqual(["Phone (no-TV): gallery"]);
  });
});

describe("MomentPlayer", () => {
  it("renders a chip per moment of the selected game and marks the selected one", async () => {
    renderMoments(DEV_MOMENTS);
    await screensLoaded();
    expect(screen.getByRole("button", { name: "✓ imposter" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "✓ caught" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "wrong" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "found" })).toBeNull();
  });

  it("has no stray chip showing the raw fixture label", async () => {
    renderMoments([CAUGHT_REVEAL]);
    await screensLoaded();
    expect(screen.queryByText(CAUGHT_REVEAL.host.label)).toBeNull();
  });

  it("switches the TV content when another moment is picked", async () => {
    const user = userEvent.setup();
    renderMoments([CAUGHT_REVEAL, WRONG_REVEAL]);
    await screensLoaded();

    // Between the verdict (8s) and the unmask (9s): the caught reveal has stamped.
    scrubTo(8500);
    expect(tvText()).toContain("Imposter!");
    expect(tvText()).not.toContain("Not the imposter");

    await user.click(screen.getByRole("button", { name: WRONG_REVEAL.chip }));
    expect(
      screen.getByRole("button", { name: `✓ ${WRONG_REVEAL.chip}` }),
    ).toBeTruthy();
    scrubTo(0);
    scrubTo(8500);

    // The wrong-vote reveal replaced it, verdict and all.
    expect(tvText()).toContain("Not the imposter");
    expect(tvText()).not.toContain("Imposter!");
  });

  it("restarts the clock after a scrub", async () => {
    renderMoments([CAUGHT_REVEAL]);
    await screensLoaded();
    scrubTo(5000);
    expect(screen.getByText("5.0s")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Restart" }));
    expect(screen.getByText("0.0s")).toBeTruthy();
  });

  it("starts over from 0 when Play is pressed at the end", async () => {
    renderMoments([CAUGHT_REVEAL]);
    await screensLoaded();
    const slider = screen.getByLabelText("Scrub the reveal");
    fireEvent.change(slider, { target: { value: slider.getAttribute("max") } });
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(screen.getByText("0.0s")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Pause" })).toBeTruthy();
  });

  it("names a game with no registered UI instead of rendering it", () => {
    renderMoments([{ ...CAUGHT_REVEAL, id: "nope/x", gameId: "nope" }]);
    // The TV, four shared-screen phones and the no-TV phone.
    expect(screen.getAllByText("No UI registered for nope")).toHaveLength(6);
  });

  it("shows an empty state when there are no moments", () => {
    renderMoments([]);
    expect(screen.getByText("No moments found.")).toBeTruthy();
  });

  it("shows a no-TV column beside the TV and shared-screen phones", async () => {
    renderMoments([CAUGHT_REVEAL]);
    await screensLoaded();
    expect(screen.getByText("Phones (no TV)")).toBeTruthy();
    expect(screen.getByText("Phones (shared screen)")).toBeTruthy();
  });

  it("the no-TV phone stages the same verdict as the TV, with no TV mounted for it", async () => {
    renderMoments([CAUGHT_REVEAL]);
    await screensLoaded();
    scrubTo(8500);
    expect(textOf(document.querySelector('[data-surface="no-tv"]'))).toContain("Imposter!");
  });

  it.each(DEV_MOMENTS.map((moment) => [moment.id, moment]))(
    "plays %s on the TV and its phones, scrubbed to the end",
    async (_id, moment) => {
      const user = userEvent.setup();
      renderMoments(DEV_MOMENTS);
      await user.click(pickerChip(moment.gameId));
      await user.click(pickerChip(moment.chip));
      await screensLoaded();
      scrubTo(moment.durationMs);
      expect(screen.getByText(secondsLabel(moment.durationMs))).toBeTruthy();
      expect(document.querySelectorAll('[data-surface="phone"]')).toHaveLength(
        moment.phones.length,
      );
      expect(document.querySelectorAll('[data-surface="no-tv"]')).toHaveLength(
        moment.noTvPhones.length,
      );
      for (const surface of document.querySelectorAll("[data-surface]")) {
        // Parsed by the game's own view schema: a mismatch would show the updating notice.
        expect(textOf(surface)).not.toContain(en.status.gameUpdating);
        expect(textOf(surface).trim()).not.toBe("");
      }
    },
  );
});
