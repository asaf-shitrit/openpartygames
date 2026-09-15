// Animates standings rows sliding from their previous rank to their new one.
// Measures layout px (`offsetTop`), which stays correct under the scaled Stage.
import { useLayoutEffect, useRef } from "react";
import { useReducedMotion } from "../reduced-motion";
import { flipOffsets } from "./flip";
import type { RowBox } from "./flip";

const DEFAULT_DURATION_MS = 400;
const FLIP_EASING = "ease-out";

export interface UseFlipListOptions {
  durationMs?: number;
}

export interface UseFlipList {
  register: (id: string) => (el: HTMLElement | null) => void;
}

function measure(elements: Map<string, HTMLElement>): RowBox[] {
  return Array.from(elements, ([id, el]) => ({ id, top: el.offsetTop }));
}

function playFlips(
  elements: Map<string, HTMLElement>,
  offsets: Array<{ id: string; dy: number }>,
  durationMs: number,
): void {
  for (const offset of offsets) {
    const el = elements.get(offset.id);
    if (el === undefined || !("animate" in el)) continue;
    el.animate(
      [{ translate: `0 ${offset.dy}px` }, { translate: "0 0" }],
      { duration: durationMs, easing: FLIP_EASING },
    );
  }
}

interface FlipSnapshot {
  key: string;
  rows: RowBox[];
}

export function useFlipList(
  order: readonly string[],
  options?: UseFlipListOptions,
): UseFlipList {
  const durationMs = options?.durationMs ?? DEFAULT_DURATION_MS;
  const reduced = useReducedMotion();
  const elementsRef = useRef(new Map<string, HTMLElement>());
  const previousRef = useRef<FlipSnapshot | null>(null);
  const orderKey = order.join("|");

  const register = (id: string) => (el: HTMLElement | null) => {
    if (el === null) elementsRef.current.delete(id);
    else elementsRef.current.set(id, el);
  };

  useLayoutEffect(() => {
    const elements = elementsRef.current;
    const before = previousRef.current;
    const after = measure(elements);
    previousRef.current = { key: orderKey, rows: after };
    if (before === null || reduced) return;
    const offsets = flipOffsets(before.rows, after);
    playFlips(elements, offsets, durationMs);
  }, [orderKey, reduced, durationMs]);

  return { register };
}
