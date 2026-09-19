// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { LocaleProvider } from "@opg/i18n";
import type { ServerClock } from "@opg/ui";
import type { MltHostView, MltPlayerView } from "../../state";
import { mostLikelyToPreviews, REVEAL_PREVIEW_START } from "../preview";
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
  view: MltHostView | MltPlayerView,
): view is MltHostView {
  return "votedIds" in view;
}

function hostSample(label: string) {
  const preview = mostLikelyToPreviews.find(
    (candidate) => candidate.label === label,
  );
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
    <LocaleProvider>
      <StageReveal
        view={view}
        players={room.players}
        me="dov"
        deadline={room.game?.deadline ?? null}
        timerStartedAt={room.game?.timerStartedAt ?? null}
        clock={clock}
      />
    </LocaleProvider>,
  );
  return { advanceTo, rendered };
}

/** The verdict stamp's text, distinct from the hidden aria-live announcer that can repeat it. */
function stampText(): string | null {
  return screen.getByTestId("stage-verdict-stamp").textContent;
}

describe("StageReveal, staged from the start", () => {
  it("draws no marks and shows no verdict before the tally beats start", () => {
    vi.useFakeTimers();
    const { rendered } = setup("Host: reveal picked", 0);
    expect(rendered.queryByText("Most likely!")).toBeNull();
  });

  it("shows the verdict stamp and standings once the beat lands", () => {
    vi.useFakeTimers();
    const { advanceTo } = setup("Host: reveal picked", 0);
    advanceTo(8100);
    expect(stampText()).toBe("Most likely!");
    expect(screen.getByText("Explain yourself, Dov!")).toBeTruthy();
    expect(screen.getByText("Dov (you)")).toBeTruthy();
  });

  it("only ever buzzes the Suspense heartbeat, never a verdict buzz of its own", () => {
    vi.useFakeTimers();
    const vibrate = stubVibrate();
    const { advanceTo } = setup("Host: reveal picked", 0);
    advanceTo(12000);
    for (const call of vibrate.mock.calls) {
      expect(call[0]).toEqual([45, 110, 45]);
    }
  });
});

describe("StageReveal, mounted late", () => {
  it("renders the settled verdict with no cue", () => {
    vi.useFakeTimers();
    const vibrate = stubVibrate();
    setup("Host: reveal picked", 11200);
    expect(stampText()).toBe("Most likely!");
    expect(vibrate).not.toHaveBeenCalled();
  });

  it("mounted mid-suspense shows the ring and no verdict yet", () => {
    vi.useFakeTimers();
    setup("Host: reveal picked", 6000);
    expect(screen.getByText("Verdict incoming")).toBeTruthy();
    expect(screen.queryByTestId("stage-verdict-stamp")).toBeNull();
  });
});

describe("StageReveal, later beats", () => {
  it("shows the points line and the next-round note once those beats land", () => {
    vi.useFakeTimers();
    const { advanceTo } = setup("Host: reveal picked", 0);
    advanceTo(12000);
    expect(screen.getByText("Maya, Priya, Sam and Noa read the room: +500 each")).toBeTruthy();
    expect(screen.getByText("Next prompt coming up")).toBeTruthy();
  });

  it("renders with no crash before the room has an anchor", () => {
    const { view, room } = hostSample("Host: reveal picked");
    const clock: ServerClock = { now: () => room.serverNow };
    render(
      <LocaleProvider>
        <StageReveal
          view={view}
          players={room.players}
          me="dov"
          deadline={null}
          timerStartedAt={null}
          clock={clock}
        />
      </LocaleProvider>,
    );
    expect(screen.queryByTestId("stage-verdict-stamp")).toBeNull();
  });
});

describe("StageReveal, other outcomes", () => {
  it("ties show every tied name in the caption", () => {
    vi.useFakeTimers();
    setup("Host: reveal tie", 11200);
    expect(stampText()).toBe("It's a tie!");
  });

  it("a split shows no clear pick and zero highlighted rows", () => {
    vi.useFakeTimers();
    setup("Host: reveal split", 11200);
    expect(stampText()).toBe("No clear pick");
  });

  it("no votes shows the no-votes stamp", () => {
    vi.useFakeTimers();
    setup("Host: reveal no votes", 11200);
    expect(stampText()).toBe("No votes?!");
  });
});

describe("StageReveal, reduced motion", () => {
  it("still buzzes the heartbeat during suspense, ring fixed rather than animating", () => {
    stubReducedMotion(true);
    const vibrate = stubVibrate();
    vi.useFakeTimers();
    const { advanceTo } = setup("Host: reveal picked", 5500);
    advanceTo(6000);
    expect(vibrate).toHaveBeenCalled();
    expect(screen.getByText("Verdict incoming")).toBeTruthy();
  });

  it("lands on the complete, readable settled state with every text equivalent present", () => {
    stubReducedMotion(true);
    vi.useFakeTimers();
    setup("Host: reveal picked", 12000);
    expect(stampText()).toBe("Most likely!");
    expect(screen.getByText("Next prompt coming up")).toBeTruthy();
  });
});
