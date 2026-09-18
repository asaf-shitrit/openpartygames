// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import type { ServerClock } from "../game-ui";
import { HAPTIC_PATTERNS } from "../haptics";
import { Suspense } from "./Suspense";

function clockAt(value: number): ServerClock {
  return { now: () => value };
}

const vibrateDescriptor = Object.getOwnPropertyDescriptor(navigator, "vibrate");

function stubVibrate(): ReturnType<typeof vi.fn<(input: VibratePattern) => boolean>> {
  const fn = vi.fn<(input: VibratePattern) => boolean>(() => true);
  Object.defineProperty(navigator, "vibrate", { configurable: true, value: fn });
  return fn;
}

const matchMediaDescriptor = Object.getOwnPropertyDescriptor(window, "matchMedia");

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

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
  if (vibrateDescriptor === undefined) {
    Reflect.deleteProperty(navigator, "vibrate");
  } else {
    Object.defineProperty(navigator, "vibrate", vibrateDescriptor);
  }
  if (matchMediaDescriptor === undefined) {
    Reflect.deleteProperty(window, "matchMedia");
  } else {
    Object.defineProperty(window, "matchMedia", matchMediaDescriptor);
  }
});

function closureOf(container: HTMLElement): number {
  const root = container.querySelector("[data-closure]");
  return Number(root?.getAttribute("data-closure") ?? "-1");
}

function filledCount(container: HTMLElement): number {
  return container.querySelectorAll("[data-filled='true']").length;
}

describe("Suspense", () => {
  it("mounted mid-window lands on the right ring and dot frame", () => {
    stubReducedMotion(false);
    const vibrate = stubVibrate();
    // Beats at 416/832/1248/...; mounting at 1250ms lands just past the 3rd (dot-2, 1248ms),
    // inside its grace window, so that single beat's cue fires — not a replay of the first two.
    const { container } = render(
      <Suspense
        startedAt={0}
        durationMs={2500}
        clock={clockAt(1250)}
        label="Revealing…"
      />,
    );
    expect(closureOf(container)).toBeCloseTo(0.5, 1);
    expect(filledCount(container)).toBe(3);
    expect(vibrate).toHaveBeenCalledTimes(1);
    expect(vibrate).toHaveBeenCalledWith([...HAPTIC_PATTERNS.heartbeat]);
  });

  it("mounted past the window renders the finished frame and fires zero cues", () => {
    stubReducedMotion(false);
    const vibrate = stubVibrate();
    const { container } = render(
      <Suspense
        startedAt={0}
        durationMs={2500}
        clock={clockAt(9000)}
        label="Revealing…"
      />,
    );
    expect(closureOf(container)).toBe(1);
    expect(vibrate).not.toHaveBeenCalled();
  });

  it("under reduced motion renders a fixed frame that is never 0% or 100% closed", () => {
    stubReducedMotion(true);
    const { container } = render(
      <Suspense
        startedAt={0}
        durationMs={2500}
        clock={clockAt(0)}
        label="Revealing…"
      />,
    );
    expect(closureOf(container)).toBe(0.5);
    expect(filledCount(container)).toBe(2);
  });

  it("still buzzes the heartbeat under reduced motion", () => {
    stubReducedMotion(true);
    const vibrate = stubVibrate();
    vi.useFakeTimers();
    let now = 0;
    const clock: ServerClock = { now: () => now };
    render(
      <Suspense startedAt={0} durationMs={2500} clock={clock} label="Revealing…" />,
    );
    expect(vibrate).not.toHaveBeenCalled();
    now = 500;
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(vibrate).toHaveBeenCalledWith([...HAPTIC_PATTERNS.heartbeat]);
  });

  it("always renders a text equivalent for the beat", () => {
    stubReducedMotion(false);
    render(
      <Suspense
        startedAt={0}
        durationMs={2500}
        clock={clockAt(0)}
        label="Guessing…"
      />,
    );
    expect(screen.getByText("Guessing…")).toBeTruthy();
    expect(screen.getByRole("status")).toBeTruthy();
  });

  it("flashes and fades the ring when the reveal beat lands live", () => {
    stubReducedMotion(false);
    vi.useFakeTimers();
    const animate = vi
      .spyOn(HTMLElement.prototype, "animate")
      .mockImplementation(() => new Animation());
    let now = 0;
    const clock: ServerClock = { now: () => now };
    render(
      <Suspense startedAt={0} durationMs={2500} clock={clock} label="Revealing…" />,
    );
    expect(animate).not.toHaveBeenCalled();
    now = 2500;
    act(() => {
      vi.advanceTimersByTime(2500);
    });
    expect(animate).toHaveBeenCalledTimes(2);
  });

  it("never flashes for the drain variant, which has no landing beat", () => {
    stubReducedMotion(false);
    vi.useFakeTimers();
    const animate = vi
      .spyOn(HTMLElement.prototype, "animate")
      .mockImplementation(() => new Animation());
    let now = 0;
    const clock: ServerClock = { now: () => now };
    render(
      <Suspense
        startedAt={0}
        durationMs={15000}
        clock={clock}
        variant="drain"
        label="Guessing…"
      />,
    );
    now = 15000;
    act(() => {
      vi.advanceTimersByTime(15000);
    });
    expect(animate).not.toHaveBeenCalled();
  });

  it("closes over the full drain window with a ramping dot cycle", () => {
    stubReducedMotion(false);
    const { container } = render(
      <Suspense
        startedAt={0}
        durationMs={15000}
        clock={clockAt(15000)}
        variant="drain"
        label="Guessing…"
      />,
    );
    expect(closureOf(container)).toBe(1);
  });
});
