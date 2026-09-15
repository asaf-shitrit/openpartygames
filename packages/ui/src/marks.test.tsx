import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Crown, Tally } from "./marks";

afterEach(cleanup);

function firstChild(container: HTMLElement): HTMLElement | SVGElement {
  const node = container.firstElementChild;
  if (!(node instanceof HTMLElement) && !(node instanceof SVGElement)) {
    throw new Error("expected an element");
  }
  return node;
}

describe("Crown", () => {
  it("renders the default 40px wide doodle with proportional height", () => {
    const { container } = render(<Crown />);
    const svg = firstChild(container);
    expect(svg.getAttribute("width")).toBe("40");
    expect(svg.getAttribute("height")).toBe(String((40 * 34) / 40));
    expect(svg.getAttribute("aria-hidden")).toBe("true");
  });

  it("scales with size and strokeWidth", () => {
    const { container } = render(<Crown size={80} strokeWidth={5} />);
    const svg = firstChild(container);
    expect(svg.getAttribute("width")).toBe("80");
    expect(svg.getAttribute("height")).toBe(String((80 * 34) / 40));
    expect(svg.getAttribute("stroke-width")).toBe("5");
    expect(svg.style.flexShrink).toBe("0");
  });
});

describe("Tally", () => {
  it("shows the crown count and a screen-reader label", () => {
    render(<Tally count={3} />);
    expect(screen.getByText("×3")).toBeTruthy();
    expect(screen.getByText("3 crowns")).toBeTruthy();
  });

  it("uses the singular label for one crown", () => {
    render(<Tally count={1} />);
    expect(screen.getByText("1 crown")).toBeTruthy();
  });

  it("scales the marker count with size", () => {
    const { container } = render(<Tally count={2} size={80} />);
    const count = screen.getByText("×2");
    expect(count.style.fontSize).toBe(`${Math.round(80 * 0.75)}px`);
    expect(firstChild(container)).toBeTruthy();
  });
});
