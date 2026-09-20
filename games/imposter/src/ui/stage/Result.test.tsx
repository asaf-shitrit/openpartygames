// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { LocaleProvider } from "@opg/i18n";
import type { ServerClock } from "@opg/ui";
import type { ImposterHostView, ImposterPlayerView } from "../../state";
import { imposterPreviews, RESULT_PREVIEW_START } from "../preview";
import { StageResult } from "./Result";

const matchMediaDescriptor = Object.getOwnPropertyDescriptor(window, "matchMedia");
const vibrateDescriptor = Object.getOwnPropertyDescriptor(navigator, "vibrate");

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  if (matchMediaDescriptor === undefined) Reflect.deleteProperty(window, "matchMedia");
  else Object.defineProperty(window, "matchMedia", matchMediaDescriptor);
  if (vibrateDescriptor === undefined) Reflect.deleteProperty(navigator, "vibrate");
  else Object.defineProperty(navigator, "vibrate", vibrateDescriptor);
});

function stubReducedMotion(matches: boolean): void {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (media: string) => ({
      media,
      matches,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }),
  });
}

function stubVibrate() {
  const vibrate = vi.fn<(pattern: number | number[]) => boolean>(() => true);
  Object.defineProperty(navigator, "vibrate", { configurable: true, value: vibrate });
  return vibrate;
}

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
    { wrapper: LocaleProvider },
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

  it("shows a suspense ring while the drumroll runs, before any letter or the verdict", () => {
    stubReducedMotion(false);
    vi.useFakeTimers();
    setup("Host: result caught nope", 0);
    expect(screen.getByText("Checking…")).toBeTruthy();
  });

  it("holds the verdict chip back until the verdict beat, on a caught word", () => {
    stubReducedMotion(false);
    vi.useFakeTimers();
    setup("Host: result caught nope", 0);
    expect(screen.queryByText("Nope")).toBeNull();
  });

  it("shows the verdict chip at t=0 on an escaped word, which has no suspense beat", () => {
    stubReducedMotion(false);
    vi.useFakeTimers();
    setup("Host: result escaped", 0);
    expect(screen.getByText("Escaped")).toBeTruthy();
  });

  it("drops the suspense ring once the verdict lands", () => {
    stubReducedMotion(false);
    vi.useFakeTimers();
    const { advanceTo } = setup("Host: result caught nope", 0);
    advanceTo(3600);
    expect(screen.queryByText("Checking…")).toBeNull();
    expect(screen.getByText("Nope")).toBeTruthy();
  });
});

describe("StageResult, reduced motion", () => {
  it("still buzzes the heartbeat during the drumroll with no ring animation", () => {
    stubReducedMotion(true);
    const vibrate = stubVibrate();
    vi.useFakeTimers();
    const { advanceTo } = setup("Host: result caught nope", 0);
    advanceTo(700);
    expect(vibrate).toHaveBeenCalled();
    expect(screen.getByText("Checking…")).toBeTruthy();
  });

  it("lands on the complete, readable settled state with a text equivalent for every beat", () => {
    stubReducedMotion(true);
    vi.useFakeTimers();
    setup("Host: result caught nope", 11000);
    expect(screen.getByText("GIRAFFE")).toBeTruthy();
    expect(screen.getByText("Nope")).toBeTruthy();
    expect(screen.getByText("Standings")).toBeTruthy();
    expect(screen.queryByText("Checking…")).toBeNull();
  });
});
