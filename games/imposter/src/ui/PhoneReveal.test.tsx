// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import type { ServerClock } from "@opg/ui";
import { PhoneReveal } from "./PhoneReveal";
import { REVEAL_PREVIEW_START, imposterPreviews } from "./preview";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  Reflect.deleteProperty(navigator, "vibrate");
});

function stubVibrate() {
  const vibrate = vi.fn<(pattern: number | number[]) => boolean>(() => true);
  Object.defineProperty(navigator, "vibrate", {
    configurable: true,
    value: vibrate,
  });
  return vibrate;
}

function phoneSample(label: string) {
  const preview = imposterPreviews.find(
    (candidate) => candidate.label === label,
  );
  if (preview === undefined) throw new Error(`no preview labelled ${label}`);
  if (preview.room.role !== "player")
    throw new Error(`${label} is not a phone`);
  if (!("myVote" in preview.view)) {
    throw new Error(`${label} is not a player view`);
  }
  return { view: preview.view, room: preview.room };
}

/** Mounts the phone reveal as if `elapsedMs` had passed since it started. */
function setup(label: string, elapsedMs: number) {
  const { view, room } = phoneSample(label);
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
  const me = room.players.find((player) => player.id === room.you) ?? null;
  const rendered = render(
    <PhoneReveal
      view={view}
      players={room.players}
      me={me}
      deadline={room.game?.deadline ?? null}
      timerStartedAt={room.game?.timerStartedAt ?? null}
      clock={clock}
      stage={null}
    />,
  );
  return { advanceTo, rendered };
}

describe("PhoneReveal, staged from the start", () => {
  it("shows the teaser, then lands the spotter result with a buzz", () => {
    vi.useFakeTimers();
    const vibrate = stubVibrate();
    const { advanceTo } = setup("Phone: Dov reveal", 0);

    expect(screen.getByText("Eyes on the TV")).toBeTruthy();
    expect(screen.getByText("The votes are in…")).toBeTruthy();
    expect(screen.queryByText("You spotted Priya!")).toBeNull();

    advanceTo(5600);
    expect(screen.getByText("Here it comes…")).toBeTruthy();

    advanceTo(8400);
    expect(screen.getByText("You spotted Priya!")).toBeTruthy();
    expect(screen.getByText("+500 if they miss the word.")).toBeTruthy();
    expect(vibrate).toHaveBeenCalledWith([60, 40, 60, 40, 140]);
  });

  it("lands the caught imposter result with the caught pattern", () => {
    vi.useFakeTimers();
    const vibrate = stubVibrate();
    const { advanceTo } = setup("Phone: Priya reveal caught", 0);

    advanceTo(8400);
    expect(screen.getByText("You got caught!")).toBeTruthy();
    expect(
      screen.getByText("Get ready to guess the crew's word."),
    ).toBeTruthy();
    expect(vibrate).toHaveBeenCalledWith([140, 60, 260]);
  });
});

describe("PhoneReveal, sticker layering", () => {
  it("renders the sticker burst behind the headline, never over it", () => {
    vi.useFakeTimers();
    stubVibrate();
    const { advanceTo, rendered } = setup("Phone: Dov reveal", 0);
    advanceTo(8400);
    expect(screen.getByText("You spotted Priya!")).toBeTruthy();

    const burst = rendered.container.querySelector<HTMLElement>(
      '[data-testid="reveal-burst"]',
    );
    const content = rendered.container.querySelector<HTMLElement>(
      '[data-testid="reveal-content"]',
    );
    if (burst === null || content === null) {
      throw new Error("expected both the sticker burst and the content wrapper");
    }
    const order = burst.compareDocumentPosition(content);
    const follows = (order & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    expect(follows).toBe(true);
    expect(Number(burst.style.zIndex)).toBeLessThan(Number(content.style.zIndex));
  });

  // The burst covers the whole card, so if it takes pointer events it swallows taps on
  // whatever sits under it for as long as the celebration runs.
  it("lets a tap through to whatever is under the celebration", () => {
    vi.useFakeTimers();
    stubVibrate();
    const { advanceTo, rendered } = setup("Phone: Dov reveal", 0);
    advanceTo(8400);
    const burst = rendered.container.querySelector<HTMLElement>(
      '[data-testid="reveal-burst"]',
    );
    if (burst === null) throw new Error("expected the sticker burst");
    expect(burst.style.pointerEvents).toBe("none");
  });
});

describe("PhoneReveal, mounted late", () => {
  it("shows the caught imposter result with no buzz", () => {
    vi.useFakeTimers();
    const vibrate = stubVibrate();
    setup("Phone: Priya reveal caught", 11200);
    expect(screen.getByText("You got caught!")).toBeTruthy();
    expect(vibrate).not.toHaveBeenCalled();
  });

  it("shows the imposter who slipped away", () => {
    vi.useFakeTimers();
    const vibrate = stubVibrate();
    setup("Phone: Priya reveal free", 11200);
    expect(screen.getByText("You slipped away!")).toBeTruthy();
    expect(screen.getByText("+1,000 for you.")).toBeTruthy();
    expect(vibrate).not.toHaveBeenCalled();
  });

  it("tells a crew member who was not right about anything", () => {
    vi.useFakeTimers();
    const vibrate = stubVibrate();
    setup("Phone: Leo reveal", 11200);
    expect(screen.getByText("Priya was the imposter")).toBeTruthy();
    expect(screen.getByText("Get ready for their last chance.")).toBeTruthy();
    expect(vibrate).not.toHaveBeenCalled();
  });
});
