import type { ServerClock } from "./game-ui";

/** How many recent clock samples the offset estimate keeps. */
export const CLOCK_SAMPLE_WINDOW = 8;

/** Appends a sample, keeping only the most recent CLOCK_SAMPLE_WINDOW of them. */
export function nextClockSamples(
  samples: readonly number[],
  sample: number,
): number[] {
  const next = [...samples, sample];
  return next.length > CLOCK_SAMPLE_WINDOW
    ? next.slice(next.length - CLOCK_SAMPLE_WINDOW)
    : next;
}

/** Server-minus-client offset estimate. Latency only makes a sample smaller, so the max wins. */
export function clockOffsetFrom(samples: readonly number[]): number {
  return samples.length === 0 ? 0 : Math.max(...samples);
}

/** A clock that reads the offset on every call, so a sample taken after render still applies. */
export function createServerClock(offsetMs: () => number): ServerClock {
  return { now: () => Date.now() + offsetMs() };
}
