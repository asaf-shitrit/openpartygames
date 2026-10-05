import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fitSquare, useFitSquare } from "./fit-square";

const BASE = { viewportHeight: 640, top: 300, pinnedHeight: 120, gap: 8, width: 324, min: 140, max: 320 };

describe("fitSquare", () => {
  it("takes the room left above the pinned bar", () => {
    expect(fitSquare(BASE)).toBe(212);
  });

  it("stops at the cap on a tall phone", () => {
    expect(fitSquare({ ...BASE, viewportHeight: 932 })).toBe(320);
  });

  it("stops at the width it is given", () => {
    expect(fitSquare({ ...BASE, viewportHeight: 932, width: 280 })).toBe(280);
  });

  it("never drops below the minimum, so the page scrolls instead", () => {
    expect(fitSquare({ ...BASE, top: 500 })).toBe(140);
  });

  it("never exceeds the width even when the minimum is bigger", () => {
    expect(fitSquare({ ...BASE, top: 500, width: 100 })).toBe(100);
  });
});

interface Box {
  top: number;
  height: number;
  width: number;
}

function elementWith(box: Box): HTMLElement {
  const el = document.createElement("div");
  el.getBoundingClientRect = () => new DOMRect(0, box.top, box.width, box.height);
  Object.defineProperty(el, "clientWidth", { get: () => box.width });
  return el;
}

let remeasure: () => void = () => {};

describe("useFitSquare", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: () => void) {
          remeasure = callback;
        }
        observe(): void {}
        disconnect(): void {}
      },
    );
    vi.stubGlobal("innerHeight", 640);
  });
  afterEach(() => vi.unstubAllGlobals());

  const options = { min: 140, max: 320, gap: 8 };

  it("sizes from the area's top and the bar's height, and again when the page changes", () => {
    const areaBox = { top: 300, height: 0, width: 324 };
    const area = { current: elementWith(areaBox) };
    const bar = { current: elementWith({ top: 520, height: 120, width: 360 }) };
    const { result } = renderHook(() => useFitSquare(area, bar, options));
    expect(result.current).toBe(212);
    areaBox.top = 250;
    act(remeasure);
    expect(result.current).toBe(262);
  });

  it("keeps its last size while the area is hidden", () => {
    const areaBox = { top: 300, height: 0, width: 324 };
    const area = { current: elementWith(areaBox) };
    const bar = { current: elementWith({ top: 520, height: 120, width: 360 }) };
    const { result } = renderHook(() => useFitSquare(area, bar, options));
    areaBox.width = 0;
    act(remeasure);
    expect(result.current).toBe(212);
  });
});
