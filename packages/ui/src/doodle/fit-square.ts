// A square canvas that takes what the screen has left. The drawing grid is the same whatever
// the canvas's CSS size (the pad maps CSS pixels to grid points from the canvas's own rect), so
// shrinking the box on a short phone changes how big the drawing is on screen, nothing else.
import { useEffect, useState } from "react";
import type { RefObject } from "react";

export interface FitSquareInput {
  /** Visible height of the page, px. */
  viewportHeight: number;
  /** Where the canvas starts, from the top of the page, px. */
  top: number;
  /** Height of what is pinned to the bottom edge, px. */
  pinnedHeight: number;
  /** Gap kept between the canvas and the pinned bar, px. */
  gap: number;
  /** Width the canvas may take, px. */
  width: number;
  /** Never smaller than this: below it the page scrolls instead. */
  min: number;
  /** Never bigger than this. */
  max: number;
}

/** The side of the largest square that fits above the pinned bar, within [min, max] and `width`. */
export function fitSquare(input: FitSquareInput): number {
  const room = input.viewportHeight - input.top - input.pinnedHeight - input.gap;
  const side = Math.min(room, input.width, input.max);
  return Math.floor(Math.max(side, Math.min(input.min, input.width)));
}

interface FitSquareOptions {
  min: number;
  max: number;
  gap: number;
}

/**
 * The side for a square whose top edge is `area`'s top edge and whose bottom neighbour is the
 * pinned `bar`. Re-measured when the window resizes and whenever the page's height changes (the
 * header above the canvas grows or shrinks). The canvas's own size cannot feed back: its top
 * edge does not depend on it.
 */
export function useFitSquare(
  area: RefObject<HTMLElement | null>,
  bar: RefObject<HTMLElement | null>,
  options: FitSquareOptions,
): number {
  const { min, max, gap } = options;
  const [side, setSide] = useState(max);
  useEffect(() => {
    const areaEl = area.current;
    const barEl = bar.current;
    if (areaEl === null || barEl === null) return undefined;
    const measure = () => {
      // Hidden (display: none): nothing to measure, and a zero would collapse the canvas.
      if (areaEl.clientWidth === 0) return;
      setSide(
        fitSquare({
          viewportHeight: window.innerHeight,
          top: areaEl.getBoundingClientRect().top + window.scrollY,
          pinnedHeight: barEl.getBoundingClientRect().height,
          gap,
          width: areaEl.clientWidth,
          min,
          max,
        }),
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(document.documentElement);
    observer.observe(barEl);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [area, bar, min, max, gap]);
  return side;
}
