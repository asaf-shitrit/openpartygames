// State and pointer-event handling for DoodlePad, split out so the component itself stays a thin
// render. Geometry and timing stay pure (./geometry, ./capture); this hook is the only place that
// touches refs and DOM events. Ref mutations are routed through plain setters below, not inlined
// in the returned callbacks, so a stroke's fields stay easy to follow one at a time.
import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, RefObject } from "react";
import type { ServerClock } from "../game-ui";
import { finalizeStroke } from "./capture";
import { deltaEncode, gridPointOf } from "./geometry";
import type { ClientRectLike } from "./geometry";
import { paintDoodle } from "./paint";
import type { DoodleCanvasContext } from "./paint";
import type { Doodle, GridPoint, InkIndex, Stroke } from "./types";

const MAX_BACKING_RATIO = 2;
const DEFAULT_LINE_WIDTH = 4;

interface LiveStroke {
  ink: InkIndex;
  points: GridPoint[];
  startedAt: number;
}

interface PointerState {
  strokes: Stroke[];
  live: LiveStroke | null;
  activePointerId: number | null;
  lastEndAt: number | null;
}

function setStrokesField(ref: RefObject<PointerState>, strokes: Stroke[]): void {
  ref.current.strokes = strokes;
}

function setLiveField(ref: RefObject<PointerState>, live: LiveStroke | null): void {
  ref.current.live = live;
}

function setActivePointerField(ref: RefObject<PointerState>, id: number | null): void {
  ref.current.activePointerId = id;
}

function setLastEndField(ref: RefObject<PointerState>, at: number | null): void {
  ref.current.lastEndAt = at;
}

export interface UseDoodlePadOptions {
  clock: ServerClock;
  size: number;
  inks: readonly string[];
  initialDoodle?: Doodle;
  onChange?: (doodle: Doodle) => void;
  rectOf: (el: Element) => ClientRectLike;
  getContext: (canvas: HTMLCanvasElement) => DoodleCanvasContext | null;
}

export interface DoodlePadHandlers {
  onPointerDown: (e: ReactPointerEvent<HTMLCanvasElement>) => void;
  onPointerMove: (e: ReactPointerEvent<HTMLCanvasElement>) => void;
  onPointerUp: (e: ReactPointerEvent<HTMLCanvasElement>) => void;
  onPointerCancel: (e: ReactPointerEvent<HTMLCanvasElement>) => void;
}

export interface UseDoodlePad {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  strokeCount: number;
  selectedInk: InkIndex;
  setSelectedInk: (ink: InkIndex) => void;
  confirmingClear: boolean;
  handlers: DoodlePadHandlers;
  undo: () => void;
  clear: () => void;
  cancelClear: () => void;
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
  canvas.width = Math.max(1, Math.round((rect.width || fallback) * ratio));
  canvas.height = Math.max(1, Math.round((rect.height || fallback) * ratio));
  return ratio;
}

function livePreviewDoodle(strokes: readonly Stroke[], live: LiveStroke | null): Doodle {
  if (!live) return { v: 1, s: [...strokes] };
  const preview: Stroke = { c: live.ink, d: 0, g: 0, p: deltaEncode(live.points) };
  return { v: 1, s: [...strokes, preview] };
}

/** Coalesced native events when the browser supports them, else just this one. */
function coalescedNativeEvents(e: ReactPointerEvent<HTMLCanvasElement>): PointerEvent[] {
  const native = e.nativeEvent;
  if ("getCoalescedEvents" in native) return native.getCoalescedEvents();
  return [native];
}

function paintCanvas(
  canvas: HTMLCanvasElement,
  getContext: (canvas: HTMLCanvasElement) => DoodleCanvasContext | null,
  inks: readonly string[],
  state: PointerState,
): void {
  const ctx = getContext(canvas);
  if (!ctx) return;
  const ratio = devicePixelCap();
  paintDoodle(ctx, livePreviewDoodle(state.strokes, state.live), {
    inks,
    box: { width: canvas.width, height: canvas.height, lineWidth: DEFAULT_LINE_WIDTH * ratio },
  });
}

/** Sizing, repainting and the resize observer, grouped so useDoodlePad stays under the line cap. */
function usePadCanvas(
  stateRef: RefObject<PointerState>,
  options: Pick<UseDoodlePadOptions, "inks" | "rectOf" | "getContext" | "size">,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { inks, rectOf, getContext, size } = options;

  const repaint = useCallback(() => {
    const canvas = canvasRef.current;
    if (canvas) paintCanvas(canvas, getContext, inks, stateRef.current);
  }, [getContext, inks, stateRef]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !("ResizeObserver" in window)) return undefined;
    sizeCanvas(canvas, rectOf, size);
    repaint();
    const observer = new ResizeObserver(() => {
      sizeCanvas(canvas, rectOf, size);
      repaint();
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [rectOf, repaint, size]);

  return { canvasRef, repaint };
}

interface PointerHandlerOptions {
  stateRef: RefObject<PointerState>;
  rectOf: (el: Element) => ClientRectLike;
  clock: ServerClock;
  selectedInk: InkIndex;
  repaint: () => void;
  commit: (next: Stroke[]) => void;
}

/** Pointer handlers over a shared PointerState ref; every field write goes through a setter above. */
function usePointerHandlers(options: PointerHandlerOptions): DoodlePadHandlers {
  const { stateRef, rectOf, clock, selectedInk, repaint, commit } = options;
  const pointOf = useCallback(
    (event: PointerEvent | ReactPointerEvent<HTMLCanvasElement>, canvas: Element): GridPoint =>
      gridPointOf(event.clientX, event.clientY, rectOf(canvas)),
    [rectOf],
  );

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      if (stateRef.current.activePointerId !== null) return; // only the first pointer draws
      setActivePointerField(stateRef, e.pointerId);
      e.currentTarget.setPointerCapture(e.pointerId);
      const at = pointOf(e, e.currentTarget);
      setLiveField(stateRef, { ink: selectedInk, points: [at], startedAt: clock.now() });
      repaint();
    },
    [clock, pointOf, repaint, selectedInk, stateRef],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      const { live, activePointerId } = stateRef.current;
      if (e.pointerId !== activePointerId || !live) return;
      for (const native of coalescedNativeEvents(e)) live.points.push(pointOf(native, e.currentTarget));
      repaint();
    },
    [pointOf, repaint, stateRef],
  );

  const endStroke = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      const { live, activePointerId, lastEndAt, strokes } = stateRef.current;
      if (e.pointerId !== activePointerId) return;
      setActivePointerField(stateRef, null);
      setLiveField(stateRef, null);
      if (!live) return;
      const now = clock.now();
      const gap = lastEndAt === null ? 0 : now - lastEndAt;
      setLastEndField(stateRef, now);
      commit([...strokes, finalizeStroke(live.ink, live.points, now - live.startedAt, gap)]);
    },
    [clock, commit, stateRef],
  );

  return { onPointerDown, onPointerMove, onPointerUp: endStroke, onPointerCancel: endStroke };
}

export function useDoodlePad(options: UseDoodlePadOptions): UseDoodlePad {
  const { clock, initialDoodle, onChange, rectOf } = options;
  const initialStrokes = [...(initialDoodle?.s ?? [])];
  const [strokeCount, setStrokeCount] = useState(initialStrokes.length);
  const [selectedInk, setSelectedInk] = useState<InkIndex>(0);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const stateRef = useRef<PointerState>({
    strokes: initialStrokes,
    live: null,
    activePointerId: null,
    lastEndAt: null,
  });
  const { canvasRef, repaint } = usePadCanvas(stateRef, options);

  const commit = useCallback(
    (next: Stroke[]) => {
      setStrokesField(stateRef, next);
      setStrokeCount(next.length);
      onChange?.({ v: 1, s: next });
      repaint();
    },
    [onChange, repaint, stateRef],
  );

  const handlers = usePointerHandlers({ stateRef, rectOf, clock, selectedInk, repaint, commit });

  const undo = useCallback(() => {
    const { strokes } = stateRef.current;
    if (strokes.length > 0) commit(strokes.slice(0, -1));
  }, [commit, stateRef]);

  const clear = useCallback(() => {
    if (stateRef.current.strokes.length === 0) return;
    if (!confirmingClear) {
      setConfirmingClear(true);
      return;
    }
    setConfirmingClear(false);
    setLastEndField(stateRef, null);
    commit([]);
  }, [commit, confirmingClear, stateRef]);

  const cancelClear = useCallback(() => setConfirmingClear(false), []);

  return {
    canvasRef,
    strokeCount,
    selectedInk,
    setSelectedInk,
    confirmingClear,
    handlers,
    undo,
    clear,
    cancelClear,
  };
}
