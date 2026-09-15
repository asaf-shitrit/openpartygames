import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { CountUp } from "./CountUp";

type FrameCallback = (time: number) => void;

function stubRaf() {
  let queue: Array<{ id: number; callback: FrameCallback }> = [];
  let nextId = 1;
  let time = 0;
  vi.stubGlobal(
    "requestAnimationFrame",
    (callback: FrameCallback): number => {
      const id = nextId;
      nextId += 1;
      queue.push({ id, callback });
      return id;
    },
  );
  vi.stubGlobal("cancelAnimationFrame", (id: number): void => {
    queue = queue.filter((entry) => entry.id !== id);
  });
  return {
    flush(ms: number) {
      time += ms;
      const due = queue;
      queue = [];
      for (const entry of due) entry.callback(time);
    },
    pending() {
      return queue.length;
    },
  };
}

const matchMediaDescriptor = Object.getOwnPropertyDescriptor(
  window,
  "matchMedia",
);

function stubReducedMotion(matches: boolean) {
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

beforeEach(() => {
  stubReducedMotion(false);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  if (matchMediaDescriptor) {
    Object.defineProperty(window, "matchMedia", matchMediaDescriptor);
  } else {
    Reflect.deleteProperty(window, "matchMedia");
  }
});

describe("CountUp", () => {
  it("progresses the text and ends exactly on `to`", () => {
    const raf = stubRaf();
    const { container } = render(
      <CountUp from={0} to={1000} durationMs={1000} live />,
    );
    const span = container.querySelector("span");
    expect(span?.textContent).toBe("0");

    act(() => {
      raf.flush(0);
    });
    act(() => {
      raf.flush(500);
    });
    const midway = span?.textContent ?? "";
    expect(midway).not.toBe("0");
    expect(midway).not.toBe("1,000");

    act(() => {
      raf.flush(500);
    });
    expect(span?.textContent).toBe("1,000");
    expect(raf.pending()).toBe(0);
  });

  it("shows `to` immediately when not live", () => {
    const raf = stubRaf();
    const { container } = render(<CountUp from={0} to={1000} live={false} />);
    expect(container.querySelector("span")?.textContent).toBe("1,000");
    expect(raf.pending()).toBe(0);
  });

  it("cancels the animation frame on unmount", () => {
    const raf = stubRaf();
    const { unmount } = render(
      <CountUp from={0} to={1000} durationMs={1000} live />,
    );
    expect(raf.pending()).toBe(1);
    unmount();
    expect(raf.pending()).toBe(0);
  });

  it("jumps straight to `to` under reduced motion", () => {
    stubReducedMotion(true);
    const raf = stubRaf();
    const { container } = render(
      <CountUp from={0} to={1000} durationMs={1000} live />,
    );
    expect(container.querySelector("span")?.textContent).toBe("1,000");
    expect(raf.pending()).toBe(0);
  });

  it("always exposes the final value as the accessible label", () => {
    const raf = stubRaf();
    const { container } = render(
      <CountUp from={0} to={1500} durationMs={1000} live />,
    );
    expect(container.querySelector("span")?.getAttribute("aria-label")).toBe(
      "1,500",
    );
    act(() => {
      raf.flush(0);
    });
    act(() => {
      raf.flush(400);
    });
    expect(container.querySelector("span")?.getAttribute("aria-label")).toBe(
      "1,500",
    );
  });

  it("adds the prefix to the counted value", () => {
    render(<CountUp from={0} to={1000} live={false} prefix="+" />);
    expect(document.querySelector("span")?.textContent).toBe("+1,000");
  });
});
