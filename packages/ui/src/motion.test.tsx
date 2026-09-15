import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { PhaseEnter } from "./motion";

afterEach(cleanup);

function firstChild(container: HTMLElement): HTMLElement {
  const node = container.firstElementChild;
  if (!(node instanceof HTMLElement)) throw new Error("expected an element");
  return node;
}

describe("PhaseEnter", () => {
  it("renders its children inside the animated frame", () => {
    const { container } = render(
      <PhaseEnter phaseKey="r1:ask">
        <span>Question</span>
      </PhaseEnter>,
    );
    const frame = firstChild(container);
    expect(frame.className).toBe("opg-phase-enter");
    expect(screen.getByText("Question")).toBeTruthy();
  });

  it("uses the default frame layout", () => {
    const { container } = render(<PhaseEnter phaseKey="a">x</PhaseEnter>);
    const frame = firstChild(container);
    expect(frame.style.display).toBe("flex");
    expect(frame.style.flexDirection).toBe("column");
    expect(frame.style.flexGrow).toBe("1");
    expect(frame.style.minHeight).toBe("0");
    expect(frame.style.gap).toBe("inherit");
  });

  it("merges a custom style over the defaults", () => {
    const { container } = render(
      <PhaseEnter phaseKey="a" style={{ gap: 8, marginTop: 4 }}>
        x
      </PhaseEnter>,
    );
    const frame = firstChild(container);
    expect(frame.style.gap).toBe("8px");
    expect(frame.style.marginTop).toBe("4px");
    expect(frame.style.display).toBe("flex");
  });

  it("remounts the frame when phaseKey changes", () => {
    const { container, rerender } = render(
      <PhaseEnter phaseKey="r1:ask">
        <span>a</span>
      </PhaseEnter>,
    );
    const first = firstChild(container);
    rerender(
      <PhaseEnter phaseKey="r1:vote">
        <span>a</span>
      </PhaseEnter>,
    );
    expect(firstChild(container)).not.toBe(first);
  });

  it("keeps the frame mounted for the same phaseKey", () => {
    const { container, rerender } = render(
      <PhaseEnter phaseKey="r1:ask">
        <span>a</span>
      </PhaseEnter>,
    );
    const first = firstChild(container);
    rerender(
      <PhaseEnter phaseKey="r1:ask">
        <span>b</span>
      </PhaseEnter>,
    );
    expect(firstChild(container)).toBe(first);
    expect(screen.getByText("b")).toBeTruthy();
  });
});