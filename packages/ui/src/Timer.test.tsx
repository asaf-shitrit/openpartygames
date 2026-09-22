import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { LocaleProvider } from "@opg/i18n";
import { TIMER_URGENT_MS, Timer } from "./Timer";
import type { ServerClock } from "./game-ui";
import { SoundProvider } from "./audio/SoundProvider";
import { FakeSoundEngine } from "./fixtures/audio";

afterEach(cleanup);

function clockAt(value: number): ServerClock {
  return { now: () => value };
}

function firstChild(container: HTMLElement): HTMLElement {
  const node = container.firstElementChild;
  if (!(node instanceof HTMLElement)) throw new Error("expected an element");
  return node;
}

function renderTimer(ui: ReactElement) {
  return render(<LocaleProvider>{ui}</LocaleProvider>);
}

function renderHebrewTimer(ui: ReactElement) {
  window.localStorage.setItem("opg:locale", "he");
  return render(<LocaleProvider>{ui}</LocaleProvider>);
}

const vibrateDescriptor = Object.getOwnPropertyDescriptor(navigator, "vibrate");

function stubVibrate(): ReturnType<typeof vi.fn<(input: VibratePattern) => boolean>> {
  const fn = vi.fn<(input: VibratePattern) => boolean>(() => true);
  Object.defineProperty(navigator, "vibrate", { configurable: true, value: fn });
  return fn;
}

function restoreVibrate(): void {
  if (vibrateDescriptor === undefined) {
    Reflect.deleteProperty(navigator, "vibrate");
    return;
  }
  Object.defineProperty(navigator, "vibrate", vibrateDescriptor);
}

describe("Timer", () => {
  it("shows dashes and a no-timer label without a deadline", () => {
    renderTimer(<Timer deadline={null} clock={clockAt(0)} />);
    expect(screen.getByText("--:--")).toBeTruthy();
    expect(screen.getByRole("timer").getAttribute("aria-label")).toBe(
      "No timer",
    );
    expect(screen.getByRole("timer").getAttribute("data-stage")).toBe("idle");
  });

  it("counts down in minutes and seconds", () => {
    renderTimer(<Timer deadline={65_000} clock={clockAt(5_000)} />);
    expect(screen.getByText("1:00")).toBeTruthy();
    expect(screen.getByRole("timer").getAttribute("aria-label")).toBe(
      "Time left 1:00",
    );
  });

  it("pads seconds and clamps expired timers at zero", () => {
    const { rerender } = renderTimer(<Timer deadline={69_000} clock={clockAt(0)} />);
    expect(screen.getByText("1:09")).toBeTruthy();
    rerender(
      <LocaleProvider>
        <Timer deadline={1_000} clock={clockAt(60_000)} />
      </LocaleProvider>,
    );
    expect(screen.getByText("0:00")).toBeTruthy();
    expect(screen.getByRole("timer").getAttribute("data-stage")).toBe("done");
  });

  it("uses the small phone styling below 120px", () => {
    const { container } = renderTimer(
      <Timer deadline={15_000} clock={clockAt(0)} size={78} />,
    );
    expect(screen.getByText("0:15").style.fontSize).toBe("22px");
    const path = container.querySelector("path");
    expect(path?.getAttribute("stroke-width")).toBe("4");
  });

  it("uses the big TV styling at 120px and above", () => {
    const { container } = renderTimer(
      <Timer deadline={15_000} clock={clockAt(0)} size={150} />,
    );
    expect(screen.getByText("0:15").style.fontSize).toBe("48px");
    const path = container.querySelector("path");
    expect(path?.getAttribute("stroke-width")).toBe("3");
    expect(firstChild(container).style.width).toBe("150px");
  });

  it("merges a custom style", () => {
    const { container } = renderTimer(
      <Timer deadline={null} clock={clockAt(0)} style={{ marginTop: 8 }} />,
    );
    expect(firstChild(container).style.marginTop).toBe("8px");
  });
});

describe("Timer, in Hebrew", () => {
  afterEach(() => {
    window.localStorage.removeItem("opg:locale");
  });

  it("speaks the no-timer state as an open-ended condition, not an absence", () => {
    renderHebrewTimer(<Timer deadline={null} clock={clockAt(0)} />);
    expect(screen.getByRole("timer").getAttribute("aria-label")).toBe(
      "זמן פתוח",
    );
  });

  it("speaks the remaining time and the almost-out state", () => {
    renderHebrewTimer(<Timer deadline={4_000} clock={clockAt(0)} />);
    expect(screen.getByRole("timer").getAttribute("aria-label")).toBe(
      "נותרו 0:04, כמעט נגמר",
    );
  });
});

describe("Timer urgency", () => {
  it("pulses and reddens the ring in the last five seconds", () => {
    const { container } = renderTimer(
      <Timer deadline={4_000} clock={clockAt(0)} />,
    );
    const timer = screen.getByRole("timer");
    expect(timer.getAttribute("data-urgent")).toBe("true");
    expect(timer.getAttribute("data-stage")).toBe("urgent");
    expect(timer.className).toBe("opg-timer-urgent");
    expect(timer.getAttribute("aria-label")).toBe("Time left 0:04, almost out");
    expect(screen.getByText("0:04").getAttribute("style")).toContain(
      "var(--opg-marker)",
    );
    const path = container.querySelector("path");
    expect(path?.getAttribute("stroke")).toBe("var(--opg-marker)");
    expect(path?.getAttribute("stroke-dasharray")).toBe("7 5");
    // Phone ring is 4px normally, 6px while urgent.
    expect(path?.getAttribute("stroke-width")).toBe("6");
  });

  it("treats exactly five seconds left as urgent", () => {
    renderTimer(<Timer deadline={TIMER_URGENT_MS} clock={clockAt(0)} />);
    expect(screen.getByRole("timer").getAttribute("data-urgent")).toBe(
      "true",
    );
  });

  it("stays calm above the urgent threshold", () => {
    const { container } = renderTimer(
      <Timer deadline={TIMER_URGENT_MS + 1_000} clock={clockAt(0)} />,
    );
    const timer = screen.getByRole("timer");
    expect(timer.getAttribute("data-urgent")).toBeNull();
    expect(timer.getAttribute("data-stage")).toBe("hurry");
    expect(timer.className).toBe("");
    expect(timer.getAttribute("aria-label")).toBe("Time left 0:06");
    const path = container.querySelector("path");
    expect(path?.getAttribute("stroke")).toBe("#2B2B2B");
    expect(path?.getAttribute("stroke-dasharray")).toBeNull();
  });

  it("thickens the hurry-stage ring by one", () => {
    const { container } = renderTimer(
      <Timer deadline={9_000} clock={clockAt(0)} size={150} />,
    );
    const timer = screen.getByRole("timer");
    expect(timer.getAttribute("data-stage")).toBe("hurry");
    const path = container.querySelector("path");
    expect(path?.getAttribute("stroke-width")).toBe("4");
  });

  it("does not pulse an already expired timer", () => {
    renderTimer(<Timer deadline={1_000} clock={clockAt(60_000)} />);
    const timer = screen.getByRole("timer");
    expect(timer.getAttribute("data-urgent")).toBeNull();
    expect(timer.getAttribute("data-stage")).toBe("done");
    expect(timer.getAttribute("aria-label")).toBe("Time left 0:00");
  });

  it("thickens the big TV ring by two while urgent", () => {
    const { container } = renderTimer(
      <Timer deadline={2_000} clock={clockAt(0)} size={150} />,
    );
    const timer = screen.getByRole("timer");
    expect(timer.getAttribute("data-stage")).toBe("final");
    const path = container.querySelector("path");
    expect(path?.getAttribute("stroke-width")).toBe("5");
    expect(path?.getAttribute("stroke-dasharray")).toBe("7 5");
  });

  it("scales up the digits and marks the aria-label in the final stage", () => {
    renderTimer(<Timer deadline={2_000} clock={clockAt(0)} />);
    expect(screen.getByRole("timer").getAttribute("aria-label")).toBe(
      "Time left 0:02, almost out",
    );
    expect(screen.getByText("0:02").style.scale).toBe("1.25");
  });
});

describe("Timer cadence", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders aligned to whole seconds, not before", () => {
    let now = 7_500;
    const clock: ServerClock = { now: () => now };
    renderTimer(<Timer deadline={10_000} clock={clock} />);
    expect(screen.getByText("0:03")).toBeTruthy();

    // The next second boundary is 500ms away (now=8000, left=2000 -> "0:02").
    now = 7_900;
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(screen.getByText("0:03")).toBeTruthy();

    now = 8_000;
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(screen.getByText("0:02")).toBeTruthy();
  });

  it("does not schedule a timer without a deadline", () => {
    renderTimer(<Timer deadline={null} clock={clockAt(0)} />);
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(screen.getByText("--:--")).toBeTruthy();
  });

  it("moves through every stage as time passes", () => {
    let now = 0;
    const clock: ServerClock = { now: () => now };
    renderTimer(<Timer deadline={12_000} clock={clock} />);
    const timer = screen.getByRole("timer");
    expect(timer.getAttribute("data-stage")).toBe("calm");

    now = 2_000;
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    expect(timer.getAttribute("data-stage")).toBe("hurry");

    now = 7_000;
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(timer.getAttribute("data-stage")).toBe("urgent");

    now = 9_000;
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    expect(timer.getAttribute("data-stage")).toBe("final");

    now = 12_000;
    act(() => {
      vi.advanceTimersByTime(3_000);
    });
    expect(timer.getAttribute("data-stage")).toBe("done");
    expect(screen.getByText("0:00")).toBeTruthy();
  });
});

describe("Timer ticks", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it("plays tick then tick-final crossing from 11s to 0s, never on mount", () => {
    let now = 0;
    const clock: ServerClock = { now: () => now };
    const engine = new FakeSoundEngine();
    renderTimer(
      <SoundProvider engine={engine}>
        <Timer deadline={11_000} clock={clock} ticks />
      </SoundProvider>,
    );
    expect(engine.plays).toHaveLength(0);

    for (let second = 10; second >= 1; second -= 1) {
      now = 11_000 - second * 1_000;
      act(() => {
        vi.advanceTimersByTime(1_000);
      });
    }

    const cues = engine.plays.map((play) => play.cue);
    expect(cues.filter((cue) => cue === "tick")).toHaveLength(7);
    expect(cues.filter((cue) => cue === "tick-final")).toHaveLength(3);
    expect(cues.slice(0, 7).every((cue) => cue === "tick")).toBe(true);
    expect(cues.slice(7)).toEqual(["tick-final", "tick-final", "tick-final"]);
  });

  it("plays no ticks when the ticks prop is off", () => {
    let now = 0;
    const clock: ServerClock = { now: () => now };
    const engine = new FakeSoundEngine();
    renderTimer(
      <SoundProvider engine={engine}>
        <Timer deadline={11_000} clock={clock} />
      </SoundProvider>,
    );
    now = 1_000;
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(engine.plays).toHaveLength(0);
  });

  it("mounting mid-countdown plays nothing until the next second changes", () => {
    let now = 4_000;
    const clock: ServerClock = { now: () => now };
    const engine = new FakeSoundEngine();
    renderTimer(
      <SoundProvider engine={engine}>
        <Timer deadline={11_000} clock={clock} ticks />
      </SoundProvider>,
    );
    expect(engine.plays).toHaveLength(0);

    now = 5_000;
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(engine.plays).toHaveLength(1);
    expect(engine.plays[0]?.cue).toBe("tick");
  });
});

describe("Timer haptics", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    restoreVibrate();
  });

  it("buzzes once per second only in the final stage, never on mount", () => {
    const vibrate = stubVibrate();
    let now = 0;
    const clock: ServerClock = { now: () => now };
    renderTimer(<Timer deadline={4_000} clock={clock} haptics />);
    expect(vibrate).not.toHaveBeenCalled();

    // 4s left at mount (urgent, not final yet): entering final at 3s fires immediately,
    // since it's a live change, not the mounted value itself.
    now = 1_000;
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(vibrate).toHaveBeenCalledTimes(1);

    now = 2_000;
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(vibrate).toHaveBeenCalledTimes(2);

    now = 3_000;
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(vibrate).toHaveBeenCalledTimes(3);
  });

  it("mounting already in the final stage plays nothing until the next second changes", () => {
    const vibrate = stubVibrate();
    let now = 2_000;
    const clock: ServerClock = { now: () => now };
    renderTimer(<Timer deadline={4_000} clock={clock} haptics />);
    expect(vibrate).not.toHaveBeenCalled();

    now = 3_000;
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(vibrate).toHaveBeenCalledTimes(1);
  });

  it("never buzzes without the haptics prop", () => {
    const vibrate = stubVibrate();
    let now = 1_000;
    const clock: ServerClock = { now: () => now };
    renderTimer(<Timer deadline={4_000} clock={clock} />);
    now = 2_000;
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(vibrate).not.toHaveBeenCalled();
  });
});

describe("Timer ring", () => {
  it("without startedAt, there is no progress circle", () => {
    const { container } = renderTimer(
      <Timer deadline={10_000} clock={clockAt(0)} />,
    );
    expect(container.querySelectorAll("path")).toHaveLength(1);
  });

  it("draws a draining progress circle with a duration and negative delay", () => {
    const { container } = renderTimer(
      <Timer deadline={10_000} clock={clockAt(3_000)} startedAt={0} />,
    );
    const paths = container.querySelectorAll("path");
    expect(paths).toHaveLength(2);
    const progress = paths[1];
    expect(progress?.classList.contains("opg-ring-drain")).toBe(true);
    expect(progress?.getAttribute("stroke-dasharray")).toBe("100");
    expect(progress?.getAttribute("pathLength")).toBe("100");
    const inlineStyle = progress?.getAttribute("style") ?? "";
    expect(inlineStyle).toContain("animation-duration: 10000ms");
    expect(inlineStyle).toContain("animation-delay: -3000ms");
  });
});
