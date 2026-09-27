// How many socket frames one connection may spend, and how fast it earns more.
//
// Every frame that changes the room costs a Durable Object storage write plus a view broadcast
// to every socket in the room, so one client can multiply its own send rate by the size of the
// party. Nothing capped that: the HTTP routes are rate limited, but once a socket is open its
// frames went straight into the room.
//
// The budget is a plain token bucket, kept pure so it can be reasoned about and tested without
// a clock. The adapter owns the real time.

/** Frames a freshly connected socket may send back to back. */
export const BURST = 60;
/** Frames earned per second once the burst is spent. */
export const REFILL_PER_SECOND = 15;
/** How often a throttled socket is told it is being throttled. */
export const WARN_EVERY_MS = 1000;

export interface Budget {
  /** Frames still affordable, as of `at`. */
  tokens: number;
  /** When `tokens` was last brought up to date. */
  at: number;
  /** When this socket was last told it is over budget; null if it never has been. */
  warnedAt: number | null;
}

export interface Spend {
  /** Whether the frame may be handled. */
  allowed: boolean;
  /** Whether to tell the sender it is being throttled — true at most once per WARN_EVERY_MS. */
  warn: boolean;
  budget: Budget;
}

export function newBudget(now: number): Budget {
  return { tokens: BURST, at: now, warnedAt: null };
}

/** Tokens the bucket holds at `now`, capped at BURST. A clock that goes backwards adds none. */
function refilled(budget: Budget, now: number): number {
  const elapsed = Math.max(0, now - budget.at);
  const earned = (elapsed / 1000) * REFILL_PER_SECOND;
  return Math.min(BURST, budget.tokens + earned);
}

/**
 * Charges one frame against the budget.
 *
 * A refused frame is not silent — the sender is told, but only once per `WARN_EVERY_MS`, so a
 * flood cannot turn into a reply per frame and amplify the thing this exists to prevent.
 */
export function spend(budget: Budget, now: number): Spend {
  const tokens = refilled(budget, now);
  if (tokens < 1) {
    const warn =
      budget.warnedAt === null || now - budget.warnedAt >= WARN_EVERY_MS;
    return {
      allowed: false,
      warn,
      budget: { tokens, at: now, warnedAt: warn ? now : budget.warnedAt },
    };
  }
  return {
    allowed: true,
    warn: false,
    budget: { tokens: tokens - 1, at: now, warnedAt: budget.warnedAt },
  };
}
