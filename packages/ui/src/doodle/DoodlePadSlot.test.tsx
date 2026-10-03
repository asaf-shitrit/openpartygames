import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LocaleProvider } from "@opg/i18n";
import type { Doodle } from "@opg/sdk";
import { DoodlePad } from "./DoodlePad";
import type { DoodleCanvasContext } from "./paint";

afterEach(cleanup);

const noContext = (): DoodleCanvasContext | null => null;
const rectOf = () => ({ left: 0, top: 0, width: 300, height: 300 });

function renderWithSlot(slot: HTMLElement | null) {
  const onChange = vi.fn<(doodle: Doodle) => void>();
  let now = 0;
  render(
    <LocaleProvider>
      <DoodlePad
        prompt="a cat"
        clock={{ now: () => (now += 20) }}
        rectOf={rectOf}
        getContext={noContext}
        onChange={onChange}
        controlsSlot={slot}
      />
    </LocaleProvider>,
  );
  return onChange;
}

function drawOneStroke(): void {
  const canvas = document.body.querySelector("canvas");
  if (canvas === null) throw new Error("expected a canvas");
  fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 0, clientY: 0 });
  fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 50, clientY: 50 });
  fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 50, clientY: 50 });
}

describe("DoodlePad, with its controls in a slot", () => {
  it("puts the palette, Undo and Clear in the slot, and they still drive the pad", () => {
    const slot = document.body.appendChild(document.createElement("div"));
    const onChange = renderWithSlot(slot);
    expect(slot.querySelector('[role="radiogroup"]')).not.toBeNull();
    drawOneStroke();
    expect(onChange.mock.calls.at(-1)?.[0]?.s).toHaveLength(1);
    const undo = [...slot.querySelectorAll("button")].find((b) => b.textContent === "Undo");
    if (undo === undefined) throw new Error("expected Undo in the slot");
    fireEvent.click(undo);
    expect(onChange.mock.calls.at(-1)?.[0]?.s).toHaveLength(0);
    slot.remove();
  });

  it("renders no controls beside the canvas while the slot is not mounted yet", () => {
    renderWithSlot(null);
    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
  });
});
