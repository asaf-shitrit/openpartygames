import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { DoodleView } from "./DoodleView";
import type { DoodleCanvasContext } from "./paint";
import { deltaEncode } from "./geometry";
import type { ClientRectLike } from "./geometry";
import type { Doodle } from "./types";

const matchMediaDescriptor = Object.getOwnPropertyDescriptor(window, "matchMedia");

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  if (matchMediaDescriptor) {
    Object.defineProperty(window, "matchMedia", matchMediaDescriptor);
  } else {
    Reflect.deleteProperty(window, "matchMedia");
  }
});

const RECT: ClientRectLike = { left: 0, top: 0, width: 300, height: 300 };

/** Matches reduced-motion.test.tsx's stub: a real object shape, no cast needed. */
function stubMatchMedia(matches: boolean): void {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (media: string) => ({
      media,
      matches,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
}

type Call =
  | { op: "save" | "restore" | "beginPath" | "stroke" | "clearRect" }
  | { op: "moveTo" | "lineTo"; x: number; y: number };

function recordingContext() {
  const calls: Call[] = [];
  const ctx: DoodleCanvasContext = {
    strokeStyle: "",
    lineWidth: 1,
    lineCap: "butt",
    lineJoin: "miter",
    save: () => calls.push({ op: "save" }),
    restore: () => calls.push({ op: "restore" }),
    clearRect: () => calls.push({ op: "clearRect" }),
    beginPath: () => calls.push({ op: "beginPath" }),
    moveTo: (x, y) => calls.push({ op: "moveTo", x, y }),
    lineTo: (x, y) => calls.push({ op: "lineTo", x, y }),
    stroke: () => calls.push({ op: "stroke" }),
  };
  return { getContext: () => ctx, calls };
}

function twoStrokeDoodle(): Doodle {
  return {
    v: 1,
    s: [
      { c: 0, d: 1000, g: 0, p: deltaEncode([[0, 0], [500, 0]]) },
      { c: 1, d: 1000, g: 0, p: deltaEncode([[500, 0], [500, 500]]) },
    ],
  };
}

describe("DoodleView", () => {
  it("names the drawing, so the one element the screen is about is announced", () => {
    const { getContext } = recordingContext();
    render(
      <DoodleView
        doodle={twoStrokeDoodle()}
        label="Ana's drawing"
        clock={{ now: () => 0 }}
        rectOf={() => RECT}
        getContext={getContext}
      />,
    );
    expect(screen.getByText("Ana's drawing")).toBeTruthy();
  });

  it("paints the whole doodle immediately without a replay prop", () => {
    const { getContext, calls } = recordingContext();
    render(
      <DoodleView
        doodle={twoStrokeDoodle()}
        label="Ana's drawing"
        clock={{ now: () => 0 }}
        rectOf={() => RECT}
        getContext={getContext}
      />,
    );
    expect(calls.filter((c) => c.op === "stroke")).toHaveLength(2);
  });

  it("mounted past the replay window renders finished, with no animation frame scheduled", () => {
    const { getContext, calls } = recordingContext();
    const raf = vi.spyOn(window, "requestAnimationFrame");
    render(
      <DoodleView
        doodle={twoStrokeDoodle()}
        label="Ana's drawing"
        clock={{ now: () => 10_000 }}
        replay={{ startedAt: 0 }}
        rectOf={() => RECT}
        getContext={getContext}
      />,
    );
    expect(raf).not.toHaveBeenCalled();
    expect(calls.filter((c) => c.op === "stroke")).toHaveLength(2);
  });

  it("renders the finished doodle immediately under reduced motion, replay prop or not", () => {
    stubMatchMedia(true);
    const { getContext, calls } = recordingContext();
    const raf = vi.spyOn(window, "requestAnimationFrame");
    render(
      <DoodleView
        doodle={twoStrokeDoodle()}
        label="Ana's drawing"
        clock={{ now: () => 0 }}
        replay={{ startedAt: 0 }}
        rectOf={() => RECT}
        getContext={getContext}
      />,
    );
    expect(raf).not.toHaveBeenCalled();
    expect(calls.filter((c) => c.op === "stroke")).toHaveLength(2);
  });

  it("animates in, then holds finished once the replay window elapses", () => {
    let now = 0;
    const clock = { now: () => now };
    const { getContext, calls } = recordingContext();
    let frameCallback: FrameRequestCallback | null = null;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      frameCallback = cb;
      return 1;
    });
    render(
      <DoodleView
        doodle={twoStrokeDoodle()}
        label="Ana's drawing"
        clock={clock}
        replay={{ startedAt: 0, replayMs: 2000 }}
        rectOf={() => RECT}
        getContext={getContext}
      />,
    );
    calls.length = 0;
    now = 2500; // past the 2000ms replay window
    act(() => {
      frameCallback?.(now);
    });
    expect(calls.filter((c) => c.op === "stroke")).toHaveLength(2);
  });
});
