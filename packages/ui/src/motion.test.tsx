import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { createElement } from "react";
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

describe("PhaseEnter focus", () => {
  it("does not steal focus on first mount", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    render(
      <PhaseEnter phaseKey="r1:ask">
        <h1>Ask a question</h1>
      </PhaseEnter>,
    );
    expect(document.activeElement).toBe(input);
    input.remove();
  });

  it("moves focus to the new phase's heading when phaseKey changes", () => {
    const { rerender } = render(
      <PhaseEnter phaseKey="r1:ask">
        <h1>Ask a question</h1>
      </PhaseEnter>,
    );
    rerender(
      <PhaseEnter phaseKey="r1:vote">
        <h1>Vote now</h1>
      </PhaseEnter>,
    );
    expect(document.activeElement?.textContent).toBe("Vote now");
    expect(document.activeElement?.getAttribute("tabindex")).toBe("-1");
  });

  it("falls back to role=heading when there is no native heading tag", () => {
    // Built with createElement, not JSX: a real component would use a native h1-h6 (the
    // project's own lint rules require it), but PhaseEnter's selector also matches
    // role="heading" defensively, for markup this codebase does not control.
    const { rerender } = render(
      <PhaseEnter phaseKey="a">
        {createElement("div", { role: "heading", "aria-level": 1 }, "First")}
      </PhaseEnter>,
    );
    rerender(
      <PhaseEnter phaseKey="b">
        {createElement("div", { role: "heading", "aria-level": 1 }, "Second")}
      </PhaseEnter>,
    );
    expect(document.activeElement?.textContent).toBe("Second");
  });

  it("leaves focus where it was when the new phase has no heading", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    const { rerender } = render(
      <PhaseEnter phaseKey="r1:ask">
        <span>Ask a question</span>
      </PhaseEnter>,
    );
    rerender(
      <PhaseEnter phaseKey="r1:vote">
        <span>Vote now</span>
      </PhaseEnter>,
    );
    // No heading to send focus to: better to leave it where it was than drop it to <body>.
    expect(document.activeElement).toBe(input);
    input.remove();
  });

  it("does not steal focus from a player mid-typing when the phase changes", () => {
    const { rerender } = render(
      <div>
        <input aria-label="Your answer" defaultValue="still typin" />
        <PhaseEnter phaseKey="r1:ask">
          <h1>Ask a question</h1>
        </PhaseEnter>
      </div>,
    );
    const input = screen.getByLabelText("Your answer");
    input.focus();
    expect(document.activeElement).toBe(input);
    // Same outer <div>/<input> position, so React reconciles the input in place and it keeps
    // focus; only the PhaseEnter's own phaseKey changes.
    rerender(
      <div>
        <input aria-label="Your answer" defaultValue="still typin" />
        <PhaseEnter phaseKey="r1:vote">
          <h1>Vote now</h1>
        </PhaseEnter>
      </div>,
    );
    expect(document.activeElement).toBe(input);
  });
});