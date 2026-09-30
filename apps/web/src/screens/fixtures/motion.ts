// Reduced-motion and WAAPI seams for screen tests: flip the OS preference, record every
// animation a screen starts, and read back which CSS properties those animations touched.
import { vi } from "vitest";

const matchMediaDescriptor = Object.getOwnPropertyDescriptor(
  window,
  "matchMedia",
);

/** Answers `(prefers-reduced-motion: reduce)` (and every other query) with `matches`. */
export function stubReducedMotion(matches: boolean): void {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (media: string) => ({
      media,
      matches,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }),
  });
}

/** Puts `window.matchMedia` back the way it was before the test. */
export function restoreMatchMedia(): void {
  if (matchMediaDescriptor === undefined) {
    Reflect.deleteProperty(window, "matchMedia");
  } else {
    Object.defineProperty(window, "matchMedia", matchMediaDescriptor);
  }
}

/** Records every `el.animate()` call; restore with `vi.restoreAllMocks()`. */
export function spyAnimate() {
  return vi
    .spyOn(HTMLElement.prototype, "animate")
    .mockImplementation(() => new Animation());
}

type AnimateSpy = ReturnType<typeof spyAnimate>;

/** Keyframe bookkeeping, not a property anything is animated on. */
const TIMING_KEYS = new Set(["offset", "easing", "composite"]);

function framesOf(
  keyframes: Keyframe[] | PropertyIndexedKeyframes | null,
): object[] {
  if (keyframes === null) return [];
  return Array.isArray(keyframes) ? keyframes : [keyframes];
}

/** Every CSS property any recorded animation moved, in the order first seen. */
export function animatedProperties(spy: AnimateSpy): string[] {
  const properties = new Set<string>();
  for (const [keyframes] of spy.mock.calls) {
    for (const frame of framesOf(keyframes)) {
      for (const key of Object.keys(frame)) {
        if (!TIMING_KEYS.has(key)) properties.add(key);
      }
    }
  }
  return [...properties];
}
