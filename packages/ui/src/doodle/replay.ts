// Replay timing is a stored *shape*, not a wall clock: replaySchedule sums d + g across strokes
// and scales the total to replayMs, preserving ratios, so a 3-stroke and a 60-stroke drawing both
// take the same replayMs while the rhythm inside them differs (plan/0003-doodle-bluff.md).
import type { Doodle } from "./types";

export interface StrokeWindow {
  /** Scaled ms into the replay when this stroke starts drawing. */
  start: number;
  /** Scaled ms into the replay when this stroke is fully drawn. */
  end: number;
}

export interface ReplayState {
  /** How many strokes are fully drawn. */
  complete: number;
  /** Index of the stroke currently animating in, or null when none is in progress. */
  current: number | null;
  /** 0..1 fraction of the current stroke that should be visible. */
  fraction: number;
}

/** Pure. Stroke start/end times scaled so the whole replay fits replayMs. */
export function replaySchedule(doodle: Doodle, replayMs: number): StrokeWindow[] {
  const total = doodle.s.reduce((sum, stroke) => sum + stroke.d + stroke.g, 0);
  if (total <= 0) return doodle.s.map(() => ({ start: 0, end: 0 }));
  const scale = replayMs / total;
  let cursor = 0;
  return doodle.s.map((stroke) => {
    cursor += stroke.g;
    const start = cursor * scale;
    cursor += stroke.d;
    const end = cursor * scale;
    return { start, end };
  });
}

function fractionWithin(elapsedMs: number, strokeWindow: StrokeWindow): number {
  const span = strokeWindow.end - strokeWindow.start;
  if (span <= 0) return 1;
  const fraction = (elapsedMs - strokeWindow.start) / span;
  if (fraction < 0) return 0;
  if (fraction > 1) return 1;
  return fraction;
}

/** Pure. Which strokes are complete and how far the in-progress one has got; nothing pops. */
export function replayStateAt(
  schedule: readonly StrokeWindow[],
  elapsedMs: number,
): ReplayState {
  let complete = 0;
  for (const [i, strokeWindow] of schedule.entries()) {
    if (elapsedMs >= strokeWindow.end) {
      complete += 1;
      continue;
    }
    if (elapsedMs > strokeWindow.start) {
      return { complete, current: i, fraction: fractionWithin(elapsedMs, strokeWindow) };
    }
    break;
  }
  return { complete, current: null, fraction: 0 };
}
