import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { prefersReducedMotion, useReducedMotion } from "./reduced-motion";

const matchMediaDescriptor = Object.getOwnPropertyDescriptor(
  window,
  "matchMedia",
);

interface FakeQuery {
  matches: boolean;
  listeners: Set<() => void>;
}

function stubMatchMedia(matches: boolean): FakeQuery {
  const fake: FakeQuery = { matches, listeners: new Set() };
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (media: string) => ({
      media,
      get matches() {
        return fake.matches;
      },
      addEventListener: (_type: string, listener: () => void) =>
        fake.listeners.add(listener),
      removeEventListener: (_type: string, listener: () => void) =>
        fake.listeners.delete(listener),
    }),
  });
  return fake;
}

afterEach(() => {
  cleanup();
  if (matchMediaDescriptor) {
    Object.defineProperty(window, "matchMedia", matchMediaDescriptor);
  } else {
    Reflect.deleteProperty(window, "matchMedia");
  }
});

describe("prefersReducedMotion", () => {
  it("reads the media query", () => {
    stubMatchMedia(true);
    expect(prefersReducedMotion()).toBe(true);
  });

  it("is false when matchMedia is missing", () => {
    Reflect.deleteProperty(window, "matchMedia");
    expect(prefersReducedMotion()).toBe(false);
  });
});

describe("useReducedMotion", () => {
  it("follows changes to the preference and stops listening on unmount", () => {
    const fake = stubMatchMedia(false);
    const { result, unmount } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);

    act(() => {
      fake.matches = true;
      for (const listener of fake.listeners) listener();
    });
    expect(result.current).toBe(true);

    unmount();
    expect(fake.listeners.size).toBe(0);
  });

  it("stays false without matchMedia", () => {
    Reflect.deleteProperty(window, "matchMedia");
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
  });
});
