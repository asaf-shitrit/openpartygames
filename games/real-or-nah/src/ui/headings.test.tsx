// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import type { ServerClock } from "@opg/ui";
import { LocaleProvider } from "@opg/i18n";
import type { RonAction, RonHostView, RonPlayerView } from "../types";
import { Host } from "./Host";
import { Phone } from "./Phone";
import { RON_REVEAL_PREVIEW_START, realOrNahPreviews } from "./preview";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

type Preview = (typeof realOrNahPreviews)[number];

const noSend = (_action: RonAction): void => undefined;

function findPreview(label: string): Preview {
  const preview = realOrNahPreviews.find((candidate) => candidate.label === label);
  if (preview === undefined) throw new Error(`no preview labelled ${label}`);
  return preview;
}

function isHostView(view: RonHostView | RonPlayerView): view is RonHostView {
  return "submittedIds" in view;
}

function isPlayerView(view: RonHostView | RonPlayerView): view is RonPlayerView {
  return "myPick" in view;
}

function uiAt(preview: Preview, now: () => number) {
  const { room, view } = preview;
  const clock: ServerClock = { now };
  const deadline = room.game?.deadline ?? null;
  const timerStartedAt = room.game?.timerStartedAt ?? null;
  if (room.role === "host" && isHostView(view)) {
    return (
      <LocaleProvider>
        <Host
          view={view}
          room={room}
          deadline={deadline}
          timerStartedAt={timerStartedAt}
          clock={clock}
        />
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
          timerStartedAt={timerStartedAt}
          clock={clock}
          send={noSend}
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

/** The phone's "Eyes on the TV" teaser is a `@opg/ui` span with no heading of its own. */
function isTeaser(): boolean {
  return screen.queryByText("Eyes on the TV") !== null;
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
  it.each(realOrNahPreviews.map((preview) => preview.label))("%s", (label) => {
    renderPreview(label);
    expect(outlineProblems(levels(), isTeaser())).toEqual([]);
  });
});

describe("heading outline", () => {
  it("titles the TV write phase, with lies-in as its subsection", () => {
    renderPreview("Host: write");
    expect(outline()).toEqual([
      [1, "Write a believable lie on your phone"],
      [2, "Lies in"],
    ]);
  });

  it("titles the TV vote phase", () => {
    renderPreview("Host: vote");
    expect(outline()).toEqual([[1, "Which one is real?"]]);
  });

  it("titles the phone's lie form with the fact", () => {
    renderPreview("Phone: Dov writing");
    expect(levels()).toEqual([1]);
  });

  it("titles a locked lie", () => {
    renderPreview("Phone: lie locked in");
    expect(outline()).toEqual([[1, "Lie locked in"]]);
  });

  it("titles the ballot, and a locked ballot keeps that title above its lock-in", () => {
    renderPreview("Phone: Dov voting");
    expect(outline()).toEqual([[1, "Which one is real?"]]);
    cleanup();
    renderPreview("Phone: vote locked in");
    expect(outline()).toEqual([
      [1, "Which one is real?"],
      [2, "Vote locked in"],
    ]);
  });
});

/** Mounts the TV reveal as if `elapsedMs` had passed since it started, and lets it run on. */
function stageHostReveal(label: string, elapsedMs: number) {
  vi.useFakeTimers();
  const preview = findPreview(label);
  let fakeNow = RON_REVEAL_PREVIEW_START + elapsedMs;
  const rendered = render(uiAt(preview, () => fakeNow));
  const advanceTo = (targetMs: number) => {
    const target = RON_REVEAL_PREVIEW_START + targetMs;
    while (fakeNow < target) {
      const step = Math.min(400, target - fakeNow);
      fakeNow += step;
      act(() => {
        vi.advanceTimersByTime(step);
      });
      // A sequential reveal: whichever beat we are on, never two h1s at once.
      expect(levels().filter((level) => level === 1).length).toBeLessThanOrEqual(1);
    }
  };
  return { advanceTo, rendered };
}

describe("TV reveal beats", () => {
  it("keeps one h1 as the ceremony runs, then hands it to the standings", () => {
    const { advanceTo } = stageHostReveal("Host: reveal, 3 foolers", 0);
    expect(outline()).toEqual([[1, "Let's see who fooled who"]]);

    advanceTo(15750);
    // Two sections once the reveal is playing out, in stage order: the fact on the left, the
    // lies table on the right (see HostReveal.tsx). "The lies" is absent at elapsed 0 above
    // because the table renders nothing until the first row lands.
    expect(outline()).toEqual([
      [1, "Let's see who fooled who"],
      [2, "The truth"],
      [2, "The lies"],
    ]);

    advanceTo(21999);
    expect(outline()).toEqual([[1, "Standings"]]);
  });

  it("mounted late, shows only the standings", () => {
    stageHostReveal("Host: reveal, 3 foolers", 21999);
    expect(outline()).toEqual([[1, "Standings"]]);
  });
});

describe("phone reveal beats", () => {
  it("has no heading during the teaser, then gives the newest card the h1", () => {
    const { advanceTo } = stageHostReveal("Phone: reveal", 0);
    expect(isTeaser()).toBe(true);
    expect(outline()).toEqual([]);

    advanceTo(8345);
    expect(outline()).toEqual([[1, "Maya's lie got you"]]);

    advanceTo(13000);
    expect(outline()).toEqual([
      [1, "You fooled Sam and Noa!"],
      [2, "Maya's lie got you"],
    ]);
  });
});

describe("focus on a phase change", () => {
  it("moves focus to the new phase's heading", () => {
    const writing = findPreview("Phone: Dov writing");
    const voting = findPreview("Phone: Dov voting");
    const { rerender } = render(uiAt(writing, () => writing.room.serverNow));
    expect(document.activeElement).toBe(document.body);
    rerender(uiAt(voting, () => voting.room.serverNow));
    expect(document.activeElement?.tagName).toBe("H1");
    expect(document.activeElement?.textContent).toBe("Which one is real?");
  });

  it("does not move focus while a player is typing", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    const writing = findPreview("Phone: Dov writing");
    const voting = findPreview("Phone: Dov voting");
    const { rerender } = render(uiAt(writing, () => writing.room.serverNow));
    input.focus();
    rerender(uiAt(voting, () => voting.room.serverNow));
    expect(document.activeElement).toBe(input);
    input.remove();
  });
});
