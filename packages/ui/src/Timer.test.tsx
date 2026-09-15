import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { TIMER_URGENT_MS, Timer } from "./Timer";
import type { ServerClock } from "./game-ui";

afterEach(cleanup);

function clockAt(value: number): ServerClock {
  return { now: () => value };
}

function firstChild(container: HTMLElement): HTMLElement {
  const node = container.firstElementChild;
  if (!(node instanceof HTMLElement)) throw new Error("expected an element");
  return node;
}

describe("Timer", () => {
  it("shows dashes and a no-timer label without a deadline", () => {
    render(<Timer deadline={null} clock={clockAt(0)} />);
    expect(screen.getByText("--:--")).toBeTruthy();
    expect(screen.getByRole("timer").getAttribute("aria-label")).toBe(
      "No timer",
    );
  });

  it("counts down in minutes and seconds", () => {
    render(<Timer deadline={65_000} clock={clockAt(5_000)} />);
    expect(screen.getByText("1:00")).toBeTruthy();
    expect(screen.getByRole("timer").getAttribute("aria-label")).toBe(
      "Time left 1:00",
    );
  });

  it("pads seconds and clamps expired timers at zero", () => {
    const { rerender } = render(<Timer deadline={69_000} clock={clockAt(0)} />);
    expect(screen.getByText("1:09")).toBeTruthy();
    rerender(<Timer deadline={1_000} clock={clockAt(60_000)} />);
    expect(screen.getByText("0:00")).toBeTruthy();
  });

  it("uses the small phone styling below 120px", () => {
    const { container } = render(
      <Timer deadline={10_000} clock={clockAt(0)} size={78} />,
    );
    expect(screen.getByText("0:10").style.fontSize).toBe("22px");
    const path = container.querySelector("path");
    expect(path?.getAttribute("stroke-width")).toBe("4");
  });

  it("uses the big TV styling at 120px and above", () => {
    const { container } = render(
      <Timer deadline={10_000} clock={clockAt(0)} size={150} />,
    );
    expect(screen.getByText("0:10").style.fontSize).toBe("48px");
    const path = container.querySelector("path");
    expect(path?.getAttribute("stroke-width")).toBe("3");
    expect(firstChild(container).style.width).toBe("150px");
  });

  it("merges a custom style", () => {
    const { container } = render(
      <Timer deadline={null} clock={clockAt(0)} style={{ marginTop: 8 }} />,
    );
    expect(firstChild(container).style.marginTop).toBe("8px");
  });
});

describe("Timer urgency", () => {
  it("pulses and reddens the ring in the last five seconds", () => {
    const { container } = render(
      <Timer deadline={4_000} clock={clockAt(0)} />,
    );
    const timer = screen.getByRole("timer");
    expect(timer.getAttribute("data-urgent")).toBe("true");
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
    render(<Timer deadline={TIMER_URGENT_MS} clock={clockAt(0)} />);
    expect(screen.getByRole("timer").getAttribute("data-urgent")).toBe(
      "true",
    );
  });

  it("stays calm above the urgent threshold", () => {
    const { container } = render(
      <Timer deadline={TIMER_URGENT_MS + 1_000} clock={clockAt(0)} />,
    );
    const timer = screen.getByRole("timer");
    expect(timer.getAttribute("data-urgent")).toBeNull();
    expect(timer.className).toBe("");
    expect(timer.getAttribute("aria-label")).toBe("Time left 0:06");
    const path = container.querySelector("path");
    expect(path?.getAttribute("stroke")).toBe("#2B2B2B");
    expect(path?.getAttribute("stroke-dasharray")).toBeNull();
  });

  it("does not pulse an already expired timer", () => {
    render(<Timer deadline={1_000} clock={clockAt(60_000)} />);
    const timer = screen.getByRole("timer");
    expect(timer.getAttribute("data-urgent")).toBeNull();
    expect(timer.getAttribute("aria-label")).toBe("Time left 0:00");
  });

  it("thickens the big TV ring by two while urgent", () => {
    const { container } = render(
      <Timer deadline={2_000} clock={clockAt(0)} size={150} />,
    );
    const path = container.querySelector("path");
    expect(path?.getAttribute("stroke-width")).toBe("5");
    expect(path?.getAttribute("stroke-dasharray")).toBe("7 5");
  });
});

describe("Timer ticking", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("re-renders on its interval while the clock advances", () => {
    let now = 0;
    const clock: ServerClock = { now: () => now };
    render(<Timer deadline={2_000} clock={clock} />);
    expect(screen.getByText("0:02")).toBeTruthy();
    now = 1_000;
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(screen.getByText("0:01")).toBeTruthy();
  });

  it("does not schedule an interval without a deadline", () => {
    render(<Timer deadline={null} clock={clockAt(0)} />);
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(screen.getByText("--:--")).toBeTruthy();
  });
});
