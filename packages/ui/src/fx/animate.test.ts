import { afterEach, describe, expect, it, vi } from "vitest";
import type { FxPreset, FxSpec } from "./animate";
import { fxSpec, playFx } from "./animate";

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
