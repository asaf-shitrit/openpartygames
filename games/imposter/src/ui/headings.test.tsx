// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import type { ServerClock } from "@opg/ui";
import { LocaleProvider } from "@opg/i18n";
import { imposterHostViewSchema } from "../state";
import type { ImposterAction, ImposterHostView, ImposterPlayerView } from "../state";
import { Host } from "./Host";
import { Phone } from "./Phone";
import { resultHeadingLevel } from "./PhoneResult";
import { REVEAL_PREVIEW_START, RESULT_PREVIEW_START, imposterPreviews } from "./preview";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

type Preview = (typeof imposterPreviews)[number];

const noSend = (_action: ImposterAction): void => undefined;

function findPreview(label: string): Preview {
  const preview = imposterPreviews.find((candidate) => candidate.label === label);
  if (preview === undefined) throw new Error(`no preview labelled ${label}`);
  return preview;
}

function isHostView(view: ImposterHostView | ImposterPlayerView): view is ImposterHostView {
  return "votedIds" in view;
}

function isPlayerView(view: ImposterHostView | ImposterPlayerView): view is ImposterPlayerView {
  return "myVote" in view;
}

/** The no-TV stage a preview's room carries, or null in a room with a shared screen. */
function stageOf(preview: Preview): ImposterHostView | null {
  const parsed = imposterHostViewSchema.safeParse(preview.room.game?.stage);
  return parsed.success ? parsed.data : null;
}

function uiAt(preview: Preview, now: () => number, timerStartedAt?: number | null) {
  const { room, view } = preview;
  const clock: ServerClock = { now };
  const deadline = room.game?.deadline ?? null;
  const started = timerStartedAt === undefined ? (room.game?.timerStartedAt ?? null) : timerStartedAt;
  if (room.role === "host" && isHostView(view)) {
    return (
      <LocaleProvider>
        <Host view={view} room={room} deadline={deadline} timerStartedAt={started} clock={clock} />
      </LocaleProvider>
    );
  }
  if (room.role === "player" && isPlayerView(view)) {
    return (
      <LocaleProvider>
        <Phone
          view={view}
          room={room}
          deadline={deadline}
          timerStartedAt={started}
          clock={clock}
          send={noSend}
          stage={stageOf(preview)}
        />
      </LocaleProvider>
    );
  }
  throw new Error(`${preview.label}: view does not match its room`);
}

function renderPreview(label: string) {
  const preview = findPreview(label);
  return render(uiAt(preview, () => preview.room.serverNow));
}

/** The heading outline as `[level, text]`, in reading order. */
function outline(): [number, string][] {
  return screen
    .queryAllByRole("heading", { hidden: true })
    .map((heading): [number, string] => [
      Number(heading.tagName.slice(1)),
      heading.textContent ?? "",
    ]);
}

function levels(): number[] {
  return outline().map(([level]) => level);
}

function h1Count(): number {
  return levels().filter((level) => level === 1).length;
}

/** The phone's "Eyes on the …" teaser is a `@opg/ui` span in a live region, with no heading. */
function isTeaser(): boolean {
  return screen
    .queryAllByRole("status")
    .some((region) => region.querySelector(".opg-marker") !== null);
}

/**
 * What is wrong with a screen state's heading levels, as sentences; empty when it is fine: one
 * h1, first, and no level skipped on the way down. A teaser (no heading of its own) must have none.
 */
function outlineProblems(found: number[], teaser: boolean): string[] {
  if (teaser) return found.length === 0 ? [] : ["a teaser should carry no heading"];
  const problems: string[] = [];
  const h1s = found.filter((level) => level === 1).length;
  if (h1s !== 1) problems.push(`expected one h1, found ${h1s}`);
  if (found[0] !== 1) problems.push("the first heading is not an h1");
  found.forEach((level, i) => {
    const before = found[i - 1];
    if (before !== undefined && level - before > 1) problems.push(`h${before} jumps to h${level}`);
  });
  return problems;
}

describe("every screen state has one h1 and no skipped levels", () => {
  it.each(imposterPreviews.map((preview) => preview.label))("%s", (label) => {
    renderPreview(label);
    expect(outlineProblems(levels(), isTeaser())).toEqual([]);
  });
});

describe("TV screens", () => {
  it("word-check: the title, then the clue order under it", () => {
    renderPreview("Host: check your phones");
    expect(levels()).toEqual([1, 2]);
  });

  it("clues: whose turn it is, then the clue order under it", () => {
    renderPreview("Host: clues");
    expect(levels()).toEqual([1, 2]);
  });

  it.each(["Host: vote", "Host: reveal", "Host: last chance"])("%s has one heading", (label) => {
    renderPreview(label);
    expect(levels()).toEqual([1]);
  });

  it("the result keeps the headline as the h1 and the score cards beneath it", () => {
    renderPreview("Host: result caught nope");
    const found = levels();
    expect(found[0]).toBe(1);
    expect(found.slice(1).every((level) => level === 2)).toBe(true);
  });
});

/** Mounts a host screen as if `elapsedMs` had passed since `start`, and lets it run on. */
function stageHost(label: string, start: number, elapsedMs: number) {
  vi.useFakeTimers();
  const preview = findPreview(label);
  let fakeNow = start + elapsedMs;
  render(uiAt(preview, () => fakeNow, start));
  return (targetMs: number) => {
    const target = start + targetMs;
    while (fakeNow < target) {
      const step = Math.min(400, target - fakeNow);
      fakeNow += step;
      act(() => {
        vi.advanceTimersByTime(step);
      });
      // A sequential ceremony: whichever beat we are on, never two h1s at once.
      expect(h1Count()).toBeLessThanOrEqual(1);
    }
  };
}

describe("TV ceremonies", () => {
  it("reveal: one h1 on every beat, from the intro to the end", () => {
    const advanceTo = stageHost("Host: reveal", REVEAL_PREVIEW_START, 0);
    expect(outline()).toEqual([[1, "The votes are in"]]);
    advanceTo(11000);
    expect(h1Count()).toBe(1);
  });

  it("result, caught: the guess is the one h1 while the verdict and word land", () => {
    const advanceTo = stageHost("Host: result caught nope", RESULT_PREVIEW_START, 0);
    expect(h1Count()).toBe(1);
    advanceTo(12000);
    expect(h1Count()).toBe(1);
    expect(levels().slice(1).every((level) => level === 2)).toBe(true);
  });

  it("result, escaped: the got-away line is the one h1 on every beat", () => {
    const advanceTo = stageHost("Host: result escaped", RESULT_PREVIEW_START, 0);
    expect(h1Count()).toBe(1);
    advanceTo(12000);
    expect(h1Count()).toBe(1);
  });
});

describe("phone screens in a room with a shared screen", () => {
  it("titles the word-check card with the clue banner; the face-down card adds no heading", () => {
    renderPreview("Phone: Maya crew card");
    expect(levels()).toEqual([1]);
  });

  it("puts the peek card's title under the clue screen's h1", () => {
    renderPreview("Phone: Dov your turn");
    expect(levels()).toEqual([1, 2]);
  });

  it("titles the ballot and the locked ballot at h1", () => {
    renderPreview("Phone: Dov vote selecting");
    expect(outline()).toEqual([[1, "Who's the imposter?"]]);
    cleanup();
    renderPreview("Phone: Dov vote locked in");
    expect(levels()).toEqual([1]);
  });

  it("titles the imposter's guess screen with the caught banner", () => {
    renderPreview("Phone: Priya last chance");
    expect(levels()).toEqual([1]);
  });
});

describe("phone screens in a no-TV room", () => {
  it("keeps one h1 above the clues stage", () => {
    renderPreview("Phone (no-TV): Dov your turn");
    expect(levels()).toEqual([1, 2]);
  });

  it("carries the last-chance title on the stage, not twice", () => {
    renderPreview("Phone (no-TV): Priya last chance");
    expect(levels()).toEqual([1]);
  });

  it("titles the settled result once", () => {
    renderPreview("Phone (no-TV): Dov result settled");
    expect(h1Count()).toBe(1);
  });
});

describe("focus on a phase change", () => {
  it("moves focus to the new phase's heading", () => {
    const ballot = findPreview("Phone: Dov vote selecting");
    const guess = findPreview("Phone: Priya last chance");
    const { rerender } = render(uiAt(ballot, () => ballot.room.serverNow));
    expect(document.activeElement).toBe(document.body);
    rerender(uiAt(guess, () => guess.room.serverNow));
    expect(document.activeElement?.tagName).toBe("H1");
    expect(document.activeElement?.textContent).toBe(outline()[0]?.[1]);
  });

  it("does not move focus while a player is typing", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    const ballot = findPreview("Phone: Dov vote selecting");
    const guess = findPreview("Phone: Priya last chance");
    const { rerender } = render(uiAt(ballot, () => ballot.room.serverNow));
    input.focus();
    rerender(uiAt(guess, () => guess.room.serverNow));
    expect(document.activeElement).toBe(input);
    input.remove();
  });
});

describe("resultHeadingLevel", () => {
  it("drops to h2 only under a no-TV room's cancelled-word card", () => {
    expect(resultHeadingLevel(true, "cancelled")).toBe(2);
    expect(resultHeadingLevel(true, "caught")).toBe(1);
    expect(resultHeadingLevel(true, "escaped")).toBe(1);
    expect(resultHeadingLevel(false, "cancelled")).toBe(1);
  });
});
