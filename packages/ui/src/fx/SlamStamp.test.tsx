import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRef } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import type { RefObject } from "react";
import { SLAM_LAND_MS, SlamStamp } from "./SlamStamp";

function shakeTarget(): RefObject<HTMLElement | null> {
  const ref = createRef<HTMLElement>();
  ref.current = document.createElement("div");
  return ref;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("SlamStamp", () => {
  it("renders the stamp copy", () => {
    render(<SlamStamp live>Imposter!</SlamStamp>);
    expect(screen.getByText("Imposter!")).toBeTruthy();
  });

  it("slams live, then shakes the host root on landing", () => {
    const spy = vi.spyOn(Element.prototype, "animate");
    const ref = shakeTarget();
    render(
      <SlamStamp live shakeRef={ref}>
        Imposter!
      </SlamStamp>,
    );
    expect(spy).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(SLAM_LAND_MS);
    });
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy.mock.contexts[1]).toBe(ref.current);
  });

  it("uses the small shake when asked", () => {
    const spy = vi.spyOn(Element.prototype, "animate");
    render(
      <SlamStamp live shake="small" shakeRef={shakeTarget()}>
        Imposter!
      </SlamStamp>,
    );
    act(() => {
      vi.advanceTimersByTime(SLAM_LAND_MS);
    });
    const call = spy.mock.calls[1]?.[0];
    const keyframes = Array.isArray(call) ? call : [];
    expect(keyframes[1]?.translate).toBe("5px 0");
  });

  it("never shakes when shake is none", () => {
    const spy = vi.spyOn(Element.prototype, "animate");
    render(
      <SlamStamp live shake="none" shakeRef={shakeTarget()}>
        Imposter!
      </SlamStamp>,
    );
    expect(spy).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(SLAM_LAND_MS * 2);
    });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("does not animate when not live", () => {
    const spy = vi.spyOn(Element.prototype, "animate");
    render(
      <SlamStamp live={false} shakeRef={shakeTarget()}>
        Imposter!
      </SlamStamp>,
    );
    expect(spy).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(SLAM_LAND_MS * 2);
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it("does not re-slam when live turns true after mount", () => {
    const spy = vi.spyOn(Element.prototype, "animate");
    const { rerender } = render(<SlamStamp live={false}>Imposter!</SlamStamp>);
    rerender(<SlamStamp live>Imposter!</SlamStamp>);
    act(() => {
      vi.advanceTimersByTime(SLAM_LAND_MS * 2);
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it("under reduced motion fades in instead of shaking, and the text is still there", () => {
    const matchMediaDescriptor = Object.getOwnPropertyDescriptor(window, "matchMedia");
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: (media: string) => ({
        media,
        matches: true,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }),
    });
    const spy = vi.spyOn(Element.prototype, "animate");
    render(
      <SlamStamp live shakeRef={shakeTarget()}>
        Imposter!
      </SlamStamp>,
    );
    act(() => {
      vi.advanceTimersByTime(SLAM_LAND_MS * 2);
    });
    // Slam itself fades in once; the shake preset is a no-op under reduced motion.
    expect(spy).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Imposter!")).toBeTruthy();
    if (matchMediaDescriptor === undefined) Reflect.deleteProperty(window, "matchMedia");
    else Object.defineProperty(window, "matchMedia", matchMediaDescriptor);
  });

  it("clears the shake timer on unmount", () => {
    const spy = vi.spyOn(Element.prototype, "animate");
    const { unmount } = render(
      <SlamStamp live shakeRef={shakeTarget()}>
        Imposter!
      </SlamStamp>,
    );
    expect(spy).toHaveBeenCalledTimes(1);
    unmount();
    act(() => {
      vi.advanceTimersByTime(SLAM_LAND_MS * 2);
    });
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
