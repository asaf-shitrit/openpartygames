// A phone screen whose page scrolls can keep its main action pinned to the bottom edge. Two
// halves: the bar's own style, and the page's scroll padding, so that a row scrolled or focused
// into view lands above the bar and not underneath it.
import { useEffect } from "react";
import type { CSSProperties } from "react";

/** Room the page leaves under scrolled-to elements for the bar; a button plus its padding. */
export const PINNED_BAR_SCROLL_PADDING = "120px";

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

/** While `pinned`, the page's scroller stops short of the bar. */
export function usePinnedBarScrollPadding(pinned: boolean): void {
  useEffect(() => {
    if (!pinned) return undefined;
    const root = document.documentElement;
    const before = root.style.scrollPaddingBottom;
    root.style.scrollPaddingBottom = PINNED_BAR_SCROLL_PADDING;
    return () => {
      root.style.scrollPaddingBottom = before;
    };
  }, [pinned]);
}
