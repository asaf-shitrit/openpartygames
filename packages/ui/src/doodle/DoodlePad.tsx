// The phone drawing pad: a <canvas> sized to its CSS box, a six-swatch palette, undo and clear.
// Pointer handling and timing live in ./useDoodlePad; this is the thin render (plan/0003-doodle-bluff.md).
//
// Keyboard input: a keyboard-only or switch-access player cannot swipe a finger, so the canvas
// also accepts cursor-key drawing (arrow keys move a pen, space/enter lowers or lifts it, escape
// drops a line not yet finished). It produces the exact same Stroke the pointer path does, through
// the same commit call in useDoodlePad — never a second data shape. A stamp/shape palette was the
// other option on the table (issue #54); cursor-key drawing won because it needs no new wire
// format and gives a keyboard player the same freehand result a touch player gets, not a
// consolation prize. The visible pen marker is a plain CSS position, no animation, so there is
// nothing for prefers-reduced-motion to turn off.
import type { CSSProperties } from "react";
import { useId } from "react";
import { format, pickPluralByCount, useLocale } from "@opg/i18n";
import type { Dictionary } from "@opg/i18n";
import type { ServerClock } from "../game-ui";
import { SR_ONLY } from "../sr-only";
import type { ClientRectLike } from "./geometry";
import { doodleInkNames, DOODLE_INKS } from "./inks";
import type { DoodleCanvasContext } from "./paint";
import type { RefObject } from "react";
import type { Doodle, GridPoint } from "@opg/sdk";
import { GRID } from "@opg/sdk";
import { DoodlePalette } from "./DoodlePalette";
import { useDoodlePad } from "./useDoodlePad";
import type { DoodlePadHandlers } from "./useDoodlePad";

const DEFAULT_SIZE = 320;
const TAP_TARGET = 44;
const CURSOR_DOT = 16;

export interface DoodlePadProps {
  /** Announced in the aria-label: "Your drawing for <prompt>: N strokes so far". */
  prompt: string;
  clock: ServerClock;
  /** CSS px, square. Defaults to 320. */
  size?: number;
  inks?: readonly string[];
  inkNames?: readonly string[];
  initialDoodle?: Doodle;
  /** Fires after every committed change: a finished stroke, an undo or a clear. */
  onChange?: (doodle: Doodle) => void;
  /** Test seam: happy-dom's getBoundingClientRect() is all-zero. */
  rectOf?: (el: Element) => ClientRectLike;
  /** Test seam: builds the drawing context from the canvas. Default: canvas.getContext("2d"). */
  getContext?: (canvas: HTMLCanvasElement) => DoodleCanvasContext | null;
  style?: CSSProperties;
}

function defaultRectOf(el: Element): ClientRectLike {
  return el.getBoundingClientRect();
}

function defaultGetContext(canvas: HTMLCanvasElement): DoodleCanvasContext | null {
  return canvas.getContext("2d");
}

function ariaLabelFor(prompt: string, strokeCount: number, t: Dictionary["kit"]): string {
  const form = pickPluralByCount(strokeCount, t.doodle.strokes);
  const strokes = format(form, { count: strokeCount });
  return format(t.doodle.ariaLabel, { prompt, strokes });
}

/** What the live region says: the pen state while a keyboard stroke is in progress, otherwise
 * the same prompt-and-count label a mouse or touch drawer gets. */
function statusFor(
  drawing: boolean,
  prompt: string,
  strokeCount: number,
  t: Dictionary["kit"],
): string {
  return drawing ? t.doodle.keyboardDrawing : ariaLabelFor(prompt, strokeCount, t);
}

/** Percentage position of the keyboard pen over the canvas box, for the CSS overlay marker. */
function cursorMarkerStyle(at: GridPoint, drawing: boolean): CSSProperties {
  const [x, y] = at;
  return {
    position: "absolute",
    left: `${(x / (GRID - 1)) * 100}%`,
    top: `${(y / (GRID - 1)) * 100}%`,
    width: CURSOR_DOT,
    height: CURSOR_DOT,
    marginLeft: -CURSOR_DOT / 2,
    marginTop: -CURSOR_DOT / 2,
    borderRadius: "50%",
    border: "3px solid #2B2B2B",
    background: drawing ? "#D7372B" : "transparent",
    // A static position, no transition or animation: nothing here for
    // prefers-reduced-motion to turn off.
    pointerEvents: "none",
  };
}

interface DoodleCanvasSurfaceProps {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  handlers: DoodlePadHandlers;
  size: number;
  labelId: string;
  instructionsId: string;
  keyboardCursor: GridPoint | null;
  keyboardDrawing: boolean;
}

/**
 * The canvas plus its keyboard-pen overlay, split out so DoodlePad stays under the line cap.
 * The `role="application"` sits on this wrapping div rather than the canvas itself — a canvas
 * counts as an interactive element, and lint (rightly) rejects handing an interactive element a
 * non-interactive role; a plain div has no such conflict, and the role still reaches assistive
 * tech before it gets to the focused, keystroke-driven canvas inside it.
 */
function DoodleCanvasSurface({
  canvasRef,
  handlers,
  size,
  labelId,
  instructionsId,
  keyboardCursor,
  keyboardDrawing,
}: DoodleCanvasSurfaceProps) {
  return (
    <div
      role="application"
      // `maxWidth` because this wrapper is new: the canvas alone used to be the widest thing
      // here and `.opg-root canvas` caps it at 100%, so it shrank on a narrow screen. Wrapping
      // it in a fixed-width box put a 676px element on a 390px screen at 200% text and the
      // page scrolled sideways. The cap keeps the wrapper inside the phone, and the marker
      // inside it is positioned in percentages, so it follows.
      style={{
        position: "relative",
        width: size,
        maxWidth: "100%",
        height: size,
      }}
    >
      <canvas
        ref={canvasRef}
        // The words live in the span below: a canvas is not an image element, so it carries the
        // drawing and the span carries what a screen reader says about it.
        tabIndex={0}
        aria-labelledby={labelId}
        aria-describedby={instructionsId}
        {...handlers}
        style={{
          display: "block",
          width: size,
          height: size,
          touchAction: "none",
          background: "#FFFFFF",
          border: "4px solid #2B2B2B",
          borderRadius: "30px 10px 26px 12px / 12px 26px 10px 30px",
        }}
      />
      {keyboardCursor ? (
        <span aria-hidden="true" style={cursorMarkerStyle(keyboardCursor, keyboardDrawing)} />
      ) : null}
    </div>
  );
}

export function DoodlePad({
  prompt,
  clock,
  size = DEFAULT_SIZE,
  inks = DOODLE_INKS,
  inkNames,
  initialDoodle,
  onChange,
  rectOf = defaultRectOf,
  getContext = defaultGetContext,
  style,
}: DoodlePadProps) {
  const { t } = useLocale();
  const {
    canvasRef,
    strokeCount,
    selectedInk,
    setSelectedInk,
    confirmingClear,
    handlers,
    undo,
    clear,
    cancelClear,
    keyboardCursor,
    keyboardDrawing,
  } = useDoodlePad({ clock, size, inks, initialDoodle, onChange, rectOf, getContext });
  const labelId = useId();
  const instructionsId = useId();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, ...style }}>
      <DoodleCanvasSurface
        canvasRef={canvasRef}
        handlers={handlers}
        size={size}
        labelId={labelId}
        instructionsId={instructionsId}
        keyboardCursor={keyboardCursor}
        keyboardDrawing={keyboardDrawing}
      />
      <span id={labelId} style={SR_ONLY} aria-live="polite">
        {statusFor(keyboardDrawing, prompt, strokeCount, t.kit)}
      </span>
      <span id={instructionsId} style={SR_ONLY}>
        {t.kit.doodle.keyboardInstructions}
      </span>
      <DoodlePalette
        inks={inks}
        inkNames={inkNames ?? doodleInkNames(t.kit.ink)}
        selected={selectedInk}
        onSelect={setSelectedInk}
        name="doodle-pad-ink"
      />
      <div style={{ display: "flex", gap: 12 }}>
        <button
          type="button"
          onClick={undo}
          disabled={strokeCount === 0}
          style={{ minHeight: TAP_TARGET, flex: 1, fontWeight: 700, fontSize: 16 }}
        >
          {t.kit.doodle.undo}
        </button>
        <button
          type="button"
          onClick={clear}
          onBlur={cancelClear}
          disabled={strokeCount === 0}
          aria-label={confirmingClear ? t.kit.doodle.confirmClear : t.kit.doodle.clear}
          style={{ minHeight: TAP_TARGET, flex: 1, fontWeight: 700, fontSize: 16 }}
        >
          {confirmingClear ? t.kit.doodle.tapAgainToClear : t.kit.doodle.clear}
        </button>
      </div>
    </div>
  );
}
