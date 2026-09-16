// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import type { Particle } from "./confetti-physics";
import { CONFETTI_CAP } from "./confetti-physics";
import { Confetti, parentLayoutSize, sizeCanvas } from "./Confetti";

const matchMediaDescriptor = Object.getOwnPropertyDescriptor(
  window,
  "matchMedia",
);

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

function makeContainer(width = 400, height = 300): HTMLDivElement {
  const container = document.createElement("div");
  Object.defineProperty(container, "offsetWidth", {
    value: width,
    configurable: true,
  });
  Object.defineProperty(container, "offsetHeight", {
    value: height,
    configurable: true,
  });
  document.body.appendChild(container);
  return container;
}

function stubRaf() {
  let nextId = 1;
  let requestCount = 0;
  const queue = new Map<number, FrameRequestCallback>();
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    requestCount += 1;
    const id = nextId;
    nextId += 1;
    queue.set(id, cb);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    queue.delete(id);
  });
  return {
    flush(now: number): void {
      const callbacks = [...queue.values()];
      queue.clear();
      for (const cb of callbacks) cb(now);
    },
    size: () => queue.size,
    requestCount: () => requestCount,
  };
}

function recordingPainter() {
  const draws: Particle[] = [];
  let clears = 0;
  return {
    painter: {
      clear() {
        clears += 1;
      },
      drawParticle(particle: Particle) {
        draws.push(particle);
      },
    },
    draws,
    get clears() {
      return clears;
    },
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
  if (matchMediaDescriptor) {
    Object.defineProperty(window, "matchMedia", matchMediaDescriptor);
  } else {
    Reflect.deleteProperty(window, "matchMedia");
  }
});

describe("parentLayoutSize / sizeCanvas", () => {
  it("is 0x0 for a detached canvas", () => {
    const canvas = document.createElement("canvas");
    expect(parentLayoutSize(canvas)).toEqual({ width: 0, height: 0 });
  });

  it("reads the parent's layout box for an attached canvas", () => {
    const container = makeContainer(200, 100);
    const canvas = document.createElement("canvas");
    container.appendChild(canvas);
    expect(parentLayoutSize(canvas)).toEqual({ width: 200, height: 100 });
  });

  it("sizes the backing store from the logical size, capped at 1920x1080 x2", () => {
    const container = makeContainer(2000, 1200);
    const canvas = document.createElement("canvas");
    container.appendChild(canvas);
    const size = sizeCanvas(canvas);
    expect(size).toEqual({ width: 2000, height: 1200 });
    expect(canvas.width).toBeLessThanOrEqual(1920 * 2);
    expect(canvas.height).toBeLessThanOrEqual(1080 * 2);
  });
});

describe("Confetti", () => {
  it("draws particles on frames via the injected painter", () => {
    const raf = stubRaf();
    const recorder = recordingPainter();
    const container = makeContainer();
    render(
      <Confetti
        live
        surface="tv"
        count={5}
        createPainter={() => recorder.painter}
      />,
      { container },
    );
    raf.flush(performance.now() + 16);
    expect(recorder.clears).toBeGreaterThan(0);
    expect(recorder.draws.length).toBe(5);
  });

  it("stops scheduling once the burst settles", () => {
    const raf = stubRaf();
    const recorder = recordingPainter();
    const container = makeContainer();
    render(
      <Confetti
        live
        surface="phone"
        count={1}
        createPainter={() => recorder.painter}
      />,
      { container },
    );
    let now = performance.now();
    for (let i = 0; i < 200 && raf.size() > 0; i += 1) {
      now += 1000;
      raf.flush(now);
    }
    expect(raf.size()).toBe(0);
    const drawnAfterSettle = recorder.draws.length;
    raf.flush(now + 1000);
    expect(recorder.draws.length).toBe(drawnAfterSettle);
  });

  it("cancels the loop on unmount", () => {
    const raf = stubRaf();
    const recorder = recordingPainter();
    const container = makeContainer();
    const { unmount } = render(
      <Confetti
        live
        surface="tv"
        count={3}
        createPainter={() => recorder.painter}
      />,
      { container },
    );
    expect(raf.size()).toBe(1);
    unmount();
    expect(raf.size()).toBe(0);
    raf.flush(performance.now() + 16);
    expect(recorder.draws).toHaveLength(0);
  });

  it("renders no canvas when not live", () => {
    const container = makeContainer();
    render(<Confetti live={false} surface="tv" />, { container });
    expect(container.querySelector("canvas")).toBeNull();
  });

  it("schedules nothing when the canvas has no 2D context", () => {
    const raf = stubRaf();
    const container = makeContainer();
    render(<Confetti live surface="tv" />, { container });
    expect(raf.requestCount()).toBe(0);
  });

  it("renders StickerBurst under reduced motion instead of a canvas", () => {
    stubReducedMotion(true);
    const raf = stubRaf();
    const container = makeContainer();
    render(<Confetti live surface="tv" />, { container });
    expect(container.querySelector("canvas")).toBeNull();
    expect(container.querySelectorAll("svg").length).toBe(10);
    expect(raf.requestCount()).toBe(0);
  });

  it("clamps the particle count to the surface cap", () => {
    const raf = stubRaf();
    const recorder = recordingPainter();
    const container = makeContainer();
    render(
      <Confetti
        live
        surface="phone"
        count={9999}
        createPainter={() => recorder.painter}
      />,
      { container },
    );
    raf.flush(performance.now() + 16);
    expect(recorder.draws.length).toBe(CONFETTI_CAP.phone);
  });
});
