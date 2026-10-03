import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePinnedBarScrollPadding } from "./pinned-bar";

const OBSERVED: Array<() => void> = [];

beforeEach(() => {
  OBSERVED.length = 0;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        OBSERVED.push(callback);
      }
      observe(): void {}
      disconnect(): void {}
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.style.scrollPaddingBottom = "";
});

function barOfHeight(height: number): { current: HTMLElement } {
  const el = document.createElement("div");
  el.getBoundingClientRect = () => ({ height }) as DOMRect;
  return { current: el };
}

describe("usePinnedBarScrollPadding", () => {
  it("pads the page's scroller by the bar's height and restores it after", () => {
    const { unmount } = renderHook(() => usePinnedBarScrollPadding(true, barOfHeight(90)));
    expect(document.documentElement.style.scrollPaddingBottom).toBe("98px");
    unmount();
    expect(document.documentElement.style.scrollPaddingBottom).toBe("");
  });

  it("follows the bar when it grows", () => {
    const bar = barOfHeight(90);
    renderHook(() => usePinnedBarScrollPadding(true, bar));
    bar.current.getBoundingClientRect = () => ({ height: 200 }) as DOMRect;
    OBSERVED[0]?.();
    expect(document.documentElement.style.scrollPaddingBottom).toBe("208px");
  });

  it("leaves the page alone when the bar is not pinned", () => {
    renderHook(() => usePinnedBarScrollPadding(false, barOfHeight(90)));
    expect(document.documentElement.style.scrollPaddingBottom).toBe("");
  });
});
