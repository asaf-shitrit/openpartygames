import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useServerClock, useSoundSetting } from "./clock";

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("useServerClock", () => {
  it("returns server time corrected for client clock skew", () => {
    const serverNow = Date.now() + 60_000;
    const { result } = renderHook(() => useServerClock(serverNow));
    expect(Math.abs(result.current.now() - serverNow)).toBeLessThan(2_000);
  });

  it("updates the offset when the server stamp changes", () => {
    const { result, rerender } = renderHook(
      ({ serverNow }: { serverNow: number }) => useServerClock(serverNow),
      { initialProps: { serverNow: Date.now() } },
    );
    const serverNow = Date.now() + 300_000;
    rerender({ serverNow });
    expect(Math.abs(result.current.now() - serverNow)).toBeLessThan(2_000);
  });

  it("keeps a stable clock object across renders", () => {
    const { result, rerender } = renderHook(
      ({ serverNow }: { serverNow: number }) => useServerClock(serverNow),
      { initialProps: { serverNow: Date.now() } },
    );
    const first = result.current;
    rerender({ serverNow: Date.now() + 1_000 });
    expect(result.current).toBe(first);
  });
});

describe("useSoundSetting", () => {
  it("defaults to unmuted and turns on", () => {
    const { result } = renderHook(() => useSoundSetting());
    expect(result.current.muted).toBe(false);
    act(() => result.current.toggle());
    expect(result.current.muted).toBe(true);
    expect(localStorage.getItem("opg:muted")).toBe("1");
  });

  it("sets an explicit value and persists it", () => {
    const { result } = renderHook(() => useSoundSetting());
    act(() => result.current.setMuted(true));
    expect(result.current.muted).toBe(true);
    act(() => result.current.setMuted(false));
    expect(result.current.muted).toBe(false);
    expect(localStorage.getItem("opg:muted")).toBe("0");
  });

  it("reads the muted flag from storage", () => {
    localStorage.setItem("opg:muted", "1");
    const { result } = renderHook(() => useSoundSetting());
    expect(result.current.muted).toBe(true);
  });

  it("falls back to unmuted when reading storage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("no storage");
    });
    const { result } = renderHook(() => useSoundSetting());
    expect(result.current.muted).toBe(false);
  });

  it("keeps the in-memory setting when writing storage throws", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("no storage");
    });
    const { result } = renderHook(() => useSoundSetting());
    act(() => result.current.setMuted(true));
    expect(result.current.muted).toBe(true);
  });
});
