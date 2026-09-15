import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { Beat } from "./timeline";
import { advancedMoment, reached, useMoment } from "./useMoment";

const BEATS: readonly Beat[] = [
  { id: "a", atMs: 1000 },
  { id: "b", atMs: 2000 },
  { id: "c", atMs: 3000 },
];

let now = 0;
const clock = { now: () => now };

beforeEach(() => {
  vi.useFakeTimers();
  now = 1000;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("useMoment", () => {
  it("mounts before the first beat with no current beat", () => {
    const { result } = renderHook(() => useMoment(BEATS, 1000, clock));
    expect(result.current).toEqual({
      index: -1,
      beatId: null,
      elapsedMs: 0,
      live: false,
    });
    expect(vi.getTimerCount()).toBe(1);
  });

  it("mounts at a beat and treats it as live", () => {
    now = 1500;
    const { result } = renderHook(() => useMoment(BEATS, 500, clock));
    expect(result.current.index).toBe(0);
    expect(result.current.beatId).toBe("a");
    expect(result.current.elapsedMs).toBe(1000);
    expect(result.current.live).toBe(true);
  });

  it("mounts long after a beat and marks it not live", () => {
    now = 5000;
    const { result } = renderHook(() => useMoment(BEATS, 1000, clock));
    expect(result.current.index).toBe(2);
    expect(result.current.live).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("advances through beats with live true", () => {
    const { result } = renderHook(() => useMoment(BEATS, 1000, clock));
    act(() => {
      now = 2001;
      vi.advanceTimersByTime(1001);
    });
    expect(result.current.index).toBe(0);
    expect(result.current.beatId).toBe("a");
    expect(result.current.live).toBe(true);

    act(() => {
      now = 3001;
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.index).toBe(1);
    expect(result.current.beatId).toBe("b");
    expect(result.current.live).toBe(true);

    act(() => {
      now = 4001;
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.index).toBe(2);
    expect(result.current.beatId).toBe("c");
    expect(result.current.live).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("schedules no timers without an anchor", () => {
    const { result } = renderHook(() => useMoment(BEATS, null, clock));
    expect(result.current.index).toBe(-1);
    expect(result.current.live).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("recomputes when startedAt changes", () => {
    const { result, rerender } = renderHook(
      ({ startedAt }: { startedAt: number }) =>
        useMoment(BEATS, startedAt, clock),
      { initialProps: { startedAt: 1000 } },
    );
    act(() => {
      now = 3100;
    });
    rerender({ startedAt: 3000 });
    expect(result.current.index).toBe(-1);
    expect(result.current.live).toBe(false);
    expect(vi.getTimerCount()).toBe(1);
  });

  it("does not reschedule for a rebuilt beats array with the same content", () => {
    const clear = vi.spyOn(window, "clearTimeout");
    const { rerender } = renderHook(
      ({ beats }: { beats: readonly Beat[] }) => useMoment(beats, 1000, clock),
      { initialProps: { beats: [...BEATS] } },
    );
    rerender({ beats: [...BEATS] });
    expect(clear).not.toHaveBeenCalled();
  });

  it("clears the timer on unmount", () => {
    const { unmount } = renderHook(() => useMoment(BEATS, 1000, clock));
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("reached", () => {
  const moment = { index: 1, beatId: "b", elapsedMs: 1200, live: true };

  it("is true for a beat already passed", () => {
    expect(reached(moment, BEATS, "a")).toBe(true);
    expect(reached(moment, BEATS, "b")).toBe(true);
  });

  it("is false for a beat ahead", () => {
    expect(reached(moment, BEATS, "c")).toBe(false);
  });

  it("is false for an unknown beat", () => {
    expect(reached(moment, BEATS, "nope")).toBe(false);
  });
});

describe("useMoment with a clock that stands still", () => {
  it("keeps a timer scheduled while paused and advances once the clock moves", () => {
    now = 1000;
    const { result } = renderHook(() => useMoment(BEATS, 1000, clock));
    expect(result.current.index).toBe(-1);

    // The timer fires but the (paused) clock has not moved: still before the first beat.
    act(() => {
      vi.advanceTimersByTime(1001);
    });
    expect(result.current.index).toBe(-1);
    expect(vi.getTimerCount()).toBe(1);

    // The clock resumes: the next timer picks the beat up, live.
    now = 2100;
    act(() => {
      vi.advanceTimersByTime(1001);
    });
    expect(result.current.beatId).toBe("a");
    expect(result.current.live).toBe(true);
  });
});

describe("advancedMoment", () => {
  const settled = { index: 1, beatId: "b", elapsedMs: 2500, live: false };

  it("keeps the previous live flag when no beat was crossed", () => {
    const entered = { index: 1, beatId: "b", elapsedMs: 2600, live: true };
    expect(advancedMoment(settled, entered)).toEqual({ ...entered, live: false });
  });

  it("marks a newly crossed beat live", () => {
    const entered = { index: 2, beatId: "c", elapsedMs: 3001, live: true };
    expect(advancedMoment(settled, entered)).toBe(entered);
  });

  it("uses the entered moment when there is no previous one", () => {
    const entered = { index: 0, beatId: "a", elapsedMs: 1001, live: true };
    expect(advancedMoment(null, entered)).toBe(entered);
  });
});
