// The read-only renderer shared by the phone's own drawing view, the TV and the gallery: a
// static paint, or an animated replay anchored on a server-clock start time. A late mount (past
// the replay window, or with reduced motion) renders the finished drawing immediately and fires
// no cues, matching plan/0002-game-feel.md's rule that every settled state is complete on its own.
import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import type { ServerClock } from "../game-ui";
import { useReducedMotion } from "../reduced-motion";
import { SR_ONLY } from "../sr-only";
import type { ClientRectLike } from "./geometry";
import { DOODLE_INKS } from "./inks";
import { paintDoodle } from "./paint";
import type { DoodleCanvasContext, DoodleUpTo } from "./paint";
import { replaySchedule, replayStateAt } from "./replay";
import type { Doodle } from "./types";
import { REPLAY_MS } from "./types";

const MAX_BACKING_RATIO = 2;
const DEFAULT_SIZE = 320;

export interface DoodleReplay {
  /** Epoch ms (server-clock) the replay started. */
  startedAt: number;
  replayMs?: number;
}

export interface DoodleViewProps {
  doodle: Doodle;
  /**
   * What a screen reader says where the drawing is. Required, not optional: a freehand
   * drawing can't be described from its strokes, so if the caller doesn't name it nothing
   * can, and the one element the whole screen is about goes unannounced. Say who drew it
   * ("Ana's drawing"), not what it shows — nobody knows what it shows.
   */
  label: string;
  inks?: readonly string[];
  clock: ServerClock;
  /** Animates the doodle in from `startedAt`. Omit for an immediate, static render. */
  replay?: DoodleReplay;
  size?: number;
  lineWidth?: number;
  rectOf?: (el: Element) => ClientRectLike;
  getContext?: (canvas: HTMLCanvasElement) => DoodleCanvasContext | null;
  style?: CSSProperties;
  className?: string;
}

function defaultRectOf(el: Element): ClientRectLike {
  return el.getBoundingClientRect();
}

function defaultGetContext(canvas: HTMLCanvasElement): DoodleCanvasContext | null {
  return canvas.getContext("2d");
}

function devicePixelCap(): number {
  return Math.min(window.devicePixelRatio || 1, MAX_BACKING_RATIO);
}

function sizeCanvas(
  canvas: HTMLCanvasElement,
  rectOf: (el: Element) => ClientRectLike,
  fallback: number,
): number {
  const rect = rectOf(canvas);
  const ratio = devicePixelCap();
  const width = rect.width || fallback;
  const height = rect.height || fallback;
  canvas.width = Math.max(1, Math.round(width * ratio));
  canvas.height = Math.max(1, Math.round(height * ratio));
  return ratio;
}

/** upTo for a finished drawing: every stroke complete, nothing in progress. */
function finishedUpTo(doodle: Doodle): DoodleUpTo {
  return { complete: doodle.s.length, current: null, fraction: 0 };
}

interface PaintView {
  getContext: (canvas: HTMLCanvasElement) => DoodleCanvasContext | null;
  doodle: Doodle;
  inks: readonly string[];
  lineWidth: number;
}

function paint(canvas: HTMLCanvasElement, view: PaintView, upTo: DoodleUpTo | undefined): void {
  const ctx = view.getContext(canvas);
  if (!ctx) return;
  const ratio = devicePixelCap();
  paintDoodle(ctx, view.doodle, {
    inks: view.inks,
    box: { width: canvas.width, height: canvas.height, lineWidth: view.lineWidth * ratio },
    upTo,
  });
}

export function DoodleView({
  doodle,
  label,
  inks = DOODLE_INKS,
  clock,
  replay,
  size = DEFAULT_SIZE,
  lineWidth = 4,
  rectOf = defaultRectOf,
  getContext = defaultGetContext,
  style,
  className,
}: DoodleViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const view: PaintView = { getContext, doodle, inks, lineWidth };
    sizeCanvas(canvas, rectOf, size);

    const finished = () => paint(canvas, view, finishedUpTo(doodle));

    if (!replay || reduced) {
      finished();
      return undefined;
    }

    const replayMs = replay.replayMs ?? REPLAY_MS;
    const elapsed = clock.now() - replay.startedAt;
    if (elapsed >= replayMs) {
      finished();
      return undefined;
    }

    const schedule = replaySchedule(doodle, replayMs);
    let frameId = 0;
    const tick = () => {
      const now = clock.now() - replay.startedAt;
      if (now >= replayMs) {
        finished();
        return;
      }
      paint(canvas, view, replayStateAt(schedule, now));
      frameId = window.requestAnimationFrame(tick);
    };
    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
  }, [clock, doodle, getContext, inks, lineWidth, rectOf, reduced, replay, size]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !("ResizeObserver" in window)) return undefined;
    const view: PaintView = { getContext, doodle, inks, lineWidth };
    const observer = new ResizeObserver(() => {
      sizeCanvas(canvas, rectOf, size);
      paint(canvas, view, replay ? undefined : finishedUpTo(doodle));
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [doodle, getContext, inks, lineWidth, rectOf, replay, size]);

  return (
    <>
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className={className}
        // Fluid, not fixed: `size` is the size it would like, and the aspect ratio keeps it
        // square when the space is narrower — at 200% text a fixed 220px canvas is 440px wide
        // on a 390px phone. sizeCanvas already re-fits the backing store on resize.
        style={{ width: `min(${size}px, 100%)`, aspectRatio: "1 / 1", height: "auto", ...style }}
      />
      <span style={SR_ONLY}>{label}</span>
    </>
  );
}
