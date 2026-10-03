// A phone screen whose page scrolls can keep its main action pinned to the bottom edge. Two
// halves: the bar's own style, and the page's scroll padding, so that a row scrolled or focused
// into view lands above the bar and not underneath it.
import { useEffect } from "react";
import type { CSSProperties, RefObject } from "react";

/** Breathing room kept between a scrolled-to element and the top of the bar. */
const GAP_PX = 8;

/**
 * Style for the bar. Make it the LAST child of its container: a sticky box is held inside its
 * container, so anything after it would be covered by it once the page is scrolled to the end.
 * The negative margins run the opaque paper strip to the screen edges (PhoneScreen pads 18px
 * at the sides and 28px at the bottom).
 */
export const PINNED_BAR_STYLE: CSSProperties = {
  position: "sticky",
  bottom: 0,
  zIndex: 2,
  background: "var(--opg-paper)",
  margin: "0 -18px -28px",
  padding: "10px 18px 16px",
};

/**
 * While `pinned`, the page's scroller stops short of the bar, by the bar's own height: at 200%
 * text the button wraps and the bar grows, so a fixed number would leave rows underneath it.
 */
export function usePinnedBarScrollPadding(pinned: boolean, bar: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const el = bar.current;
    if (!pinned || el === null) return undefined;
    const root = document.documentElement;
    const before = root.style.scrollPaddingBottom;
    const apply = () => {
      root.style.scrollPaddingBottom = `${el.getBoundingClientRect().height + GAP_PX}px`;
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(el);
    return () => {
      observer.disconnect();
      root.style.scrollPaddingBottom = before;
    };
  }, [pinned, bar]);
}
