// The phone drawing pad: a <canvas> sized to its CSS box, a six-swatch palette, undo and clear.
// Pointer handling and timing live in ./useDoodlePad; this is the thin render (plan/0003-doodle-bluff.md).
import type { CSSProperties } from "react";
import { format, pickPluralByCount, useLocale } from "@opg/i18n";
import type { Dictionary } from "@opg/i18n";
import type { ServerClock } from "../game-ui";
import { SR_ONLY } from "../sr-only";
import type { ClientRectLike } from "./geometry";
import { doodleInkNames, DOODLE_INKS } from "./inks";
import type { DoodleCanvasContext } from "./paint";
import type { Doodle } from "./types";
import { DoodlePalette } from "./DoodlePalette";
import { useDoodlePad } from "./useDoodlePad";

const DEFAULT_SIZE = 320;
const TAP_TARGET = 44;

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
  } = useDoodlePad({ clock, size, inks, initialDoodle, onChange, rectOf, getContext });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, ...style }}>
      <canvas
        ref={canvasRef}
        // The words live in the sibling <span> below: a canvas is not an image element, so it
        // carries the drawing and the span carries what a screen reader says about it.
        aria-hidden="true"
        {...handlers}
        style={{
          width: size,
          height: size,
          touchAction: "none",
          background: "#FFFFFF",
          border: "4px solid #2B2B2B",
          borderRadius: "30px 10px 26px 12px / 12px 26px 10px 30px",
        }}
      />
      <span style={SR_ONLY}>{ariaLabelFor(prompt, strokeCount, t.kit)}</span>
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
