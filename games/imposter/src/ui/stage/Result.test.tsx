// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import type { ServerClock } from "@opg/ui";
import type { ImposterHostView, ImposterPlayerView } from "../../state";
import { imposterPreviews, RESULT_PREVIEW_START } from "../preview";
import { StageResult } from "./Result";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function isHostView(
  view: ImposterHostView | ImposterPlayerView,
): view is ImposterHostView {
  return "votedIds" in view;
}

function hostSample(label: string) {
  const preview = imposterPreviews.find((candidate) => candidate.label === label);
  if (preview === undefined) throw new Error(`no preview labelled ${label}`);
  if (preview.room.role !== "host") throw new Error(`${label} is not a host`);
  if (!isHostView(preview.view)) throw new Error(`${label} is not a host view`);
  return { view: preview.view, room: preview.room };
}

function setup(label: string, elapsedMs: number) {
  const { view, room } = hostSample(label);
  let fakeNow = RESULT_PREVIEW_START + elapsedMs;
  const clock: ServerClock = { now: () => fakeNow };
  const advanceTo = (targetMs: number) => {
    const target = RESULT_PREVIEW_START + targetMs;
    while (fakeNow < target) {
      const step = Math.min(400, target - fakeNow);
      fakeNow += step;
      act(() => {
        vi.advanceTimersByTime(step);
      });
    }
  };
  const rendered = render(
    <StageResult
      view={view}
      players={room.players}
      me="priya"
      deadline={room.game?.deadline ?? null}
      timerStartedAt={room.game?.timerStartedAt ?? null}
      clock={clock}
    />,
  );
  return { advanceTo, rendered };
}

describe("StageResult", () => {
  it("never shows the crew word before the word beat lands", () => {
    vi.useFakeTimers();
    setup("Host: result caught nope", 0);
    expect(screen.queryByText("GIRAFFE")).toBeNull();
  });

  it("shows the crew word and standings once settled", () => {
    vi.useFakeTimers();
    setup("Host: result caught nope", 11000);
    expect(screen.getByText("GIRAFFE")).toBeTruthy();
    expect(screen.getByText("Standings")).toBeTruthy();
    expect(screen.getByText("Priya (you)")).toBeTruthy();
  });

  it("a correct guess reads Stolen! and an incorrect one reads Nope", () => {
    vi.useFakeTimers();
    setup("Host: result caught got it", 11000);
    expect(screen.getByText("Stolen!")).toBeTruthy();
  });

  it("an escaped word reads Escaped and carries no guess line", () => {
    vi.useFakeTimers();
    setup("Host: result escaped", 11000);
    expect(screen.getByText("Escaped")).toBeTruthy();
    expect(screen.queryByText(/guessed/)).toBeNull();
  });
});
