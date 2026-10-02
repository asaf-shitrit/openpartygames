// State and pointer-event handling for DoodlePad, split out so the component itself stays a thin
// render. Geometry and timing stay pure (./geometry, ./capture); this hook is the only place that
// touches refs and DOM events. Ref mutations are routed through plain setters below, not inlined
// in the returned callbacks, so a stroke's fields stay easy to follow one at a time.
import { useCallback, useEffect, useRef, useState } from "react";
import type { FocusEvent as ReactFocusEvent, KeyboardEvent as ReactKeyboardEvent } from "react";
import type { PointerEvent as ReactPointerEvent, RefObject } from "react";
import type { ServerClock } from "../game-ui";
import { finalizeStroke } from "./capture";
import { deltaEncode, gridPointOf } from "./geometry";
import type { ClientRectLike } from "./geometry";
import { paintDoodle } from "./paint";
import type { DoodleCanvasContext } from "./paint";
import type { Doodle, GridPoint, InkIndex, Stroke } from "@opg/sdk";
import { GRID } from "@opg/sdk";

const MAX_BACKING_RATIO = 2;
const DEFAULT_LINE_WIDTH = 4;

/**
 * A keyboard-drawn stroke shares the exact same pointer-id-gated state as a touch or mouse
 * stroke; it is just identified by a sentinel id no real PointerEvent can produce (those are
 * always >= 0), so the "only the first pointer draws" guard covers it for free.
 */
const KEYBOARD_POINTER_ID = -1;

/** Grid units a single arrow-key press moves the keyboard pen; well above MIN_STEP so every
 * press survives simplification as its own point. */
const KEYBOARD_STEP = 48;

function centerPoint(): GridPoint {
  const mid = Math.round((GRID - 1) / 2);
  return [mid, mid];
}

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
  keyboardAt: GridPoint;
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

function setKeyboardAtField(ref: RefObject<PointerState>, at: GridPoint): void {
  ref.current.keyboardAt = at;
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
  onKeyDown: (e: ReactKeyboardEvent<HTMLCanvasElement>) => void;
  onBlur: (e: ReactFocusEvent<HTMLCanvasElement>) => void;
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
  /** The keyboard pen's position, [0, GRID), shown only while a keyboard user is driving it. */
  keyboardCursor: GridPoint | null;
  /** True while a keyboard-drawn stroke is in progress (pen down, not yet lifted). */
  keyboardDrawing: boolean;
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

type PointerHandlers = Pick<
  DoodlePadHandlers,
  "onPointerDown" | "onPointerMove" | "onPointerUp" | "onPointerCancel"
>;

/** Pointer handlers over a shared PointerState ref; every field write goes through a setter above. */
function usePointerHandlers(options: PointerHandlerOptions): PointerHandlers {
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
    (e: ReactPointerEvent<HTMLCanvasElement>) =>
      commitLiveStroke({ stateRef, clock, commit }, e.pointerId),
    [clock, commit, stateRef],
  );

  return { onPointerDown, onPointerMove, onPointerUp: endStroke, onPointerCancel: endStroke };
}

interface CommitStrokeOptions {
  stateRef: RefObject<PointerState>;
  clock: ServerClock;
  commit: (next: Stroke[]) => void;
}

/**
 * Ends whichever pointer id is currently live and commits its stroke. Shared by pointer-up /
 * pointer-cancel and by the keyboard's "lift the pen" action, so both paths produce an ordinary
 * Stroke through the exact same commit call.
 */
function commitLiveStroke(options: CommitStrokeOptions, pointerId: number): void {
  const { stateRef, clock, commit } = options;
  const { live, activePointerId, lastEndAt, strokes } = stateRef.current;
  if (pointerId !== activePointerId) return;
  setActivePointerField(stateRef, null);
  setLiveField(stateRef, null);
  if (!live) return;
  const now = clock.now();
  const gap = lastEndAt === null ? 0 : now - lastEndAt;
  setLastEndField(stateRef, now);
  commit([...strokes, finalizeStroke(live.ink, live.points, now - live.startedAt, gap)]);
}

function clampGrid(value: number): number {
  if (value < 0) return 0;
  if (value > GRID - 1) return GRID - 1;
  return value;
}

/** The grid delta an arrow key moves the keyboard pen, or null for any other key. */
function arrowDelta(key: string): GridPoint | null {
  switch (key) {
    case "ArrowUp":
      return [0, -KEYBOARD_STEP];
    case "ArrowDown":
      return [0, KEYBOARD_STEP];
    case "ArrowLeft":
      return [-KEYBOARD_STEP, 0];
    case "ArrowRight":
      return [KEYBOARD_STEP, 0];
    default:
      return null;
  }
}

interface KeyboardHandlerOptions {
  stateRef: RefObject<PointerState>;
  clock: ServerClock;
  selectedInk: InkIndex;
  repaint: () => void;
  commit: (next: Stroke[]) => void;
}

interface KeyboardHandlers {
  onKeyDown: (e: ReactKeyboardEvent<HTMLCanvasElement>) => void;
  onBlur: (e: ReactFocusEvent<HTMLCanvasElement>) => void;
  hideCursor: () => void;
  cursor: GridPoint | null;
  drawing: boolean;
}

/**
 * Cursor-key drawing: arrow keys move a pen over the grid, Space/Enter lowers or lifts it,
 * Escape drops the line in progress. Every field write goes through the same PointerState ref
 * and setters the pointer handlers use, gated by the same "only one drawer at a time" rule via
 * KEYBOARD_POINTER_ID.
 */
function useKeyboardHandlers(options: KeyboardHandlerOptions): KeyboardHandlers {
  const { stateRef, clock, selectedInk, repaint, commit } = options;
  const [cursor, setCursor] = useState<GridPoint | null>(null);
  const [drawing, setDrawing] = useState(false);

  const revealCursor = useCallback(() => {
    setCursor((prev) => prev ?? stateRef.current.keyboardAt);
  }, [stateRef]);

  const hideCursor = useCallback(() => {
    if (stateRef.current.activePointerId === KEYBOARD_POINTER_ID) return; // keyboard still owns it
    setCursor(null);
  }, [stateRef]);

  const moveCursor = useCallback(
    ([dx, dy]: GridPoint) => {
      const { activePointerId, live, keyboardAt } = stateRef.current;
      const next: GridPoint = [clampGrid(keyboardAt[0] + dx), clampGrid(keyboardAt[1] + dy)];
      setKeyboardAtField(stateRef, next);
      setCursor(next);
      if (activePointerId === KEYBOARD_POINTER_ID && live) {
        live.points.push(next);
        repaint();
      }
    },
    [repaint, stateRef],
  );

  const togglePen = useCallback(() => {
    const { activePointerId, keyboardAt } = stateRef.current;
    if (activePointerId === null) {
      setActivePointerField(stateRef, KEYBOARD_POINTER_ID);
      setLiveField(stateRef, { ink: selectedInk, points: [keyboardAt], startedAt: clock.now() });
      setDrawing(true);
      repaint();
      return;
    }
    if (activePointerId !== KEYBOARD_POINTER_ID) return; // a pointer stroke owns the canvas
    commitLiveStroke({ stateRef, clock, commit }, KEYBOARD_POINTER_ID);
    setDrawing(false);
    repaint();
  }, [clock, commit, repaint, selectedInk, stateRef]);

  const cancelPen = useCallback(() => {
    if (stateRef.current.activePointerId !== KEYBOARD_POINTER_ID) return;
    setActivePointerField(stateRef, null);
    setLiveField(stateRef, null);
    setDrawing(false);
    repaint();
  }, [repaint, stateRef]);

  const onKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLCanvasElement>) => {
      const delta = arrowDelta(e.key);
      if (delta) {
        e.preventDefault();
        revealCursor();
        moveCursor(delta);
        return;
      }
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        revealCursor();
        togglePen();
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        cancelPen();
      }
    },
    [cancelPen, moveCursor, revealCursor, togglePen],
  );

  const onBlur = useCallback(() => {
    cancelPen();
    setCursor(null);
  }, [cancelPen]);

  return { onKeyDown, onBlur, hideCursor, cursor, drawing };
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
    keyboardAt: centerPoint(),
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

  const pointerHandlers = usePointerHandlers({ stateRef, rectOf, clock, selectedInk, repaint, commit });
  const keyboardHandlers = useKeyboardHandlers({ stateRef, clock, selectedInk, repaint, commit });

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      keyboardHandlers.hideCursor();
      pointerHandlers.onPointerDown(e);
    },
    [keyboardHandlers, pointerHandlers],
  );

  const handlers: DoodlePadHandlers = {
    onPointerDown,
    onPointerMove: pointerHandlers.onPointerMove,
    onPointerUp: pointerHandlers.onPointerUp,
    onPointerCancel: pointerHandlers.onPointerCancel,
    onKeyDown: keyboardHandlers.onKeyDown,
    onBlur: keyboardHandlers.onBlur,
  };

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
    keyboardCursor: keyboardHandlers.cursor,
    keyboardDrawing: keyboardHandlers.drawing,
  };
}
