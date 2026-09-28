// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ServerClock } from "@opg/ui";
import { LocaleProvider } from "@opg/i18n";
import type { DoodleAction, DoodleHostView, DoodlePlayerView } from "../state";
import { Host } from "./Host";
import { Phone } from "./Phone";
import { doodleBluffPreviews } from "./preview";
import type { DoodleBluffPreview } from "./preview";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

const noSend = (_action: DoodleAction): void => undefined;

function findPreview(label: string): DoodleBluffPreview {
  const preview = doodleBluffPreviews.find((candidate) => candidate.label === label);
  if (preview === undefined) throw new Error(`no preview labelled ${label}`);
  return preview;
}

function isHostView(view: DoodleHostView | DoodlePlayerView): view is DoodleHostView {
  return "drawnIds" in view;
}

function isPlayerView(view: DoodleHostView | DoodlePlayerView): view is DoodlePlayerView {
  return "myPrompts" in view;
}

function ui(preview: DoodleBluffPreview) {
  const { room, view } = preview;
  const clock: ServerClock = { now: () => room.serverNow };
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
          stage={preview.stage ?? null}
        />
      </LocaleProvider>
    );
  }
  throw new Error(`${preview.label}: view does not match its room`);
}

function renderPreview(label: string) {
  return render(ui(findPreview(label)));
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

/** The phone's "Eyes on the TV" teaser is a `@opg/ui` span with no heading of its own. */
function isTeaser(): boolean {
  return screen.queryByText("Eyes on the TV") !== null;
}

/**
 * What is wrong with a screen state's heading levels, as sentences; empty when it is fine: one
 * h1, first, and no level skipped on the way down. A teaser (no heading of its own) must have none.
 */
function outlineProblems(levels: number[], teaser: boolean): string[] {
  if (teaser) return levels.length === 0 ? [] : ["a teaser should carry no heading"];
  const problems: string[] = [];
  const h1s = levels.filter((level) => level === 1).length;
  if (h1s !== 1) problems.push(`expected one h1, found ${h1s}`);
  if (levels[0] !== 1) problems.push("the first heading is not an h1");
  levels.forEach((level, i) => {
    const before = levels[i - 1];
    if (before !== undefined && level - before > 1) problems.push(`h${before} jumps to h${level}`);
  });
  return problems;
}

describe("every screen state has one h1 and no skipped levels", () => {
  it.each(doodleBluffPreviews.map((preview) => preview.label))("%s", (label) => {
    renderPreview(label);
    const levels = outline().map(([level]) => level);
    expect(outlineProblems(levels, isTeaser())).toEqual([]);
  });
});

describe("TV screens", () => {
  it.each([
    ["Host: draw", "Everyone is drawing"],
    ["Host: title", "Who's written"],
    ["Host: vote", "Which title is real?"],
    ["Host: gallery", "The gallery — gone after tonight"],
  ])("%s has its title as the only heading", (label, title) => {
    renderPreview(label);
    expect(outline()).toEqual([[1, title]]);
  });

  it("puts the real title under the reveal's h1", () => {
    renderPreview("Host: reveal found");
    expect(outline().map(([level]) => level)).toEqual([1, 2]);
  });
});

describe("phone screens in a room with a shared screen", () => {
  it("makes the drawing's own label the h1 while drawing", () => {
    renderPreview("Phone: Dov drawing");
    expect(outline().map(([level]) => level)).toEqual([1]);
  });

  it("titles the title form, the sit-tight card and the ballot at h1", () => {
    renderPreview("Phone: Maya writing a title");
    expect(outline()).toEqual([[1, "Give it a good lie"]]);
    cleanup();
    renderPreview("Phone: Priya sit tight (artist)");
    expect(outline().map(([level]) => level)).toEqual([1]);
    cleanup();
    renderPreview("Phone: Maya voting");
    expect(outline()).toEqual([[1, "Which title is real?"]]);
  });

  it("titles the personal result at h1 once the ceremony reaches it", () => {
    renderPreview("Phone: Maya found it");
    expect(outline().map(([level]) => level)).toEqual([1]);
  });
});

describe("phone screens in a no-TV room", () => {
  it("keeps the staged room title as the h1 and the controls' title beneath it", () => {
    renderPreview("Phone (no-TV): Maya voting");
    expect(outline()).toEqual([
      [1, "The room is voting"],
      [2, "Which title is real?"],
    ]);
  });

  it("does the same for the drawing phase", () => {
    renderPreview("Phone (no-TV): Dov drawing");
    expect(outline().map(([level]) => level)).toEqual([1, 2]);
  });
});

describe("focus on a phase change", () => {
  it("moves focus to the new phase's heading", () => {
    const writing = findPreview("Phone: Maya writing a title");
    const voting = findPreview("Phone: Maya voting");
    const { rerender } = render(ui(writing));
    expect(document.activeElement).toBe(document.body);
    rerender(ui(voting));
    expect(document.activeElement?.tagName).toBe("H1");
    expect(document.activeElement?.textContent).toBe("Which title is real?");
  });

  it("does not move focus while a player is typing", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    const writing = findPreview("Phone: Maya writing a title");
    const voting = findPreview("Phone: Maya voting");
    const { rerender } = render(ui(writing));
    input.focus();
    rerender(ui(voting));
    expect(document.activeElement).toBe(input);
    input.remove();
  });
});
