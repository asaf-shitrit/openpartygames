// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import type { CueId, ServerClock, SoundEngine } from "@opg/ui";
import { SoundProvider } from "@opg/ui";
import { LocaleProvider } from "@opg/i18n";
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
    <LocaleProvider>
      <SoundProvider engine={engine}>
        <HostReveal
          view={view}
          players={room.players}
          deadline={room.game?.deadline ?? null}
          timerStartedAt={room.game?.timerStartedAt ?? null}
          clock={clock}
        />
      </SoundProvider>
    </LocaleProvider>,
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
    // The duds land as one block, each row saying for itself that it fooled nobody.
    expect(screen.getAllByText("Fooled nobody")).toHaveLength(3);

    advanceTo(4050);
    expect(screen.getByText("rabbits")).toBeTruthy();
    expect(screen.queryByText("Noa")).toBeNull();

    advanceTo(5800);
    expect(screen.getByText("Noa")).toBeTruthy();

    advanceTo(14550);
    expect(screen.getByText("The truth")).toBeTruthy();
    expect(screen.getByText("?")).toBeTruthy();

    advanceTo(15750);
    // The answer now lands in two places at this beat: the truth card, and the fact's blank
    // above it, which reads "...went to war against emus and lost." once the truth stamps.
    // This beat is about the card, so scope to it rather than matching "emus" anywhere.
    expect(screen.getByText("The truth").parentElement?.textContent).toContain("emus");
    expect(screen.getByText("REAL")).toBeTruthy();

    advanceTo(16350);
    expect(screen.getByText("+1,000 each")).toBeTruthy();

    advanceTo(18550);
    expect(screen.getByText("Standings")).toBeTruthy();
  });
});

describe("HostReveal, mounted late", () => {
  it("renders the settled end state (standings, having retired the lies and truth) with no cues", () => {
    vi.useFakeTimers();
    const { engine } = setup("Host: reveal, 3 foolers", 21999);

    expect(screen.getByText("Standings")).toBeTruthy();
    expect(screen.queryByText("These fooled nobody")).toBeNull();
    expect(screen.queryByText("emus")).toBeNull();
    expect(screen.queryByText("REAL")).toBeNull();
    expect(engine.cues).toEqual([]);
  });

  it("states the truth for screen readers once it is stamped, even once standings have taken the stage", () => {
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
    // Mid-reveal, once the removed lie's own beat has fired but before standings take
    // the stage (see the "settled" test below for that swap).
    setup("Host: reveal after a kick", 5000);
    expect(screen.getByText("(removed)")).toBeTruthy();
  });

  it("swaps to standings once they land, instead of piling up under the removed card", () => {
    vi.useFakeTimers();
    setup("Host: reveal after a kick", 29999);
    expect(screen.queryByText("(removed)")).toBeNull();
    expect(screen.getByText("Standings")).toBeTruthy();
  });
});

describe("HostReveal, Hebrew locale", () => {
  it("renders the settled facts (duds, truth) in Hebrew", () => {
    vi.useFakeTimers();
    window.localStorage.setItem("opg:locale", "he");
    // Before standings take the stage: the truth is stamped and its finders are in
    // (see the English timeline in "staged from the start" above for the beat math).
    setup("Host: reveal, 3 foolers", 17000);
    expect(screen.getByText("בואו נראה מי רימה את מי")).toBeTruthy();
    expect(screen.getByText("השקרים")).toBeTruthy();
    expect(screen.getAllByText("לא רימה אף אחד")).toHaveLength(3);
    expect(screen.getByText("האמת")).toBeTruthy();
    expect(screen.getByText("אמת")).toBeTruthy();
    window.localStorage.removeItem("opg:locale");
  });

  it("renders the standings in Hebrew once they take the stage", () => {
    vi.useFakeTimers();
    window.localStorage.setItem("opg:locale", "he");
    setup("Host: reveal, 3 foolers", 21999);
    expect(screen.getByText("הדירוג")).toBeTruthy();
    window.localStorage.removeItem("opg:locale");
  });
});

describe("HostReveal, other lie counts", () => {
  it("gives every dud its own row when only two lies fooled anyone", () => {
    vi.useFakeTimers();
    // Mid-reveal, well before standings retire the lies table and the truth. The fixture
    // turns "dingoes" into a dud on top of the base reveal's three, leaving four.
    setup("Host: reveal, 2 foolers plus a dud", 5000);
    expect(screen.getAllByText("Fooled nobody")).toHaveLength(4);
  });

  it("gives every lie a dud row, and no callout, for an all-duds reveal", () => {
    vi.useFakeTimers();
    setup("Host: reveal, 0 foolers (duds only)", 5000);
    expect(screen.getAllByText("Fooled nobody")).toHaveLength(6);
    expect(screen.queryByText("Fooled everyone!")).toBeNull();
  });

  it("says nobody found it when foundByIds is empty", () => {
    vi.useFakeTimers();
    const { view, room } = hostSample("Host: reveal, 3 foolers");
    const emptyFound: RonHostView = {
      ...view,
      reveal: view.reveal ? { ...view.reveal, foundByIds: [] } : null,
    };
    // Before standings retire the truth section; see the beat math above.
    const clock: ServerClock = { now: () => RON_REVEAL_PREVIEW_START + 17000 };
    render(
      <LocaleProvider>
        <HostReveal
          view={emptyFound}
          players={room.players}
          deadline={null}
          timerStartedAt={RON_REVEAL_PREVIEW_START}
          clock={clock}
        />
      </LocaleProvider>,
    );
    expect(screen.getByText("Nobody found it! Tricky one.")).toBeTruthy();
  });
});

/**
 * The fact keeps its blank on the reveal: an underline while the answer is hidden, the answer
 * itself once the truth stamps. Both callers of `PromptText` on the write and vote screens pass
 * one or the other; the reveal passed neither, so `BlankSlot` rendered nothing and the TV showed
 * "...went to war against  and lost." with a hole in it, on the one screen whose job is to
 * reveal the answer.
 */
/** The element whose whole text is exactly this sentence — the prompt line, not an ancestor. */
function lineReading(sentence: string): HTMLElement | undefined {
  const all = [...document.body.querySelectorAll<HTMLElement>("*")];
  return all.find((el) => (el.textContent ?? "").replace(/\s+/g, " ").trim() === sentence);
}

describe("HostReveal, the fact's blank", () => {
  const WITH_ANSWER = "In 1932, the Australian army went to war against emus and lost.";
  const WITHOUT_ANSWER = "In 1932, the Australian army went to war against and lost.";

  it("draws an underline in the blank while the answer is still hidden", () => {
    vi.useFakeTimers();
    const { advanceTo } = setup("Host: reveal, 3 foolers", 0);

    // The truth section is up and still showing "?" — see the beat math above.
    advanceTo(14550);
    const line = lineReading(WITHOUT_ANSWER);
    expect(line).toBeTruthy();
    expect(line?.querySelector("svg")).toBeTruthy();
  });

  it("puts the answer into the sentence once the truth stamps", () => {
    vi.useFakeTimers();
    const { advanceTo } = setup("Host: reveal, 3 foolers", 15750);

    expect(lineReading(WITH_ANSWER)).toBeTruthy();
    expect(lineReading(WITHOUT_ANSWER)).toBeUndefined();

    // And it stays for the rest of the beat, rather than flashing on the stamp.
    advanceTo(17000);
    expect(lineReading(WITH_ANSWER)).toBeTruthy();
  });
});

/**
 * The composition this replaces stacked staggered cards and put one caption, "These fooled
 * nobody", between the duds and the foolers — 12px below the cards it described and 10px above
 * the cards it did not (HostReveal.tsx's `DudsRow`, before this change). On a TV a bold caption
 * sitting above a row of cards reads as their heading, so it labelled the wrong group. A row
 * that states its own outcome cannot be read against the wrong lie, wherever the table puts it.
 *
 * The settled frame, elapsed 18250ms: every lie has flipped and paid out, standings are still
 * 250ms away. It is the instant the dev gallery freezes these fixtures at (`revealPreviewNow`
 * in preview.ts) and so the one the visual baseline captures.
 */
const SETTLED_MS = 18250;

/** The row a cell belongs to: each cell is a direct child of its row (see `rowStyle`). */
function rowTextOf(cell: HTMLElement): string {
  return (cell.parentElement?.textContent ?? "").replace(/\s+/g, " ");
}

describe("HostReveal, every lie carries its own outcome", () => {
  const DUDS = ["koalas", "a swarm of locusts", "kangaroos"];
  const FOOLERS = ["cane toads", "rabbits", "dingoes"];

  it("puts 'Fooled nobody' in the row of each lie that fooled nobody, and in no other", () => {
    vi.useFakeTimers();
    setup("Host: reveal, 3 foolers", SETTLED_MS);

    const rows = screen.getAllByText("Fooled nobody").map(rowTextOf);
    expect(rows).toHaveLength(DUDS.length);
    for (const dud of DUDS) {
      expect(rows.filter((row) => row.includes(dud))).toHaveLength(1);
    }
    for (const fooler of FOOLERS) {
      expect(rows.some((row) => row.includes(fooler))).toBe(false);
    }
  });

  it("puts a fooler's points in that fooler's own row", () => {
    vi.useFakeTimers();
    setup("Host: reveal, 3 foolers", SETTLED_MS);

    // Dov's "cane toads" fooled two people at 500 each; the other two foolers paid 500.
    expect(rowTextOf(screen.getByText("+1,000"))).toContain("cane toads");
    const five = screen.getAllByText("+500").map(rowTextOf);
    expect(five).toHaveLength(2);
    expect(five.some((row) => row.includes("rabbits"))).toBe(true);
    expect(five.some((row) => row.includes("dingoes"))).toBe(true);
  });
});
