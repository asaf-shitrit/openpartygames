// Web Animations API presets for the Doodle Notebook effect kit.
// Presets animate the individual `translate`/`scale`/`rotate`/`opacity` properties
// (never `transform`), so they compose with the inline `rotate()` on Card/Stamp and
// the `scale()` on Stage. Reduced motion turns big movement into a short fade and
// drops shakes and wobbles entirely; timing is unchanged.
export type FxPreset =
  | "slam"
  | "shake"
  | "shakeSmall"
  | "pop"
  | "wobble"
  | "slideIn"
  | "tapeOn"
  | "sneakOut"
  | "fadeIn";

export interface FxSpec {
  keyframes: Keyframe[];
  options: KeyframeAnimationOptions;
}

const SLAM_EASE = "cubic-bezier(.2,.8,.2,1)";

const SLAM: FxSpec = {
  keyframes: [
    { scale: 2.6, opacity: 0, offset: 0 },
    { scale: 1.35, opacity: 1, offset: 0.25 },
    { scale: 0.92, offset: 0.55 },
    { scale: 1.04, offset: 0.75 },
    { scale: 1, offset: 1 },
  ],
  options: { duration: 420, easing: SLAM_EASE, fill: "both" },
};

const SHAKE: FxSpec = {
  keyframes: [
    { translate: "0 0" },
    { translate: "12px 0" },
    { translate: "-12px 4px" },
    { translate: "9px -3px" },
    { translate: "-6px 2px" },
    { translate: "3px -1px" },
    { translate: "0 0" },
  ],
  options: { duration: 380, easing: "linear" },
};

const SHAKE_SMALL: FxSpec = {
  keyframes: [
    { translate: "0 0" },
    { translate: "5px 0" },
    { translate: "-5px 2px" },
    { translate: "3px -1px" },
    { translate: "0 0" },
  ],
  options: { duration: 300, easing: "linear" },
};

const POP: FxSpec = {
  keyframes: [
    { scale: 0, offset: 0 },
    { scale: 1.15, offset: 0.6 },
    { scale: 1, offset: 1 },
  ],
  options: { duration: 280, easing: "ease-out", fill: "both" },
};

const WOBBLE: FxSpec = {
  keyframes: [
    { rotate: "0deg" },
    { rotate: "-3deg" },
    { rotate: "3deg" },
    { rotate: "0deg" },
  ],
  options: { duration: 500, iterations: 3, easing: "ease-in-out" },
};

const SLIDE_IN: FxSpec = {
  keyframes: [
    { translate: "0 60px", opacity: 0 },
    { translate: "0 0", opacity: 1 },
  ],
  options: { duration: 420, easing: "ease-out", fill: "both" },
};

const TAPE_ON: FxSpec = {
  keyframes: [
    { scale: 1.3, rotate: "-8deg", opacity: 0 },
    { scale: 1, rotate: "0deg", opacity: 1 },
  ],
  options: { duration: 300, easing: "ease-out", fill: "both" },
};

// Not caught: the real imposter hops off the left edge of the stage.
const SNEAK_OUT: FxSpec = {
  keyframes: [
    { translate: "0 0", opacity: 1, offset: 0 },
    { translate: "-60px -22px", opacity: 1, offset: 0.2 },
    { translate: "-120px 0", opacity: 1, offset: 0.4 },
    { translate: "-180px -22px", opacity: 1, offset: 0.6 },
    { translate: "-240px 0", opacity: 1, offset: 0.8 },
    { translate: "-300px 0", opacity: 0, offset: 1 },
  ],
  options: { duration: 900, easing: "ease-in", fill: "both" },
};

const FADE_IN: FxSpec = {
  keyframes: [{ opacity: 0 }, { opacity: 1 }],
  options: { duration: 200, easing: "ease-out", fill: "both" },
};

const PRESETS = {
  slam: SLAM,
  shake: SHAKE,
  shakeSmall: SHAKE_SMALL,
  pop: POP,
  wobble: WOBBLE,
  slideIn: SLIDE_IN,
  tapeOn: TAPE_ON,
  sneakOut: SNEAK_OUT,
  fadeIn: FADE_IN,
} satisfies Record<FxPreset, FxSpec>;

/** Presets that become no-ops under reduced motion; the rest become a short fade. */
const NEUTRAL_ON_REDUCED: ReadonlySet<FxPreset> = new Set([
  "shake",
  "shakeSmall",
  "wobble",
]);

/** Reduced-motion stand-in for an exit: a 400ms opacity fade out. */
const FADE_OUT: FxSpec = {
  keyframes: [{ opacity: 1 }, { opacity: 0 }],
  options: { duration: 400, easing: "ease-in", fill: "both" },
};

/** The keyframes and options for a preset, or null when there is nothing to play. */
export function fxSpec(preset: FxPreset, reduced: boolean): FxSpec | null {
  if (!reduced) return PRESETS[preset];
  if (NEUTRAL_ON_REDUCED.has(preset)) return null;
  if (preset === "sneakOut") return FADE_OUT;
  return FADE_IN;
}

/**
 * Plays the preset on el, optionally after `delayMs`. Presets fill both ways, so a delayed
 * element holds its first frame (usually hidden) instead of flashing in before it animates.
 * Returns null when el is null, lacks animate(), or the spec is null.
 */
export function playFx(
  el: Element | null,
  preset: FxPreset,
  reduced: boolean,
  delayMs = 0,
): Animation | null {
  if (!el) return null;
  if (!("animate" in el)) return null;
  const spec = fxSpec(preset, reduced);
  if (!spec) return null;
  return el.animate(spec.keyframes, { ...spec.options, delay: delayMs });
}
