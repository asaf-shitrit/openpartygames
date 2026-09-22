// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { LocaleProvider } from "@opg/i18n";
import type { ServerClock } from "@opg/ui";
import type { ImposterHostView, ImposterPlayerView } from "../../state";
import { imposterPreviews, REVEAL_PREVIEW_START } from "../preview";
import { StageReveal } from "./Reveal";

const matchMediaDescriptor = Object.getOwnPropertyDescriptor(window, "matchMedia");

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  Reflect.deleteProperty(navigator, "vibrate");
  if (matchMediaDescriptor === undefined) Reflect.deleteProperty(window, "matchMedia");
  else Object.defineProperty(window, "matchMedia", matchMediaDescriptor);
});

function stubVibrate() {
  const vibrate = vi.fn<(pattern: number | number[]) => boolean>(() => true);
  Object.defineProperty(navigator, "vibrate", {
    configurable: true,
    value: vibrate,
  });
  return vibrate;
}

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

/** Mounts the stage as if `elapsedMs` had passed since the reveal started. */
function setup(label: string, elapsedMs: number) {
  const { view, room } = hostSample(label);
  let fakeNow = REVEAL_PREVIEW_START + elapsedMs;
  const clock: ServerClock = { now: () => fakeNow };
  const advanceTo = (targetMs: number) => {
    const target = REVEAL_PREVIEW_START + targetMs;
    while (fakeNow < target) {
      const step = Math.min(400, target - fakeNow);
      fakeNow += step;
      act(() => {
        vi.advanceTimersByTime(step);
      });
    }
  };
  const rendered = render(
    <StageReveal
      view={view}
      players={room.players}
      deadline={room.game?.deadline ?? null}
      timerStartedAt={room.game?.timerStartedAt ?? null}
      clock={clock}
    />,
    { wrapper: LocaleProvider },
  );
  return { advanceTo, rendered };
}

function badgeTexts(): string[] {
  return screen
    .getAllByTestId("stage-reveal-badge")
    .map((el) => el.textContent ?? "");
}

describe("StageReveal, caught", () => {
  it("shows no badge before the tally beats start", () => {
    vi.useFakeTimers();
    setup("Host: reveal", 0);
    expect(screen.queryAllByTestId("stage-reveal-badge")).toHaveLength(0);
  });

  it("shows the ring on the imposter's row mid-suspense, no badge yet", () => {
    vi.useFakeTimers();
    setup("Host: reveal", 6500);
    expect(screen.getByText("Verdict incoming")).toBeTruthy();
    expect(screen.queryAllByTestId("stage-reveal-badge")).toHaveLength(0);
  });

  it("stamps Imposter! on the imposter's row once the verdict lands", () => {
    vi.useFakeTimers();
    const { advanceTo } = setup("Host: reveal", 0);
    advanceTo(8100);
    expect(badgeTexts()).toEqual(["Imposter!"]);
  });

  it("mounted late renders the settled verdict with no cue", () => {
    vi.useFakeTimers();
    const vibrate = stubVibrate();
    setup("Host: reveal", 11200);
    expect(badgeTexts()).toEqual(["Imposter!"]);
    expect(vibrate).not.toHaveBeenCalled();
  });
});

describe("StageReveal, wrong accusation", () => {
  it("stamps the accused row first, then the real imposter's row at unmask", () => {
    vi.useFakeTimers();
    const { advanceTo } = setup("Host: reveal wrong", 0);
    advanceTo(8100);
    expect(badgeTexts()).toEqual(["Not the imposter"]);
    advanceTo(9100);
    const badges = badgeTexts();
    expect(badges).toHaveLength(2);
    expect(badges).toEqual(expect.arrayContaining(["Imposter!", "Not the imposter"]));
  });
});

describe("StageReveal, tie and no votes", () => {
  it("a tie shows no verdict badge before the unmask, only the caption", () => {
    vi.useFakeTimers();
    setup("Host: reveal tie", 8100);
    expect(screen.getByText("It's a tie!")).toBeTruthy();
    expect(screen.queryAllByTestId("stage-reveal-badge")).toHaveLength(0);
  });

  it("a tie still unmasks the real imposter, same as the TV", () => {
    vi.useFakeTimers();
    setup("Host: reveal tie", 11200);
    expect(badgeTexts()).toEqual(["Imposter!"]);
  });

  it("no votes shows the no-votes caption", () => {
    vi.useFakeTimers();
    setup("Host: reveal no votes", 11200);
    expect(screen.getByText("No votes?!")).toBeTruthy();
  });
});

describe("StageReveal, next note", () => {
  it("shows nothing new at the next beat before it is reached", () => {
    vi.useFakeTimers();
    setup("Host: reveal", 8100);
    expect(screen.queryByText(/One last chance/)).toBeNull();
  });

  it("shows the sticky note once the next beat lands, same words as the TV", () => {
    vi.useFakeTimers();
    setup("Host: reveal", 10600);
    expect(screen.getByText("One last chance, Priya…")).toBeTruthy();
  });

  it("shows the slipped-away note on a wrong accusation", () => {
    vi.useFakeTimers();
    setup("Host: reveal wrong", 10600);
    expect(screen.getByText(/slipped away: \+1,000/)).toBeTruthy();
  });
});

describe("StageReveal, reduced motion", () => {
  it("still buzzes the heartbeat during suspense, ring fixed rather than animating", () => {
    stubReducedMotion(true);
    const vibrate = stubVibrate();
    vi.useFakeTimers();
    const { advanceTo } = setup("Host: reveal", 5500);
    advanceTo(6000);
    expect(vibrate).toHaveBeenCalled();
    expect(screen.getByText("Verdict incoming")).toBeTruthy();
  });

  it("lands on the complete, readable settled state with every text equivalent present", () => {
    stubReducedMotion(true);
    vi.useFakeTimers();
    setup("Host: reveal", 11200);
    expect(badgeTexts()).toEqual(["Imposter!"]);
    expect(screen.getByText("One last chance, Priya…")).toBeTruthy();
  });
});
