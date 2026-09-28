// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ServerClock } from "@opg/ui";
import { LocaleProvider } from "@opg/i18n";
import type { MltAction, MltHostView, MltPlayerView } from "../state";
import { Host } from "./Host";
import { Phone } from "./Phone";
import { mostLikelyToPreviews } from "./preview";
import type { MltPreview } from "./preview";

afterEach(cleanup);

const noSend = (_action: MltAction): void => undefined;

function findPreview(label: string): MltPreview {
  const preview = mostLikelyToPreviews.find((candidate) => candidate.label === label);
  if (preview === undefined) throw new Error(`no preview labelled ${label}`);
  return preview;
}

function isHostView(view: MltHostView | MltPlayerView): view is MltHostView {
  return "votedIds" in view;
}

function isPlayerView(view: MltHostView | MltPlayerView): view is MltPlayerView {
  return "myVote" in view;
}

function ui(preview: MltPreview) {
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

/** The document's heading outline as `[level, text]`, in reading order. */
function outline(container: HTMLElement): [number, string][] {
  return screen
    .getAllByRole("heading", { hidden: true })
    .filter((heading) => container.contains(heading))
    .map((heading): [number, string] => [
      Number(heading.tagName.slice(1)),
      heading.textContent ?? "",
    ]);
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
  it.each(mostLikelyToPreviews.map((preview) => preview.label))("%s", (label) => {
    const { container } = renderPreview(label);
    const levels = outline(container).map(([level]) => level);
    expect(outlineProblems(levels, false)).toEqual([]);
  });
});

describe("heading outline", () => {
  it("titles the TV vote with the prompt", () => {
    const { container } = renderPreview("Host: vote");
    expect(outline(container)).toEqual([
      [1, "Who's most likely to forget their own birthday party?"],
    ]);
  });

  it("titles the TV reveal with the prompt", () => {
    const { container } = renderPreview("Host: reveal picked");
    expect(outline(container).map(([level]) => level)).toEqual([1]);
  });

  it("titles a phone ballot with the prompt", () => {
    const { container } = renderPreview("Phone: Dov vote selecting");
    expect(outline(container)).toEqual([
      [1, "Who's most likely to forget their own birthday party?"],
    ]);
  });

  it("titles a locked phone ballot with the lock-in", () => {
    const { container } = renderPreview("Phone: Dov vote locked in");
    expect(outline(container)).toEqual([[1, "Vote locked in"]]);
  });

  it("keeps the stage prompt as the h1 above a no-TV ballot's lock-in", () => {
    const { container } = renderPreview("Phone (no-TV): Dov vote locked in");
    expect(outline(container)).toEqual([
      [1, "Who's most likely to forget their own birthday party?"],
      [2, "Vote locked in"],
    ]);
  });

  it("puts the personal result under the stage prompt in a no-TV reveal", () => {
    const { container } = renderPreview("Phone (no-TV): Priya reveal settled");
    expect(outline(container)).toEqual([
      [1, "Who's most likely to forget their own birthday party?"],
      [2, "You read the room!"],
    ]);
  });
});

describe("focus on a phase change", () => {
  it("moves focus to the new phase's heading", () => {
    const { rerender } = renderPreview("Phone: Dov vote selecting");
    rerender(ui(findPreview("Phone: Dov vote locked in")));
    // Same round, same phase: the lock-in is not a phase change, so nothing moves.
    expect(document.activeElement).toBe(document.body);
    rerender(ui(findPreview("Phone: Maya reveal matched")));
    expect(document.activeElement?.tagName).toBe("H1");
    expect(document.activeElement?.textContent).toBe("You read the room!");
  });

  it("does not move focus while a player is typing", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    const { rerender } = renderPreview("Phone: Dov vote selecting");
    input.focus();
    rerender(ui(findPreview("Phone: Maya reveal matched")));
    expect(document.activeElement).toBe(input);
    input.remove();
  });
});
