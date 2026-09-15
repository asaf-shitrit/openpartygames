// Reduced-motion preference for effects driven from JS (WAAPI, canvas, count-ups).
// CSS keyframes are already covered by the media query in styles.css.
import { useEffect, useState } from "react";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function reducedMotionQuery(): MediaQueryList | null {
  if (!("matchMedia" in window)) return null;
  return window.matchMedia(REDUCED_MOTION_QUERY);
}

/** True when the viewer asked the OS for less motion. */
export function prefersReducedMotion(): boolean {
  return reducedMotionQuery()?.matches ?? false;
}

/** Tracks the reduced-motion preference, updating if the viewer changes it mid-game. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(prefersReducedMotion);
  useEffect(() => {
    const query = reducedMotionQuery();
    if (!query) return undefined;
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}
