// Pure beat-timeline math. A moment is a sorted list of beats anchored to a server-clock start
// time, so every device can stage the same reveal without the server sending per-beat messages.
import type { CueId } from "../audio/types";
import type { HapticName } from "../haptics";

export interface Beat {
  id: string;
  atMs: number;
  cue?: CueId;
  haptic?: HapticName;
}

/** Views arrive 50-200ms after a phase starts; a beat entered inside this window still counts as live. */
export const CUE_GRACE_MS = 600;

/** Index of the last beat with atMs <= elapsedMs, or -1 before the first. Beats are sorted by atMs. */
export function beatIndexAt(beats: readonly Beat[], elapsedMs: number): number {
  for (let index = beats.length - 1; index >= 0; index -= 1) {
    const beat = beats[index];
    if (beat !== undefined && beat.atMs <= elapsedMs) return index;
  }
  return -1;
}

/** ms until the next beat starts, or null after the last beat. */
export function msUntilNextBeat(
  beats: readonly Beat[],
  elapsedMs: number,
): number | null {
  for (const beat of beats) {
    if (beat.atMs > elapsedMs) return beat.atMs - elapsedMs;
  }
  return null;
}

/** True when the beat started at most graceMs ago (views arrive 50-200ms after a phase starts). */
export function isFreshEntry(
  beat: Beat,
  elapsedMs: number,
  graceMs: number = CUE_GRACE_MS,
): boolean {
  const since = elapsedMs - beat.atMs;
  return since >= 0 && since <= graceMs;
}

/** Prefers timerStartedAt; falls back to deadline - durationMs; null when both are null. */
export function anchorAt(
  timerStartedAt: number | null,
  deadline: number | null,
  durationMs: number,
): number | null {
  if (timerStartedAt !== null) return timerStartedAt;
  if (deadline !== null) return deadline - durationMs;
  return null;
}

export interface SpacedBeatsOptions {
  prefix: string;
  startMs: number;
  count: number;
  spanMs: number;
  maxStepMs: number;
  cue?: CueId;
}

/** count beats "<prefix>-0".. starting at startMs, step = min(maxStepMs, spanMs / count). Empty for count 0. */
export function spacedBeats(options: SpacedBeatsOptions): Beat[] {
  const { prefix, startMs, count, spanMs, maxStepMs, cue } = options;
  if (count <= 0) return [];
  const step = Math.min(maxStepMs, spanMs / count);
  const beats: Beat[] = [];
  for (let index = 0; index < count; index += 1) {
    const beat: Beat = {
      id: `${prefix}-${index}`,
      atMs: startMs + index * step,
    };
    if (cue !== undefined) beat.cue = cue;
    beats.push(beat);
  }
  return beats;
}

/** Index of a beat id, -1 if absent. */
export function beatIndexOf(beats: readonly Beat[], id: string): number {
  return beats.findIndex((beat) => beat.id === id);
}
