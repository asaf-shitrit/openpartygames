import { afterEach, describe, expect, it, vi } from "vitest";
import type { FxPreset, FxSpec } from "./animate";
import { SHAKE_MAX_PX, fxSpec, playFx } from "./animate";

const ALL_PRESETS: FxPreset[] = [
  "slam",
  "shake",
  "shakeSmall",
  "pop",
  "wobble",
  "slideIn",
  "tapeOn",
  "sneakOut",
  "fadeIn",
];

const FADE_IN_FRAMES = [{ opacity: 0 }, { opacity: 1 }];

const animateDescriptor = Object.getOwnPropertyDescriptor(
  Element.prototype,
  "animate",
);
const htmlAnimateDescriptor = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "animate",
);

function restoreAnimate(): void {
  if (animateDescriptor) {
    Object.defineProperty(Element.prototype, "animate", animateDescriptor);
  } else {
    Reflect.deleteProperty(Element.prototype, "animate");
  }
  if (htmlAnimateDescriptor) {
    Object.defineProperty(
      HTMLElement.prototype,
      "animate",
      htmlAnimateDescriptor,
    );
  } else {
    Reflect.deleteProperty(HTMLElement.prototype, "animate");
  }
}

function removeAnimate(): void {
  Reflect.deleteProperty(Element.prototype, "animate");
  Reflect.deleteProperty(HTMLElement.prototype, "animate");
}

/** Normal-motion spec for a preset, for branch-free assertions. */
function normal(preset: FxPreset): FxSpec {
  return fxSpec(preset, false) ?? { keyframes: [], options: {} };
}

function kf(preset: FxPreset, index: number): Keyframe {
  return normal(preset).keyframes[index] ?? {};
}

afterEach(() => {
  vi.restoreAllMocks();
  restoreAnimate();
});

/** Pixel offsets on each axis of a `translate` keyframe ("0 0", "-12px 4px"). */
function translateOffsets(frame: Keyframe): number[] {
  return String(frame.translate ?? "0 0")
    .split(" ")
    .map((part) => Math.abs(Number.parseFloat(part)));
}

function maxTranslatePx(spec: FxSpec): number {
  return Math.max(0, ...spec.keyframes.flatMap(translateOffsets));
}

/** Monotonic opacity runs in one play-through, counting the jump back to the start on a repeat. */
function opacityRuns(spec: FxSpec): number {
  const values = spec.keyframes
    .filter((frame) => frame.opacity !== undefined)
    .map((frame) => Number(frame.opacity));
  const iterations = spec.options.iterations ?? 1;
  const first = values[0];
  const looped = iterations > 1 && first !== undefined ? [...values, first] : values;
  const signs = looped
    .slice(1)
    .map((value, index) => Math.sign(value - (looped[index] ?? value)))
    .filter((sign) => sign !== 0);
  return signs.filter((sign, index) => index === 0 || sign !== signs[index - 1]).length;
}

/**
 * Flashes (a pair of opposing opacity changes) per second, averaged over at least one second,
 * so a single fade out and back in is one flash however quick it is.
 */
function flashesPerSecond(spec: FxSpec): number {
  const iterations = spec.options.iterations ?? 1;
  const durationMs = Number(spec.options.duration ?? 0) * iterations;
  const flashes = Math.floor((opacityRuns(spec) * iterations) / 2);
  return flashes / Math.max(1, durationMs / 1000);
}

describe("fx safety limits (plan 0002 slice 6)", () => {
  it("never shakes further than SHAKE_MAX_PX on either axis", () => {
    expect(SHAKE_MAX_PX).toBe(12);
    expect(maxTranslatePx(normal("shake"))).toBe(SHAKE_MAX_PX);
    expect(maxTranslatePx(normal("shakeSmall"))).toBeLessThanOrEqual(SHAKE_MAX_PX);
  });

  it("keeps the shake frames it has always played", () => {
    expect(normal("shake").keyframes.map((frame) => frame.translate)).toEqual([
      "0 0",
      "12px 0",
      "-12px 4px",
      "9px -3px",
      "-6px 2px",
      "3px -1px",
      "0 0",
    ]);
    expect(normal("shakeSmall").keyframes.map((frame) => frame.translate)).toEqual([
      "0 0",
      "5px 0",
      "-5px 2px",
      "3px -1px",
      "0 0",
    ]);
  });

  it("measures a shake past the limit", () => {
    const wild: FxSpec = { keyframes: [{ translate: "0 0" }, { translate: "-20px 3px" }], options: {} };
    expect(maxTranslatePx(wild)).toBeGreaterThan(SHAKE_MAX_PX);
  });

  it("never flashes faster than 3 Hz, in normal or reduced motion", () => {
    const rates = ALL_PRESETS.flatMap((preset) =>
      [false, true].flatMap((reduced) => {
        const spec = fxSpec(preset, reduced);
        return spec === null ? [] : [{ preset, reduced, hz: flashesPerSecond(spec) }];
      }),
    );
    expect(rates.length).toBeGreaterThan(ALL_PRESETS.length);
    expect(rates.filter((rate) => rate.hz > 3)).toEqual([]);
  });

  it("counts a strobe as a flash rate over 3 Hz", () => {
    const strobe: FxSpec = {
      keyframes: [{ opacity: 1 }, { opacity: 0 }, { opacity: 1 }],
      options: { duration: 200, iterations: 5 },
    };
    expect(flashesPerSecond(strobe)).toBe(5);
    const blink: FxSpec = {
      keyframes: [{ opacity: 0 }, { opacity: 1 }],
      options: { duration: 100, iterations: 10 },
    };
    expect(flashesPerSecond(blink)).toBe(10);
  });

  it("counts a single fade as no flash", () => {
    expect(flashesPerSecond(normal("fadeIn"))).toBe(0);
    expect(opacityRuns(normal("sneakOut"))).toBe(1);
  });
});

describe("fxSpec normal motion", () => {
  it("has a spec for every preset and never keys a transform", () => {
    for (const preset of ALL_PRESETS) {
      const spec = normal(preset);
      expect(spec.keyframes.length).toBeGreaterThan(0);
      for (const frame of spec.keyframes) {
        expect("transform" in frame).toBe(false);
      }
    }
  });

  it("slam slams from over-size down to rest", () => {
    expect(kf("slam", 0).scale).toBe(2.6);
    expect(kf("slam", 0).opacity).toBe(0);
    expect(kf("slam", 1).opacity).toBe(1);
    expect(kf("slam", 1).offset).toBe(0.25);
    expect(kf("slam", 2).scale).toBe(0.92);
    expect(kf("slam", 3).scale).toBe(1.04);
    expect(kf("slam", 4).scale).toBe(1);
    expect(normal("slam").options.duration).toBe(420);
    expect(normal("slam").options.easing).toBe("cubic-bezier(.2,.8,.2,1)");
    expect(normal("slam").options.fill).toBe("both");
  });

  it("shake decays offsets over 380ms", () => {
    expect(normal("shake").options.duration).toBe(380);
    expect(kf("shake", 1).translate).toBe("12px 0");
    expect(kf("shake", 2).translate).toBe("-12px 4px");
    expect(kf("shake", 6).translate).toBe("0 0");
  });

  it("shakeSmall is the quiet version", () => {
    expect(normal("shakeSmall").options.duration).toBe(300);
    expect(kf("shakeSmall", 1).translate).toBe("5px 0");
  });

  it("pop overshoots in 280ms", () => {
    expect(kf("pop", 0).scale).toBe(0);
    expect(kf("pop", 1).scale).toBe(1.15);
    expect(kf("pop", 2).scale).toBe(1);
    expect(normal("pop").options.duration).toBe(280);
  });

  it("wobble repeats three times", () => {
    expect(normal("wobble").options.duration).toBe(500);
    expect(normal("wobble").options.iterations).toBe(3);
    expect(kf("wobble", 1).rotate).toBe("-3deg");
    expect(kf("wobble", 2).rotate).toBe("3deg");
    expect(kf("wobble", 3).rotate).toBe("0deg");
  });

  it("slideIn rises into place", () => {
    expect(kf("slideIn", 0).translate).toBe("0 60px");
    expect(kf("slideIn", 0).opacity).toBe(0);
    expect(normal("slideIn").options.duration).toBe(420);
  });

  it("tapeOn peels on from a tilt", () => {
    expect(kf("tapeOn", 0).rotate).toBe("-8deg");
    expect(kf("tapeOn", 0).scale).toBe(1.3);
    expect(normal("tapeOn").options.duration).toBe(300);
  });

  it("sneakOut hops off to the left and fades", () => {
    expect(kf("sneakOut", 0).translate).toBe("0 0");
    expect(kf("sneakOut", 1).translate).toBe("-60px -22px");
    expect(kf("sneakOut", 5).translate).toBe("-300px 0");
    expect(kf("sneakOut", 5).opacity).toBe(0);
    expect(normal("sneakOut").options.duration).toBe(900);
  });

  it("fadeIn is a short opacity ramp", () => {
    expect(kf("fadeIn", 0).opacity).toBe(0);
    expect(kf("fadeIn", 1).opacity).toBe(1);
    expect(normal("fadeIn").options.duration).toBe(200);
  });
});

describe("fxSpec reduced motion", () => {
  it("turns shakes and wobble into no-ops", () => {
    expect(fxSpec("shake", true)).toBeNull();
    expect(fxSpec("shakeSmall", true)).toBeNull();
    expect(fxSpec("wobble", true)).toBeNull();
  });

  it("replaces movement presets with the short fade", () => {
    expect(fxSpec("slam", true)?.keyframes).toEqual(FADE_IN_FRAMES);
    expect(fxSpec("pop", true)?.keyframes).toEqual(FADE_IN_FRAMES);
    expect(fxSpec("slideIn", true)?.keyframes).toEqual(FADE_IN_FRAMES);
    expect(fxSpec("tapeOn", true)?.keyframes).toEqual(FADE_IN_FRAMES);
    expect(fxSpec("fadeIn", true)?.keyframes).toEqual(FADE_IN_FRAMES);
    expect(fxSpec("slam", true)?.options.duration).toBe(200);
  });

  it("turns sneakOut into a 400ms fade out", () => {
    expect(fxSpec("sneakOut", true)?.keyframes).toEqual([
      { opacity: 1 },
      { opacity: 0 },
    ]);
    expect(fxSpec("sneakOut", true)?.options.duration).toBe(400);
  });

  it("never keys a transform in reduced mode either", () => {
    for (const preset of ALL_PRESETS) {
      for (const frame of fxSpec(preset, true)?.keyframes ?? []) {
        expect("transform" in frame).toBe(false);
      }
    }
  });
});

describe("playFx", () => {
  it("passes the delay to the animation, so a held first frame does not flash", () => {
    const spy = vi.spyOn(Element.prototype, "animate");
    const el = document.createElement("div");
    playFx(el, "slam", false, 200);
    expect(spy.mock.calls[0]?.[1]).toMatchObject({ delay: 200 });
  });

  it("returns null when there is no element", () => {
    expect(playFx(null, "slam", false)).toBeNull();
  });

  it("returns null when animate() is unavailable", () => {
    removeAnimate();
    const el = document.createElement("div");
    expect(playFx(el, "slam", false)).toBeNull();
    restoreAnimate();
  });

  it("plays nothing for a reduced-motion shake", () => {
    const spy = vi.spyOn(HTMLElement.prototype, "animate");
    const el = document.createElement("div");
    expect(playFx(el, "shake", true)).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it("plays the spec on the element", () => {
    const spy = vi.spyOn(HTMLElement.prototype, "animate");
    const el = document.createElement("div");
    const animation = playFx(el, "slam", false);
    expect(animation).not.toBeNull();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]?.[0]).toBe(normal("slam").keyframes);
  });
});
