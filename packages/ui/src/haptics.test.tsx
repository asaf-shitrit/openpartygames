import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import {
  HAPTIC_PATTERNS,
  HEARTBEAT_MS,
  buzz,
  canVibrate,
  pulse,
  useBuzz,
  useHeartbeat,
} from "./haptics";
import type { HeartbeatTempo } from "./haptics";

interface HeartbeatProps {
  tempo: HeartbeatTempo;
}

const vibrateDescriptor = Object.getOwnPropertyDescriptor(navigator, "vibrate");

function stubVibrate(
  pattern: (input: VibratePattern) => boolean,
): ReturnType<typeof vi.fn<(input: VibratePattern) => boolean>> {
  const fn = vi.fn<(input: VibratePattern) => boolean>(pattern);
  Object.defineProperty(navigator, "vibrate", {
    configurable: true,
    value: fn,
  });
  return fn;
}

function restoreVibrate(): void {
  if (vibrateDescriptor === undefined) {
    Reflect.deleteProperty(navigator, "vibrate");
    return;
  }
  Object.defineProperty(navigator, "vibrate", vibrateDescriptor);
}

beforeEach(() => {
  vi.useFakeTimers();
  Reflect.deleteProperty(navigator, "vibrate");
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
  restoreVibrate();
});

describe("buzz", () => {
  it("reports no vibration support without the API", () => {
    expect(canVibrate()).toBe(false);
    expect(buzz("turn")).toBe(false);
  });

  it("fires the named pattern", () => {
    const vibrate = stubVibrate(() => true);
    expect(canVibrate()).toBe(true);
    expect(buzz("turn")).toBe(true);
    expect(vibrate).toHaveBeenCalledWith([...HAPTIC_PATTERNS.turn]);
  });

  it("returns false when the browser throws", () => {
    stubVibrate(() => {
      throw new Error("denied");
    });
    expect(buzz("crown")).toBe(false);
  });
});

describe("pulse", () => {
  it("animates scale, never transform", () => {
    const animate = vi.spyOn(Element.prototype, "animate");
    const el = document.createElement("div");
    pulse(el, false);
    expect(animate).toHaveBeenCalledWith(
      [{ scale: "1" }, { scale: "1.04" }, { scale: "1" }],
      { duration: 260 },
    );
  });

  it("flashes an outline when reduced motion is on", () => {
    const animate = vi.spyOn(Element.prototype, "animate");
    const el = document.createElement("div");
    pulse(el, true);
    expect(animate).toHaveBeenCalledWith(
      [
        { outline: "4px solid var(--opg-marker)" },
        { outline: "4px solid rgba(0, 0, 0, 0)" },
      ],
      { duration: 260 },
    );
  });

  it("is a no-op for null", () => {
    const animate = vi.spyOn(Element.prototype, "animate");
    expect(() => pulse(null, false)).not.toThrow();
    expect(animate).not.toHaveBeenCalled();
  });

  it("is a no-op for an element without animate", () => {
    const animate = vi.spyOn(Element.prototype, "animate");
    const bare = document.createElement("div");
    Object.setPrototypeOf(bare, null);
    expect(() => pulse(bare, false)).not.toThrow();
    expect(animate).not.toHaveBeenCalled();
  });
});

describe("useBuzz", () => {
  it("buzzes and pulses the given element", () => {
    const vibrate = stubVibrate(() => true);
    const animate = vi.spyOn(Element.prototype, "animate");
    const el = document.createElement("div");
    const { result } = renderHook(() => useBuzz());
    act(() => {
      result.current("good", el);
    });
    expect(vibrate).toHaveBeenCalledWith([...HAPTIC_PATTERNS.good]);
    expect(animate).toHaveBeenCalledTimes(1);
  });

  it("buzzes without an element", () => {
    const vibrate = stubVibrate(() => true);
    const { result } = renderHook(() => useBuzz());
    act(() => {
      result.current("locked");
    });
    expect(vibrate).toHaveBeenCalledWith([...HAPTIC_PATTERNS.locked]);
  });
});

describe("useHeartbeat", () => {
  it("buzzes on every beat and stops on off", () => {
    const vibrate = stubVibrate(() => true);
    const el = document.createElement("div");
    const ref = { current: el };
    const { rerender } = renderHook(
      ({ tempo }: HeartbeatProps) => useHeartbeat(tempo, ref),
      { initialProps: { tempo: "slow" } },
    );
    expect(vibrate).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(HEARTBEAT_MS.slow);
    });
    expect(vibrate).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(HEARTBEAT_MS.slow);
    });
    expect(vibrate).toHaveBeenCalledTimes(2);

    rerender({ tempo: "off" });
    act(() => {
      vi.advanceTimersByTime(HEARTBEAT_MS.slow * 3);
    });
    expect(vibrate).toHaveBeenCalledTimes(2);
  });

  it("uses the fast interval and stops on unmount", () => {
    const vibrate = stubVibrate(() => true);
    const ref = { current: document.createElement("div") };
    const { unmount } = renderHook(
      ({ tempo }: HeartbeatProps) => useHeartbeat(tempo, ref),
      { initialProps: { tempo: "fast" } },
    );
    act(() => {
      vi.advanceTimersByTime(HEARTBEAT_MS.fast);
    });
    expect(vibrate).toHaveBeenCalledTimes(1);

    unmount();
    act(() => {
      vi.advanceTimersByTime(HEARTBEAT_MS.fast * 3);
    });
    expect(vibrate).toHaveBeenCalledTimes(1);
  });
});
