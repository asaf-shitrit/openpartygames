import { describe, expect, it } from "vitest";
import { replaySchedule, replayStateAt } from "./replay";
import type { StrokeWindow } from "./replay";
import { REPLAY_MS } from "./types";
import type { Doodle, Stroke } from "./types";

function windowAt(schedule: readonly StrokeWindow[], index: number): StrokeWindow {
  const strokeWindow = schedule[index];
  if (strokeWindow === undefined) throw new Error(`no schedule entry at ${index}`);
  return strokeWindow;
}

function stroke(d: number, g: number): Stroke {
  return { c: 0, d, g, p: [0, 0] };
}

function doodleOf(strokes: Stroke[]): Doodle {
  return { v: 1, s: strokes };
}

describe("replaySchedule", () => {
  it("returns an empty schedule for an empty drawing", () => {
    expect(replaySchedule(doodleOf([]), REPLAY_MS)).toEqual([]);
  });

  it("gives a single stroke the whole replay window", () => {
    const schedule = replaySchedule(doodleOf([stroke(300, 0)]), REPLAY_MS);
    expect(schedule).toEqual([{ start: 0, end: REPLAY_MS }]);
  });

  it("still schedules a drawing that is all gap and no draw", () => {
    const schedule = replaySchedule(doodleOf([stroke(0, 500), stroke(0, 500)]), REPLAY_MS);
    expect(schedule).toHaveLength(2);
    const first = windowAt(schedule, 0);
    const second = windowAt(schedule, 1);
    expect(first.start).toBe(first.end);
    expect(second.start).toBe(second.end);
    expect(first.start).toBeLessThan(second.start);
    expect(second.end).toBeCloseTo(REPLAY_MS, 5);
  });

  it("scales a raw total 200x the replay window down to fit it, preserving ratios", () => {
    const raw = [stroke(3000, 1000), stroke(3000, 1000)]; // 8000ms raw, ~3.6x REPLAY_MS
    const many: Stroke[] = [];
    for (let i = 0; i < 55; i += 1) many.push(stroke(3000, 1000)); // pushes the raw total to ~200x
    const schedule = replaySchedule(doodleOf([...raw, ...many]), REPLAY_MS);
    const last = windowAt(schedule, schedule.length - 1);
    expect(last.end).toBeCloseTo(REPLAY_MS, 5);
    // Ratio preserved: every stroke here has the same d and g, so every window has equal span.
    const first = windowAt(schedule, 0);
    const span = first.end - first.start;
    for (const strokeWindow of schedule) {
      expect(strokeWindow.end - strokeWindow.start).toBeCloseTo(span, 5);
    }
  });
});

describe("replayStateAt", () => {
  it("is empty before anything starts", () => {
    const schedule = replaySchedule(doodleOf([stroke(1000, 0)]), REPLAY_MS);
    expect(replayStateAt(schedule, -1)).toEqual({ complete: 0, current: null, fraction: 0 });
  });

  it("handles an empty schedule", () => {
    expect(replayStateAt([], 500)).toEqual({ complete: 0, current: null, fraction: 0 });
  });

  it("reports the in-progress stroke's fraction mid-draw", () => {
    const schedule = replaySchedule(doodleOf([stroke(2000, 0)]), 2000);
    const state = replayStateAt(schedule, 1000);
    expect(state).toEqual({ complete: 0, current: 0, fraction: 0.5 });
  });

  it("marks a stroke complete once elapsed reaches its end", () => {
    const schedule = replaySchedule(doodleOf([stroke(1000, 0), stroke(1000, 0)]), 2000);
    const state = replayStateAt(schedule, 1500);
    expect(state).toEqual({ complete: 1, current: 1, fraction: 0.5 });
  });

  it("renders finished with no in-progress stroke when mounted past the window", () => {
    const schedule = replaySchedule(doodleOf([stroke(1000, 0), stroke(1000, 0)]), REPLAY_MS);
    const state = replayStateAt(schedule, 4000);
    expect(state).toEqual({ complete: 2, current: null, fraction: 0 });
  });

  it("handles a zero-duration stroke by popping it in instantly", () => {
    const schedule = replaySchedule(doodleOf([stroke(0, 500)]), REPLAY_MS);
    const only = windowAt(schedule, 0);
    const beforeIt = replayStateAt(schedule, only.start - 1);
    const atIt = replayStateAt(schedule, only.end);
    expect(beforeIt.complete).toBe(0);
    expect(atIt.complete).toBe(1);
  });
});
