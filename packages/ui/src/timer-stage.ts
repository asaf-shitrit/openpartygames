// Pure countdown math for Timer: stage classification, seconds, cadence and ring fraction.

export type TimerStage = "idle" | "calm" | "hurry" | "urgent" | "final" | "done";

const HURRY_MS = 10_000;
const URGENT_MS = 5_000;
const FINAL_MS = 3_000;

/**
 * idle: no deadline. calm: > 10s left. hurry: <= 10s. urgent: <= 5s. final: <= 3s.
 * done: <= 0.
 */
export function timerStage(msLeft: number | null): TimerStage {
  if (msLeft === null) return "idle";
  if (msLeft <= 0) return "done";
  if (msLeft <= FINAL_MS) return "final";
  if (msLeft <= URGENT_MS) return "urgent";
  if (msLeft <= HURRY_MS) return "hurry";
  return "calm";
}

/** Whole seconds shown (ceil), never negative. Null without a deadline. */
export function secondsLeft(deadline: number | null, now: number): number | null {
  if (deadline === null) return null;
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}

/** ms until the displayed whole second changes (so renders align to seconds), min 16. */
export function msUntilNextSecond(deadline: number, now: number): number {
  const left = deadline - now;
  const rem = ((left % 1000) + 1000) % 1000;
  const untilBoundary = rem === 0 ? 1000 : rem;
  return Math.max(16, untilBoundary);
}

/** Fraction of the ring remaining in [0,1], or null without a start time. */
export function ringFraction(
  startedAt: number | null,
  deadline: number | null,
  now: number,
): number | null {
  if (startedAt === null || deadline === null) return null;
  const total = deadline - startedAt;
  if (total <= 0) return 0;
  const left = deadline - now;
  return Math.min(1, Math.max(0, left / total));
}
