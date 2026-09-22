// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import type { ServerClock } from "@opg/ui";
import { LocaleProvider } from "@opg/i18n";
import { PhoneReveal, ordinalOf } from "./PhoneReveal";
import { RON_REVEAL_PREVIEW_START, realOrNahPreviews } from "./preview";

describe("ordinalOf", () => {
  it("ranks by total score, highest first", () => {
    expect(ordinalOf({ a: 2000, b: 1000, c: 0 }, "b")).toBe(2);
    expect(ordinalOf({ a: 2000, b: 1000, c: 0 }, "a")).toBe(1);
    expect(ordinalOf({ a: 2000, b: 1000, c: 0 }, "c")).toBe(3);
  });

  it("breaks ties by ascending id, lowest id ranks first", () => {
    expect(ordinalOf({ a: 500, b: 500 }, "a")).toBe(1);
    expect(ordinalOf({ a: 500, b: 500 }, "b")).toBe(2);
  });

  it("treats a missing entry as 0", () => {
    expect(ordinalOf({ a: 100 }, "ghost")).toBe(2);
  });
});

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
  const preview = realOrNahPreviews.find((candidate) => candidate.label === label);
  if (preview === undefined) throw new Error(`no preview labelled ${label}`);
  if (preview.room.role !== "player") throw new Error(`${label} is not a phone`);
  if (!("myPick" in preview.view)) throw new Error(`${label} is not a player view`);
  return { view: preview.view, room: preview.room };
}

/** Mounts the phone reveal as if `elapsedMs` had passed since it started. */
function setup(label: string, elapsedMs: number) {
  const { view, room } = phoneSample(label);
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
      <PhoneReveal
        view={view}
        players={room.players}
        myId={room.you}
        deadline={room.game?.deadline ?? null}
        timerStartedAt={room.game?.timerStartedAt ?? null}
        clock={clock}
      />
    </LocaleProvider>,
  );
  return { advanceTo, rendered };
}

describe("PhoneReveal, staged from the start", () => {
  it("shows the teaser, then lands each personal card with a buzz", () => {
    vi.useFakeTimers();
    const vibrate = stubVibrate();
    const { advanceTo } = setup("Phone: reveal", 0);

    expect(screen.getByText("Eyes on the TV")).toBeTruthy();
    expect(screen.queryByText("Maya's lie got you")).toBeNull();

    advanceTo(8345);
    expect(screen.getByText("Maya's lie got you")).toBeTruthy();
    expect(vibrate).toHaveBeenLastCalledWith([120]);

    advanceTo(13000);
    expect(screen.getByText("You fooled Sam and Noa!")).toBeTruthy();
    expect(screen.getByText("+1,000")).toBeTruthy();

    advanceTo(15950);
    expect(screen.getByText("The truth: emus")).toBeTruthy();

    advanceTo(19450);
    expect(screen.getByText(/You're \d/)).toBeTruthy();
  });
});

describe("PhoneReveal, sticker layering", () => {
  it("renders the confetti behind the headline, never over it", () => {
    vi.useFakeTimers();
    stubVibrate();
    const { advanceTo, rendered } = setup("Phone: reveal", 0);
    advanceTo(13000);
    expect(screen.getByText("You fooled Sam and Noa!")).toBeTruthy();

    const bursts = rendered.container.querySelectorAll<HTMLElement>(
      '[data-testid="reveal-burst"]',
    );
    const contents = rendered.container.querySelectorAll<HTMLElement>(
      '[data-testid="reveal-content"]',
    );
    expect(bursts.length).toBeGreaterThan(0);
    expect(contents.length).toBeGreaterThan(0);
    const burst = bursts.item(bursts.length - 1);
    const content = contents.item(contents.length - 1);
    const order = burst.compareDocumentPosition(content);
    expect((order & Node.DOCUMENT_POSITION_FOLLOWING) !== 0).toBe(true);
    expect(Number(burst.style.zIndex)).toBeLessThan(Number(content.style.zIndex));
  });
});

describe("PhoneReveal, Hebrew locale", () => {
  it("renders the settled personal cards in Hebrew, with a plain-number rank", () => {
    vi.useFakeTimers();
    stubVibrate();
    window.localStorage.setItem("opg:locale", "he");
    setup("Phone: reveal", 21999);
    expect(screen.getByText("השקר של Maya תפס אתכם")).toBeTruthy();
    expect(screen.getByText("רימיתם את Sam וNoa!")).toBeTruthy();
    expect(screen.getByText(/^האמת: emus$/)).toBeTruthy();
    window.localStorage.removeItem("opg:locale");
  });
});

describe("PhoneReveal, mounted late", () => {
  it("shows every reached card settled with no buzz", () => {
    vi.useFakeTimers();
    const vibrate = stubVibrate();
    setup("Phone: reveal", 21999);
    expect(screen.getByText("Maya's lie got you")).toBeTruthy();
    expect(screen.getByText("You fooled Sam and Noa!")).toBeTruthy();
    expect(screen.getByText("The truth: emus")).toBeTruthy();
    expect(vibrate).not.toHaveBeenCalled();
  });

  it("shows the found-truth card for the player who found it", () => {
    vi.useFakeTimers();
    setup("Phone: Dov found the truth", 21999);
    expect(screen.getByText("You found it!")).toBeTruthy();
  });
});
