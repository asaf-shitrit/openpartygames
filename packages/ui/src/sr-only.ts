import type { CSSProperties } from "react";

/**
 * Visible to a screen reader, not to the eye. For a visual that carries meaning no markup can
 * convey — a canvas, an icon-only stamp — pair it with `aria-hidden` and put the words here.
 * A `<canvas role="img">` would say the same thing, but a canvas is not an image element and
 * the lint rightly says so.
 */
export const SR_ONLY: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
};
