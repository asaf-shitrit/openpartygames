import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { Timer } from "./Timer";
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
