// Hand-drawn confetti for big wins: stealing the word, the crown (TV, ~160
// particles) and personal wins (phone, ~60 particles). One rAF loop draws a
// seeded burst of doodle scraps, stars and squiggles onto a canvas sized to
// fill the parent. Reduced motion swaps the canvas for the static StickerBurst.
import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";
import { AVATAR_FILLS } from "../Avatar";
import { useReducedMotion } from "../reduced-motion";
import type { ConfettiPainter } from "./confetti-paint";
import { canvasPainter } from "./confetti-paint";
import type { ConfettiBounds, Particle } from "./confetti-physics";
import { CONFETTI_CAP, settled, spawnBurst, stepParticles } from "./confetti-physics";
import { StickerBurst } from "./StickerBurst";

export interface ConfettiOrigin {
  x: number;
  y: number;
}

export interface ConfettiProps {
  /** Fire the burst on mount. False renders nothing (e.g. reconnecting after the moment). */
  live: boolean;
  surface: "tv" | "phone";
  /** Origin as a fraction of the parent box. Default { x: 0.5, y: 0.35 }. */
  origin?: ConfettiOrigin;
  /** Particle count; defaults to the cap for the surface, clamped to the cap. */
  count?: number;
  seed?: number;
  colors?: readonly string[];
  /** Test seam: builds the painter from the canvas. Default uses canvas.getContext("2d"). */
  createPainter?: (canvas: HTMLCanvasElement) => ConfettiPainter | null;
}

const DEFAULT_ORIGIN: ConfettiOrigin = { x: 0.5, y: 0.35 };
const MAX_BACKING_WIDTH = 1920 * 2;
const MAX_BACKING_HEIGHT = 1080 * 2;
const CANVAS_STYLE: CSSProperties = {
  position: "absolute",
  inset: 0,
  pointerEvents: "none",
};

function devicePixelCap(): number {
  return Math.min(window.devicePixelRatio || 1, 2);
}

function defaultColors(): readonly string[] {
  const styles = getComputedStyle(document.documentElement);
  const highlight = styles.getPropertyValue("--opg-highlight").trim();
  const marker = styles.getPropertyValue("--opg-marker").trim();
  return [
    highlight || "#FFE45C",
    marker || "#D7372B",
    ...Object.values(AVATAR_FILLS),
  ];
}

function defaultCreatePainter(canvas: HTMLCanvasElement): ConfettiPainter | null {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  return canvasPainter(ctx, devicePixelCap());
}

function resolveCap(surface: "tv" | "phone"): number {
  return surface === "tv" ? CONFETTI_CAP.tv : CONFETTI_CAP.phone;
}

/** The parent's layout box, or 0x0 when the canvas is detached. */
export function parentLayoutSize(canvas: HTMLCanvasElement): ConfettiBounds {
  const parent = canvas.parentElement;
  if (!parent) return { width: 0, height: 0 };
  return { width: parent.offsetWidth, height: parent.offsetHeight };
}

/** Sizes the canvas backing store from the parent's layout box; returns the logical (CSS px) size. */
export function sizeCanvas(canvas: HTMLCanvasElement): ConfettiBounds {
  const { width, height } = parentLayoutSize(canvas);
  const ratio = devicePixelCap();
  canvas.width = Math.min(width * ratio, MAX_BACKING_WIDTH);
  canvas.height = Math.min(height * ratio, MAX_BACKING_HEIGHT);
  return { width, height };
}

interface LoopOptions {
  painter: ConfettiPainter;
  size: ConfettiBounds;
  particles: Particle[];
}

function hiddenTab(): boolean {
  return document.visibilityState === "hidden";
}

/** One rAF loop: steps, clears and draws until every particle settles. */
function startConfettiLoop({ painter, size, particles: initial }: LoopOptions): () => void {
  let particles = initial;
  let frameId = 0;
  let cancelled = false;
  let last = window.performance.now();

  function tick(now: number): void {
    if (cancelled) return;
    const dt = now - last;
    last = now;
    if (!hiddenTab()) {
      particles = stepParticles(particles, dt, size);
      painter.clear(size.width, size.height);
      for (const particle of particles) painter.drawParticle(particle);
    }
    if (hiddenTab() || !settled(particles, size)) {
      frameId = window.requestAnimationFrame(tick);
    }
  }

  function onVisible(): void {
    last = window.performance.now();
  }

  document.addEventListener("visibilitychange", onVisible);
  frameId = window.requestAnimationFrame(tick);

  return () => {
    cancelled = true;
    window.cancelAnimationFrame(frameId);
    document.removeEventListener("visibilitychange", onVisible);
  };
}

interface LiveProps {
  origin: ConfettiOrigin;
  count: number | undefined;
  seed: number;
  colors: readonly string[] | undefined;
  createPainter: (canvas: HTMLCanvasElement) => ConfettiPainter | null;
  surface: "tv" | "phone";
}

function launchBurst(canvas: HTMLCanvasElement, props: LiveProps): (() => void) | null {
  const painter = props.createPainter(canvas);
  if (!painter) return null;
  const size = sizeCanvas(canvas);
  const cap = resolveCap(props.surface);
  const particles = spawnBurst({
    count: Math.min(props.count ?? cap, cap),
    originX: size.width * props.origin.x,
    originY: size.height * props.origin.y,
    width: size.width,
    height: size.height,
    colors: props.colors ?? defaultColors(),
    seed: props.seed,
  });
  return startConfettiLoop({ painter, size, particles });
}

export function Confetti({
  live,
  surface,
  origin = DEFAULT_ORIGIN,
  count,
  seed = 1,
  colors,
  createPainter = defaultCreatePainter,
}: ConfettiProps) {
  const reduced = useReducedMotion();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [unsupported, setUnsupported] = useState(false);
  const propsRef = useRef<LiveProps>({
    origin,
    count,
    seed,
    colors,
    createPainter,
    surface,
  });
  useEffect(() => {
    propsRef.current = { origin, count, seed, colors, createPainter, surface };
  });

  useEffect(() => {
    if (!live || reduced) return undefined;
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const cleanup = launchBurst(canvas, propsRef.current);
    if (!cleanup) {
      setUnsupported(true);
      return undefined;
    }
    setUnsupported(false);
    return cleanup;
    // propsRef and canvasRef are stable refs; other props are read through
    // propsRef so a tweak never replays the burst mid-flight.
  }, [live, reduced]);

  if (!live) return null;
  if (reduced) return <StickerBurst live count={10} />;
  if (unsupported) return null;

  return <canvas ref={canvasRef} aria-hidden="true" style={CANVAS_STYLE} />;
}
