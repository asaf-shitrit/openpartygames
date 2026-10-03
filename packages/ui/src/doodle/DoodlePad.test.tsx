import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { LocaleProvider } from "@opg/i18n";
import { DoodlePad } from "./DoodlePad";
import type { DoodleCanvasContext } from "./paint";
import { deltaDecode } from "./geometry";
import { doodleSchema, MAX_STROKES_PER_DOODLE } from "@opg/sdk";
import type { Doodle } from "@opg/sdk";
import type { ClientRectLike } from "./geometry";

afterEach(cleanup);

function renderDoodlePad(ui: ReactElement) {
  return render(<LocaleProvider>{ui}</LocaleProvider>);
}

function renderHebrewDoodlePad(ui: ReactElement) {
  window.localStorage.setItem("opg:locale", "he");
  return render(<LocaleProvider>{ui}</LocaleProvider>);
}

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

// The canvas names itself via aria-labelledby, and the words live in that referenced span, so
// that is what a screen reader reads and what these assert on.
function spokenLabel(): string {
  const labelId = canvasEl().getAttribute("aria-labelledby");
  if (!labelId) throw new Error("expected the canvas to have aria-labelledby");
  const el = document.getElementById(labelId);
  if (!el) throw new Error("expected the referenced label to exist");
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
    renderDoodlePad(
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
    renderDoodlePad(
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
    renderDoodlePad(
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
    renderDoodlePad(
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
    renderDoodlePad(
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
    renderDoodlePad(
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
    renderDoodlePad(
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
    renderDoodlePad(
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

describe("DoodlePad, from the keyboard", () => {
  it("has no aria-hidden canvas and exposes a real accessible name and description", () => {
    renderDoodlePad(
      <DoodlePad
        prompt="a cat"
        clock={steppingClock(0, 20)}
        rectOf={stubRectOf()}
        getContext={recordingContext()}
      />,
    );
    const canvas = canvasEl();
    expect(canvas.getAttribute("aria-hidden")).toBeNull();
    expect(canvas.tabIndex).toBe(0);
    expect(canvas.hasAttribute("aria-labelledby")).toBe(true);
    expect(canvas.hasAttribute("aria-describedby")).toBe(true);
  });

  it("draws a real stroke with arrow keys and space, committed through the ordinary path", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn<(doodle: Doodle) => void>();
    renderDoodlePad(
      <DoodlePad
        prompt="a cat"
        clock={steppingClock(0, 50)}
        rectOf={stubRectOf()}
        getContext={recordingContext()}
        onChange={onChange}
      />,
    );
    const canvas = canvasEl();
    await user.tab(); // focuses the palette's first swatch, then...
    canvas.focus();
    await user.keyboard("{ }"); // pen down
    await user.keyboard("{ArrowRight}{ArrowRight}{ArrowDown}");
    await user.keyboard("{ }"); // pen up: commits the stroke

    expect(onChange).toHaveBeenCalledTimes(1);
    const doodle = onChange.mock.calls[0]?.[0];
    expect(doodle?.s).toHaveLength(1);
    const stroke = doodle?.s[0];
    // A real stroke has more than one point: the keyboard moved the pen after putting it down.
    expect(deltaDecode(stroke?.p ?? []).length).toBeGreaterThan(1);
    expect(stroke?.d).toBeGreaterThan(0);
  });

  it("escape cancels a keyboard stroke in progress without committing anything", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn<(doodle: Doodle) => void>();
    renderDoodlePad(
      <DoodlePad
        prompt="a cat"
        clock={steppingClock(0, 50)}
        rectOf={stubRectOf()}
        getContext={recordingContext()}
        onChange={onChange}
      />,
    );
    canvasEl().focus();
    await user.keyboard("{ }{ArrowRight}{Escape}");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("announces the pen state while drawing with the keyboard", async () => {
    const user = userEvent.setup();
    renderDoodlePad(
      <DoodlePad
        prompt="a cat"
        clock={steppingClock(0, 50)}
        rectOf={stubRectOf()}
        getContext={recordingContext()}
      />,
    );
    canvasEl().focus();
    await user.keyboard("{ }");
    expect(spokenLabel()).toBe("Drawing a line. Press space or enter to lift the pen.");
    await user.keyboard("{ }");
    expect(spokenLabel()).toBe("Your drawing for a cat: 1 stroke so far");
  });

  it("blurring the canvas mid-stroke cancels it rather than leaving it stuck", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn<(doodle: Doodle) => void>();
    renderDoodlePad(
      <>
        <DoodlePad
          prompt="a cat"
          clock={steppingClock(0, 50)}
          rectOf={stubRectOf()}
          getContext={recordingContext()}
          onChange={onChange}
        />
        <button type="button">elsewhere</button>
      </>,
    );
    canvasEl().focus();
    await user.keyboard("{ }{ArrowRight}");
    fireEvent.blur(canvasEl());
    // Pen was never lifted with space/enter, so nothing should have committed...
    expect(onChange).not.toHaveBeenCalled();
    // ...and pressing space again after refocusing starts a fresh stroke, not resumes the old one.
    canvasEl().focus();
    await user.keyboard("{ }{ArrowRight}{ }");
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

describe("DoodlePad, in Hebrew", () => {
  afterEach(() => {
    window.localStorage.removeItem("opg:locale");
  });

  it("speaks the prompt and pen names in Hebrew", () => {
    renderHebrewDoodlePad(
      <DoodlePad
        prompt="חתול על סקייטבורד"
        clock={steppingClock(0, 100)}
        rectOf={stubRectOf()}
        getContext={recordingContext()}
      />,
    );
    expect(spokenLabel()).toBe("הציור שלכם עבור חתול על סקייטבורד: 0 קווים עד כה");
    expect(screen.getByRole("radio", { name: "עט אדום" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "בטלו" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "נקו" })).toBeTruthy();
  });
});

describe("DoodlePad, at the room's limits", () => {
  const fullDoodle: Doodle = {
    v: 1,
    s: Array.from({ length: MAX_STROKES_PER_DOODLE }, () => ({ c: 0, d: 0, g: 0, p: [10, 10, 40, 40] })),
  };

  function renderPad(extra: Partial<Parameters<typeof DoodlePad>[0]> = {}) {
    return renderDoodlePad(
      <DoodlePad
        prompt="a cat"
        clock={steppingClock(0, 50)}
        rectOf={stubRectOf()}
        getContext={recordingContext()}
        {...extra}
      />,
    );
  }

  it("splits a drag longer than the point cap so every emitted doodle passes the schema", () => {
    const onChange = vi.fn<(doodle: Doodle) => void>();
    renderPad({ onChange });
    // happy-dom drops pointer coordinates, so trace a long square loop with the keyboard pen.
    const canvas = canvasEl();
    fireEvent.keyDown(canvas, { key: " " });
    const loop = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"];
    for (let i = 0; i < 600; i += 1) fireEvent.keyDown(canvas, { key: loop[i % 4] });
    fireEvent.keyDown(canvas, { key: " " });
    const doodle = onChange.mock.calls[0]?.[0];
    expect(doodleSchema.safeParse(doodle).success).toBe(true);
    expect(doodle?.s.length).toBeGreaterThan(1);
  });

  it("takes no more ink and says so once the doodle holds the most strokes the room accepts", () => {
    const onChange = vi.fn<(doodle: Doodle) => void>();
    renderPad({ initialDoodle: fullDoodle, onChange });
    expect(screen.getByRole("status").textContent).toBe("The page is full. Undo a stroke to keep drawing.");
    drag(canvasEl(), 1, [
      { clientX: 0, clientY: 0 },
      { clientX: 200, clientY: 200 },
    ]);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("lets the player draw again after undoing from a full doodle", () => {
    const onChange = vi.fn<(doodle: Doodle) => void>();
    renderPad({ initialDoodle: fullDoodle, onChange });
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.queryByRole("status")).toBeNull();
    drag(canvasEl(), 1, [
      { clientX: 0, clientY: 0 },
      { clientX: 200, clientY: 200 },
    ]);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("says the page is full in Hebrew", () => {
    window.localStorage.setItem("opg:locale", "he");
    renderPad({ initialDoodle: fullDoodle });
    expect(screen.getByRole("status").textContent).toBe("הדף מלא. בטלו קו כדי להמשיך לצייר.");
    window.localStorage.removeItem("opg:locale");
  });
});
