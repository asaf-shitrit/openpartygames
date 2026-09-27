import { describe, expect, it } from "vitest";
import {
  BURST,
  newBudget,
  REFILL_PER_SECOND,
  spend,
  type Budget,
} from "./message-budget";

/** Spends `count` frames back to back at `now`, returning the budget that survives. */
function drain(budget: Budget, count: number, now: number): Budget {
  let current = budget;
  for (let i = 0; i < count; i += 1) current = spend(current, now).budget;
  return current;
}

describe("message budget", () => {
  it("lets a fresh socket send its whole burst", () => {
    let budget = newBudget(0);
    const refused = Array.from({ length: BURST }, () => {
      const result = spend(budget, 0);
      budget = result.budget;
      return result.allowed;
    }).filter((allowed) => !allowed);
    expect(refused).toEqual([]);
  });

  it("refuses the frame after the burst is spent", () => {
    const budget = drain(newBudget(0), BURST, 0);
    expect(spend(budget, 0).allowed).toBe(false);
  });

  it("earns frames back at the refill rate", () => {
    const spent = drain(newBudget(0), BURST, 0);
    // One second later the socket can send REFILL_PER_SECOND frames and no more.
    let budget = spent;
    const allowed = Array.from({ length: REFILL_PER_SECOND }, () => {
      const result = spend(budget, 1000);
      budget = result.budget;
      return result.allowed;
    });
    expect(allowed.every(Boolean)).toBe(true);
    expect(spend(budget, 1000).allowed).toBe(false);
  });

  it("never banks more than the burst, however long the socket idles", () => {
    const spent = drain(newBudget(0), BURST, 0);
    // An hour of silence must not buy an hour's worth of flooding.
    const budget = spend(spent, 3_600_000).budget;
    expect(budget.tokens).toBeCloseTo(BURST - 1);
  });

  it("does not earn frames from a clock that goes backwards", () => {
    const spent = drain(newBudget(10_000), BURST, 10_000);
    expect(spend(spent, 0).allowed).toBe(false);
  });

  it("warns once, then stays quiet while the flood continues", () => {
    let budget = drain(newBudget(0), BURST, 0);
    const first = spend(budget, 0);
    budget = first.budget;
    expect(first.warn).toBe(true);

    const duringFlood = Array.from({ length: 50 }, () => {
      const result = spend(budget, 0);
      budget = result.budget;
      return result.warn;
    });
    expect(duringFlood.filter(Boolean)).toEqual([]);
  });

  it("warns roughly once a second while a flood keeps going", () => {
    // A socket refused now is affordable again in well under a second, so the second warning
    // only exists for a sender that keeps spending the refill as fast as it arrives. That is
    // the flood this guards against, so that is what this walks: two seconds of it, 10ms apart.
    let budget = drain(newBudget(0), BURST, 0);
    const warns = Array.from({ length: 200 }, (_unused, step) => {
      const result = spend(budget, step * 10);
      budget = result.budget;
      return result.warn;
    }).filter(Boolean);

    expect(warns.length).toBeGreaterThanOrEqual(2);
    expect(warns.length).toBeLessThanOrEqual(3);
  });

  it("charges a frame only when it is allowed through", () => {
    const spent = drain(newBudget(0), BURST, 0);
    const refused = spend(spent, 0);
    // A refused frame must not push the bucket further into debt, or a flood would delay the
    // recovery of the very socket it is starving.
    expect(refused.budget.tokens).toBeCloseTo(spent.tokens);
  });
});
