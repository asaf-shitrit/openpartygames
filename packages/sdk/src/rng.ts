// Seeded, fully serializable RNG (mulberry32). Games are deterministic: every random
// decision must come from here so a room snapshot can be resumed mid-game after a deploy.

import type { Rng } from "./types";

export interface SeededRng extends Rng {
  /** The full internal state as one JSON-safe number; pass it to restoreRng to continue. */
  state(): number;
}

const UINT32 = 4294967296;

/** Reads an in-range element with full typing; callers guarantee the index is valid. */
function elementAt<T>(items: readonly T[], index: number): T {
  if (index < 0 || index >= items.length) {
    throw new Error(`rng index ${index} out of range`);
  }
  const value = items[index];
  if (value === undefined) {
    throw new Error(`rng index ${index} holds no value`);
  }
  return value;
}

export function createRng(seed: number): SeededRng {
  let a = seed | 0;

  const next = (): number => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / UINT32;
  };

  return {
    next,
    int(maxExclusive: number): number {
      return Math.floor(next() * maxExclusive);
    },
    shuffle<T>(items: readonly T[]): T[] {
      const out = items.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        const swap = elementAt(out, i);
        out[i] = elementAt(out, j);
        out[j] = swap;
      }
      return out;
    },
    pick<T>(items: readonly T[]): T {
      if (items.length === 0)
        throw new Error("rng.pick called with an empty array");
      return elementAt(items, Math.floor(next() * items.length));
    },
    state(): number {
      return a >>> 0;
    },
  };
}

/** Continues the exact sequence that produced the given state. */
export function restoreRng(state: number): SeededRng {
  return createRng(state);
}
