// Schedules one timer per beat boundary and exposes the current beat. Never renders per frame.
import { useEffect, useRef, useState } from "react";
import type { ServerClock } from "../game-ui";
import type { Beat } from "./timeline";
import {
  beatIndexAt,
  beatIndexOf,
  isFreshEntry,
  msUntilNextBeat,
} from "./timeline";

export interface Moment {
  /** Current beat index (-1 before the first beat). */
  index: number;
  beatId: string | null;
  /** Elapsed ms at the last update (not per frame). */
  elapsedMs: number;
  /** True when the current beat was entered while mounted, or within CUE_GRACE_MS of mounting. False when mounting into an old beat, e.g. a reconnect. */
  live: boolean;
}

interface Snapshot {
  key: string;
  moment: Moment;
}

const BEFORE_FIRST: Moment = {
  index: -1,
  beatId: null,
  elapsedMs: 0,
  live: false,
};

/** Callers rebuild the beats array every render, so effects key on content, not identity. */
function beatsKey(beats: readonly Beat[]): string {
  return beats.map((beat) => `${beat.id}@${beat.atMs}`).join("|");
}

function idAt(beats: readonly Beat[], index: number): string | null {
  return beats[index]?.id ?? null;
}

/** Moment for a mount: live only when the current beat is still inside the grace window. */
function mountMoment(
  beats: readonly Beat[],
  startedAt: number,
  now: number,
): Moment {
  const elapsedMs = now - startedAt;
  const index = beatIndexAt(beats, elapsedMs);
  const beat = index < 0 ? undefined : beats[index];
  return {
    index,
    beatId: beat?.id ?? null,
    elapsedMs,
    live: beat !== undefined && isFreshEntry(beat, elapsedMs),
  };
}

/** Moment after a scheduled boundary fires: that beat was entered while mounted, so live. */
function enteredMoment(
  beats: readonly Beat[],
  startedAt: number,
  now: number,
): Moment {
  const elapsedMs = now - startedAt;
  const index = beatIndexAt(beats, elapsedMs);
  return { index, beatId: idAt(beats, index), elapsedMs, live: true };
}

/**
 * The moment after a timer fires. When no beat was crossed (the clock paused, or the timer ran
 * a little early), the beat keeps its previous `live` flag: nothing new was entered.
 */
export function advancedMoment(
  previous: Moment | null,
  entered: Moment,
): Moment {
  if (previous === null || previous.index !== entered.index) return entered;
  return { ...entered, live: previous.live };
}

function initialMoment(
  beats: readonly Beat[],
  startedAt: number | null,
  now: number,
): Moment {
  if (startedAt === null) return BEFORE_FIRST;
  return mountMoment(beats, startedAt, now);
}

export function useMoment(
  beats: readonly Beat[],
  startedAt: number | null,
  clock: ServerClock,
): Moment {
  const key = `${startedAt ?? "none"}|${beatsKey(beats)}`;
  const beatsRef = useRef(beats);
  const clockRef = useRef(clock);
  const [snapshot, setSnapshot] = useState<Snapshot>(() => ({
    key,
    moment: initialMoment(beats, startedAt, clock.now()),
  }));

  useEffect(() => {
    beatsRef.current = beats;
    clockRef.current = clock;
  });

  // Freshly derived when startedAt or the beats change, stored otherwise.
  const moment =
    snapshot.key === key
      ? snapshot.moment
      : initialMoment(beats, startedAt, clock.now());

  useEffect(() => {
    if (startedAt === null) return undefined;
    const delay = msUntilNextBeat(beatsRef.current, moment.elapsedMs);
    if (delay === null) return undefined;
    const id = window.setTimeout(() => {
      const entered = enteredMoment(
        beatsRef.current,
        startedAt,
        clockRef.current.now(),
      );
      // Always a new object, so the next timer gets scheduled even when the clock stood still.
      setSnapshot((previous) => ({
        key,
        moment: advancedMoment(
          previous.key === key ? previous.moment : null,
          entered,
        ),
      }));
    }, delay + 1);
    return () => window.clearTimeout(id);
  }, [key, moment, startedAt]);

  return moment;
}

/** True once the moment has reached (or passed) the beat with this id. */
export function reached(
  moment: Moment,
  beats: readonly Beat[],
  id: string,
): boolean {
  const index = beatIndexOf(beats, id);
  return index >= 0 && moment.index >= index;
}
