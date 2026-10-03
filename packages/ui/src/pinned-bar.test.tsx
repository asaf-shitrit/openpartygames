import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PINNED_BAR_SCROLL_PADDING, usePinnedBarScrollPadding } from "./pinned-bar";

afterEach(() => {
  document.documentElement.style.scrollPaddingBottom = "";
});

describe("usePinnedBarScrollPadding", () => {
  it("pads the page's scroller while the bar is pinned and restores it after", () => {
    const { unmount } = renderHook(() => usePinnedBarScrollPadding(true));
    expect(document.documentElement.style.scrollPaddingBottom).toBe(PINNED_BAR_SCROLL_PADDING);
    unmount();
    expect(document.documentElement.style.scrollPaddingBottom).toBe("");
  });

  it("leaves the page alone when the bar is not pinned", () => {
    renderHook(() => usePinnedBarScrollPadding(false));
    expect(document.documentElement.style.scrollPaddingBottom).toBe("");
  });
});
