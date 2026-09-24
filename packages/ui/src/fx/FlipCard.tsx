// The phone role card: face down until held (or tapped) to reveal the secret side.
// Animates `rotate` on an inner wrapper only, so it never clobbers a parent's transform.
import type { CSSProperties, KeyboardEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "../reduced-motion";
import { PRESSABLE_CLASS } from "../primitives";

const DEFAULT_HOLD_MS = 400;
const FLIP_DURATION_MS = 420;
const CROSSFADE_DURATION_MS = 220;
const MIN_HEIGHT = 300;

export interface FlipCardProps {
  /** Content on the back (shown face down). */
  back: ReactNode;
  /** Secret content revealed when flipped. */
  front: ReactNode;
  /** Controlled flip state. */
  flipped: boolean;
  onFlip: () => void;
  /** Hold duration before a press flips it. Default 400ms. A quick tap also flips. */
  holdMs?: number;
  label: string;
  style?: CSSProperties;
}

const ROOT_STYLE: CSSProperties = {
  position: "relative",
  minHeight: MIN_HEIGHT,
  width: "100%",
  padding: 0,
  border: "none",
  background: "transparent",
  cursor: "pointer",
  perspective: "1200px",
};

const FACE_STYLE: CSSProperties = {
  position: "relative",
  width: "100%",
  minHeight: MIN_HEIGHT,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  // A face holds its own content. The front face is absolutely positioned, so without this
  // anything too tall for the card is drawn over whatever follows it — on the Imposter clue
  // screen that was the word panel's description landing on top of "Hide word" and "I'm done",
  // where it swallowed the taps meant for them.
  overflow: "hidden",
  background: "var(--opg-card)",
  border: "4px solid var(--opg-ink)",
  borderRadius: "var(--opg-radius-l)",
};

interface HoldToFlip {
  pressing: boolean;
  onPointerDown: () => void;
  onPointerUp: () => void;
  onPointerCancel: () => void;
}

function useHoldToFlip(
  flipped: boolean,
  holdMs: number,
  onFlip: () => void,
): HoldToFlip {
  const [pressing, setPressing] = useState(false);
  const timerRef = useRef<number | null>(null);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  const onPointerDown = () => {
    if (flipped) return;
    setPressing(true);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      setPressing(false);
      onFlip();
    }, holdMs);
  };

  const onPointerUp = () => {
    if (flipped) return;
    const heldToCompletion = timerRef.current === null;
    clearTimer();
    setPressing(false);
    if (!heldToCompletion) onFlip();
  };

  const onPointerCancel = () => {
    clearTimer();
    setPressing(false);
  };

  return { pressing, onPointerDown, onPointerUp, onPointerCancel };
}

function useFlipAnimation(flipped: boolean, reduced: boolean) {
  const innerRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<Animation | null>(null);
  const [mountedFlipped] = useState(flipped);

  useEffect(() => {
    const el = innerRef.current;
    // Cancel the finished flip first: its `fill: both` keeps pinning the inner face at
    // 180deg, which hides both faces once `flipped` goes back to false.
    animationRef.current?.cancel();
    animationRef.current = null;
    if (el === null || !flipped || mountedFlipped) return;
    if (reduced) return;
    const animation = el.animate(
      [{ rotate: "y 0deg" }, { rotate: "y 180deg" }],
      {
        duration: FLIP_DURATION_MS,
        easing: "ease-in-out",
        fill: "both",
      },
    );
    // Cancelling an animation rejects its `finished` promise, and nothing waits on it.
    animation.finished.catch(() => undefined);
    animationRef.current = animation;
  }, [flipped, mountedFlipped, reduced]);

  return { innerRef, mountedFlipped };
}

function innerStyle(flipped: boolean, reduced: boolean): CSSProperties {
  if (reduced) return { position: "relative", width: "100%" };
  return {
    position: "relative",
    width: "100%",
    transformStyle: "preserve-3d",
    rotate: flipped ? "y 180deg" : "y 0deg",
  };
}

function facePositionStyle(backFace: boolean): CSSProperties {
  if (backFace) return { position: "relative" };
  return { position: "absolute", inset: 0 };
}

function flippedFaceStyle(backFace: boolean): CSSProperties {
  return {
    ...FACE_STYLE,
    ...facePositionStyle(backFace),
    backfaceVisibility: "hidden",
    rotate: backFace ? undefined : "y 180deg",
  };
}

function crossfadeFaceStyle(
  visible: boolean,
  backFace: boolean,
): CSSProperties {
  return {
    ...FACE_STYLE,
    ...facePositionStyle(backFace),
    opacity: visible ? 1 : 0,
    transition: `opacity ${CROSSFADE_DURATION_MS}ms ease-out`,
  };
}

function faceTransitionStyle(
  reduced: boolean,
  visible: boolean,
  backFace: boolean,
): CSSProperties {
  if (reduced) return crossfadeFaceStyle(visible, backFace);
  return flippedFaceStyle(backFace);
}

function handleKeyDown(
  event: KeyboardEvent<HTMLButtonElement>,
  flipped: boolean,
  onFlip: () => void,
): void {
  if (flipped) return;
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  onFlip();
}

export function FlipCard({
  back,
  front,
  flipped,
  onFlip,
  holdMs = DEFAULT_HOLD_MS,
  label,
  style,
}: FlipCardProps) {
  const reduced = useReducedMotion();
  const hold = useHoldToFlip(flipped, holdMs, onFlip);
  const { innerRef } = useFlipAnimation(flipped, reduced);
  const showFront = flipped;

  return (
    <button
      type="button"
      className={PRESSABLE_CLASS}
      aria-pressed={flipped}
      aria-label={label}
      style={{
        ...ROOT_STYLE,
        scale: hold.pressing ? "0.97" : "1",
        ...style,
      }}
      onPointerDown={hold.onPointerDown}
      onPointerUp={hold.onPointerUp}
      onPointerCancel={hold.onPointerCancel}
      onKeyDown={(event) => handleKeyDown(event, flipped, onFlip)}
    >
      <div ref={innerRef} style={innerStyle(flipped, reduced)}>
        <div style={faceTransitionStyle(reduced, !showFront, true)}>{back}</div>
        <div
          style={faceTransitionStyle(reduced, showFront, false)}
          aria-hidden={!showFront}
          aria-live="polite"
        >
          {showFront ? front : null}
        </div>
      </div>
    </button>
  );
}
