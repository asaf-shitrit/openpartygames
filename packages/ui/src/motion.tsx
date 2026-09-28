// Shared phase-change enter animation.
import type { CSSProperties, ReactNode } from "react";
import { useEffect, useRef } from "react";

export interface PhaseEnterProps {
  /** Changes whenever the phase changes, e.g. `${round}:${phase}`. */
  phaseKey: string;
  children: ReactNode;
  style?: CSSProperties;
}

const FRAME_STYLE: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  flexGrow: 1,
  gap: "inherit",
  minHeight: 0,
};

const EDITABLE_SELECTOR = "input, textarea, [contenteditable='true'], [contenteditable='']";

/** True while the browser's own focus sits in something a player could be mid-typing into. */
function isEditing(): boolean {
  const active = document.activeElement;
  if (active === null) return false;
  return active.matches(EDITABLE_SELECTOR);
}

/**
 * Moves focus to the new phase's own heading, so a keyboard or screen-reader player is not
 * dropped to `<body>` — and left to re-discover where they are — on every phase change. Finds
 * the first real heading `Marker` rendered with a `level` leaves behind; a phase whose screen
 * gives it no heading (not yet migrated, or owned by a different package) is left alone rather
 * than guessed at.
 *
 * Skipped entirely while a player is mid-typing somewhere on the page: the phase that just
 * ended is exactly the moment a phone player might be finishing an answer, and yanking their
 * focus away to announce the next phase would cut them off mid-keystroke.
 */
function focusPhaseHeading(container: HTMLElement | null): void {
  if (container === null) return;
  if (isEditing()) return;
  const heading = container.querySelector<HTMLElement>(
    'h1, h2, h3, h4, h5, h6, [role="heading"]',
  );
  if (heading === null) return;
  if (!heading.hasAttribute("tabindex")) heading.setAttribute("tabindex", "-1");
  heading.focus();
}

/**
 * Replays a short enter animation when phaseKey changes, so players notice a phase change.
 * Changing phaseKey remounts the children, so phase-local state resets.
 *
 * The remount is also why focus needs handling here rather than by the caller: React tears
 * down the whole subtree on a phaseKey change, so whatever had focus inside it is gone and the
 * browser default drops focus to `<body>`. The first mount is deliberately left alone — moving
 * focus the moment a screen first appears would yank it away from wherever the player already
 * was (e.g. the address bar, or a control outside this frame).
 */
export function PhaseEnter({ phaseKey, children, style }: PhaseEnterProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Starts equal to the first phaseKey, so the first effect run sees "no change" and skips —
  // the same "have we seen a previous value" test as elsewhere in the app, expressed without a
  // second ref, which is also what keeps `phaseKey` a real, used dependency of the effect.
  const previousKeyRef = useRef(phaseKey);

  useEffect(() => {
    if (previousKeyRef.current === phaseKey) return;
    previousKeyRef.current = phaseKey;
    focusPhaseHeading(containerRef.current);
  }, [phaseKey]);

  return (
    <div
      key={phaseKey}
      ref={containerRef}
      className="opg-phase-enter"
      style={{ ...FRAME_STYLE, ...style }}
    >
      {children}
    </div>
  );
}
