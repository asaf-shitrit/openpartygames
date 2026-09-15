import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useFullscreen, useScreenWakeLock } from "./screen";

type PropertyOwner = Document | HTMLElement | Navigator;

const fullscreenEnabledDescriptor = Object.getOwnPropertyDescriptor(
  document,
  "fullscreenEnabled",
);
const fullscreenElementDescriptor = Object.getOwnPropertyDescriptor(
  document,
  "fullscreenElement",
);
const exitFullscreenDescriptor = Object.getOwnPropertyDescriptor(
  document,
  "exitFullscreen",
);
const requestFullscreenDescriptor = Object.getOwnPropertyDescriptor(
  document.documentElement,
  "requestFullscreen",
);
const wakeLockDescriptor = Object.getOwnPropertyDescriptor(
  navigator,
  "wakeLock",
);

function defineValue(
  target: PropertyOwner,
  key: string,
  value: PropertyDescriptor["value"],
): void {
  Object.defineProperty(target, key, { configurable: true, value });
}

function restoreValue(
  target: PropertyOwner,
  key: string,
  descriptor: PropertyDescriptor | undefined,
): void {
  if (descriptor === undefined) {
    Reflect.deleteProperty(target, key);
    return;
  }
  Object.defineProperty(target, key, descriptor);
}

function restoreBrowserApis(): void {
  restoreValue(document, "fullscreenEnabled", fullscreenEnabledDescriptor);
  restoreValue(document, "fullscreenElement", fullscreenElementDescriptor);
  restoreValue(document, "exitFullscreen", exitFullscreenDescriptor);
  restoreValue(
    document.documentElement,
    "requestFullscreen",
    requestFullscreenDescriptor,
  );
  restoreValue(navigator, "wakeLock", wakeLockDescriptor);
}

function fullscreenElement(): HTMLElement {
  return document.createElement("div");
}

class FakeWakeLockSentinel {
  released = false;
  release = vi.fn<() => Promise<void>>(() => {
    this.released = true;
    return Promise.resolve();
  });
}

function stubWakeLock(request: () => Promise<FakeWakeLockSentinel>): void {
  defineValue(navigator, "wakeLock", { request });
}

let resolveSentinel: (sentinel: FakeWakeLockSentinel) => void = () => {};

function pendingSentinel(): Promise<FakeWakeLockSentinel> {
  return new Promise<FakeWakeLockSentinel>((resolve) => {
    resolveSentinel = resolve;
  });
}

beforeEach(() => {
  defineValue(document, "fullscreenElement", null);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  restoreBrowserApis();
});

describe("useFullscreen", () => {
  it("reports unsupported when the browser has no fullscreen API", () => {
    defineValue(document, "fullscreenEnabled", false);
    const { result } = renderHook(() => useFullscreen());
    expect(result.current.supported).toBe(false);
  });

  it("requests full screen on the document element", () => {
    defineValue(document, "fullscreenEnabled", true);
    const request = vi.fn<() => Promise<void>>(() => Promise.resolve());
    defineValue(document.documentElement, "requestFullscreen", request);
    const { result } = renderHook(() => useFullscreen());
    expect(result.current.supported).toBe(true);
    act(() => result.current.enter());
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("swallows a rejected request", () => {
    defineValue(document, "fullscreenEnabled", true);
    defineValue(
      document.documentElement,
      "requestFullscreen",
      vi.fn<() => Promise<void>>(() => Promise.reject(new Error("refused"))),
    );
    const { result } = renderHook(() => useFullscreen());
    expect(() => result.current.enter()).not.toThrow();
  });

  it("flips active on fullscreenchange", () => {
    const { result } = renderHook(() => useFullscreen());
    expect(result.current.active).toBe(false);
    act(() => {
      defineValue(document, "fullscreenElement", fullscreenElement());
      document.dispatchEvent(new Event("fullscreenchange"));
    });
    expect(result.current.active).toBe(true);
  });

  it("exits only when something is full screen", () => {
    const exit = vi.fn<() => Promise<void>>(() => Promise.resolve());
    defineValue(document, "exitFullscreen", exit);
    const { result } = renderHook(() => useFullscreen());
    act(() => result.current.exit());
    expect(exit).not.toHaveBeenCalled();
    act(() => {
      defineValue(document, "fullscreenElement", fullscreenElement());
      document.dispatchEvent(new Event("fullscreenchange"));
    });
    act(() => result.current.exit());
    expect(exit).toHaveBeenCalledTimes(1);
  });

  it("removes the fullscreenchange listener on unmount", () => {
    const remove = vi.spyOn(document, "removeEventListener");
    const { unmount } = renderHook(() => useFullscreen());
    unmount();
    expect(remove).toHaveBeenCalledWith(
      "fullscreenchange",
      expect.any(Function),
    );
  });
});

describe("useScreenWakeLock", () => {
  it("requests a screen wake lock when active", async () => {
    const request = vi.fn<() => Promise<FakeWakeLockSentinel>>(() =>
      Promise.resolve(new FakeWakeLockSentinel()),
    );
    stubWakeLock(request);
    renderHook(() => useScreenWakeLock(true));
    await act(async () => {});
    expect(request).toHaveBeenCalledWith("screen");
  });

  it("does nothing when inactive", () => {
    const request = vi.fn<() => Promise<FakeWakeLockSentinel>>(() =>
      Promise.resolve(new FakeWakeLockSentinel()),
    );
    stubWakeLock(request);
    renderHook(() => useScreenWakeLock(false));
    expect(request).not.toHaveBeenCalled();
  });

  it("does nothing when the wake lock API is missing", () => {
    renderHook(() => useScreenWakeLock(true));
    expect("wakeLock" in navigator).toBe(false);
  });

  it("re-requests on visibility change after the sentinel was released", async () => {
    const first = new FakeWakeLockSentinel();
    const second = new FakeWakeLockSentinel();
    const request = vi
      .fn<() => Promise<FakeWakeLockSentinel>>(() => Promise.resolve(first))
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second);
    stubWakeLock(request);
    renderHook(() => useScreenWakeLock(true));
    await act(async () => {});
    first.released = true;
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("does not re-request while the lock is still held", async () => {
    const sentinel = new FakeWakeLockSentinel();
    const request = vi.fn<() => Promise<FakeWakeLockSentinel>>(() =>
      Promise.resolve(sentinel),
    );
    stubWakeLock(request);
    renderHook(() => useScreenWakeLock(true));
    await act(async () => {});
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("releases the sentinel on unmount", async () => {
    const sentinel = new FakeWakeLockSentinel();
    stubWakeLock(
      vi.fn<() => Promise<FakeWakeLockSentinel>>(() =>
        Promise.resolve(sentinel),
      ),
    );
    const { unmount } = renderHook(() => useScreenWakeLock(true));
    await act(async () => {});
    unmount();
    expect(sentinel.release).toHaveBeenCalledTimes(1);
  });

  it("releases a late-resolving sentinel after unmount", async () => {
    const pending = pendingSentinel();
    stubWakeLock(vi.fn<() => Promise<FakeWakeLockSentinel>>(() => pending));
    const { unmount } = renderHook(() => useScreenWakeLock(true));
    unmount();
    const sentinel = new FakeWakeLockSentinel();
    resolveSentinel(sentinel);
    await act(async () => {
      await pending;
    });
    expect(sentinel.release).toHaveBeenCalledTimes(1);
  });

  it("swallows a rejected request", async () => {
    const request = vi.fn<() => Promise<never>>(() =>
      Promise.reject(new Error("denied")),
    );
    stubWakeLock(request);
    renderHook(() => useScreenWakeLock(true));
    await act(async () => {});
    expect(request).toHaveBeenCalledTimes(1);
  });
});
