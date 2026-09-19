import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DoodlePad } from "./DoodlePad";
import type { DoodleCanvasContext } from "./paint";
import { deltaDecode } from "./geometry";
import type { Doodle } from "./types";
import type { ClientRectLike } from "./geometry";

afterEach(cleanup);

const RECT: ClientRectLike = { left: 0, top: 0, width: 300, height: 300 };

function stubRectOf(): (el: Element) => ClientRectLike {
  return () => RECT;
}

function recordingContext(): (canvas: HTMLCanvasElement) => DoodleCanvasContext {
  return () => ({
    strokeStyle: "",
    lineWidth: 1,
    lineCap: "butt",
    lineJoin: "miter",
    save() {},
    restore() {},
    clearRect() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
  });
}

/** A clock whose now() steps forward by `stepMs` on every call, starting at `startAt`. */
function steppingClock(startAt: number, stepMs: number) {
  let current = startAt - stepMs;
  return { now: () => (current += stepMs) };
}

function canvasEl(): HTMLCanvasElement {
  const el = document.body.querySelector("canvas");
  if (!el) throw new Error("expected a canvas");
  return el;
}

// The canvas is aria-hidden and the words sit in the span beside it, so that is what a
// screen reader reads and what these assert on.
function spokenLabel(): string {
  const el = canvasEl().nextElementSibling;
  if (!el) throw new Error("expected a label beside the canvas");
  return el.textContent ?? "";
}

function drag(
  canvas: HTMLCanvasElement,
  pointerId: number,
  points: Array<{ clientX: number; clientY: number }>,
): void {
  const [down, ...rest] = points;
  if (!down) throw new Error("drag needs at least one point");
  fireEvent.pointerDown(canvas, { pointerId, ...down });
  for (const point of rest) fireEvent.pointerMove(canvas, { pointerId, ...point });
  fireEvent.pointerUp(canvas, { pointerId, ...(rest[rest.length - 1] ?? down) });
}

describe("DoodlePad", () => {
  it("speaks the prompt and stroke count beside the canvas", () => {
    render(
      <DoodlePad
        prompt="a cat riding a skateboard"
        clock={steppingClock(0, 100)}
        rectOf={stubRectOf()}
        getContext={recordingContext()}
      />,
    );
    expect(spokenLabel()).toBe("Your drawing for a cat riding a skateboard: 0 strokes so far");
  });

  it("records a dragged stroke with its ink, quantized duration and gap, then updates what is spoken", () => {
    const onChange = vi.fn<(doodle: Doodle) => void>();
    const clock = steppingClock(0, 50); // each event call advances the clock by 50ms
    render(
      <DoodlePad
        prompt="a cat"
        clock={clock}
        rectOf={stubRectOf()}
        getContext={recordingContext()}
        onChange={onChange}
      />,
    );
    drag(canvasEl(), 1, [
      { clientX: 0, clientY: 0 },
      { clientX: 150, clientY: 150 },
      { clientX: 300, clientY: 300 },
    ]);

    expect(onChange).toHaveBeenCalledTimes(1);
    const doodle = onChange.mock.calls[0]?.[0];
    expect(doodle?.s).toHaveLength(1);
    const stroke = doodle?.s[0];
    expect(stroke?.c).toBe(0); // default selected ink
    expect(stroke?.g).toBe(0); // first stroke has no prior stroke to gap from
    expect(stroke?.d).toBeGreaterThan(0);
    expect(deltaDecode(stroke?.p ?? [])[0]).toEqual([0, 0]);
    expect(spokenLabel()).toBe("Your drawing for a cat: 1 stroke so far");
  });

  it("only the first active pointer draws; a second pointer down is ignored", () => {
    const onChange = vi.fn<(doodle: Doodle) => void>();
    render(
      <DoodlePad
        prompt="a cat"
        clock={steppingClock(0, 20)}
        rectOf={stubRectOf()}
        getContext={recordingContext()}
        onChange={onChange}
      />,
    );
    const canvas = canvasEl();
    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 0, clientY: 0 });
    fireEvent.pointerDown(canvas, { pointerId: 2, clientX: 300, clientY: 300 });
    fireEvent.pointerMove(canvas, { pointerId: 2, clientX: 200, clientY: 200 });
    fireEvent.pointerUp(canvas, { pointerId: 2, clientX: 200, clientY: 200 });
    expect(onChange).not.toHaveBeenCalled(); // the resting second pointer committed nothing
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 100, clientY: 100 });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("records the gap since the previous stroke ended", () => {
    const onChange = vi.fn<(doodle: Doodle) => void>();
    const clock = steppingClock(0, 300);
    render(
      <DoodlePad
        prompt="a cat"
        clock={clock}
        rectOf={stubRectOf()}
        getContext={recordingContext()}
        onChange={onChange}
      />,
    );
    const canvas = canvasEl();
    drag(canvas, 1, [{ clientX: 0, clientY: 0 }, { clientX: 50, clientY: 50 }]);
    drag(canvas, 1, [{ clientX: 100, clientY: 100 }, { clientX: 150, clientY: 150 }]);
    expect(onChange).toHaveBeenCalledTimes(2);
    const second = onChange.mock.calls[1]?.[0];
    expect(second?.s[1]?.g).toBeGreaterThan(0);
  });

  it("selecting a swatch marks it checked and colours the next stroke", () => {
    const onChange = vi.fn<(doodle: Doodle) => void>();
    render(
      <DoodlePad
        prompt="a cat"
        clock={steppingClock(0, 20)}
        rectOf={stubRectOf()}
        getContext={recordingContext()}
        onChange={onChange}
      />,
    );
    const redPen = screen.getByRole("radio", { name: "Red pen" });
    fireEvent.click(redPen);
    expect(redPen instanceof HTMLInputElement && redPen.checked).toBe(true);
    const inkPen = screen.getByRole("radio", { name: "Ink pen" });
    expect(inkPen instanceof HTMLInputElement && inkPen.checked).toBe(false);
    drag(canvasEl(), 1, [{ clientX: 0, clientY: 0 }, { clientX: 50, clientY: 50 }]);
    expect(onChange.mock.calls[0]?.[0]?.s[0]?.c).toBe(1);
  });

  it("undo pops the last stroke and repaints from the model", () => {
    const onChange = vi.fn<(doodle: Doodle) => void>();
    render(
      <DoodlePad
        prompt="a cat"
        clock={steppingClock(0, 20)}
        rectOf={stubRectOf()}
        getContext={recordingContext()}
        onChange={onChange}
      />,
    );
    const canvas = canvasEl();
    drag(canvas, 1, [{ clientX: 0, clientY: 0 }, { clientX: 50, clientY: 50 }]);
    drag(canvas, 1, [{ clientX: 100, clientY: 100 }, { clientX: 150, clientY: 150 }]);
    expect(onChange.mock.calls.at(-1)?.[0]?.s).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(onChange.mock.calls.at(-1)?.[0]?.s).toHaveLength(1);
    expect(spokenLabel()).toBe("Your drawing for a cat: 1 stroke so far");
  });

  it("undo is disabled with nothing drawn", () => {
    render(
      <DoodlePad
        prompt="a cat"
        clock={steppingClock(0, 20)}
        rectOf={stubRectOf()}
        getContext={recordingContext()}
      />,
    );
    expect(screen.getByRole("button", { name: "Undo" }).hasAttribute("disabled")).toBe(true);
  });

  it("clear needs a second tap to confirm, then empties the drawing", () => {
    const onChange = vi.fn<(doodle: Doodle) => void>();
    render(
      <DoodlePad
        prompt="a cat"
        clock={steppingClock(0, 20)}
        rectOf={stubRectOf()}
        getContext={recordingContext()}
        onChange={onChange}
      />,
    );
    drag(canvasEl(), 1, [{ clientX: 0, clientY: 0 }, { clientX: 50, clientY: 50 }]);
    const clearButton = screen.getByRole("button", { name: /clear/i });
    fireEvent.click(clearButton);
    expect(onChange).toHaveBeenCalledTimes(1); // only the drawn stroke so far, not a clear yet
    fireEvent.click(screen.getByRole("button", { name: /tap again/i }));
    expect(onChange.mock.calls.at(-1)?.[0]?.s).toEqual([]);
  });
});
