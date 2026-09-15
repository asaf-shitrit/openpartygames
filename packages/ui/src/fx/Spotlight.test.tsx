import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import type { SpotlightTarget } from "./Spotlight";
import { Spotlight, spotlightMaskCircles } from "./Spotlight";

afterEach(cleanup);

const TARGETS: SpotlightTarget[] = [
  { id: "priya", x: 120, y: 480, radius: 190 },
  { id: "dov", x: 1400, y: 500, radius: 190 },
];

describe("spotlightMaskCircles", () => {
  it("maps ids to translate transforms and radii", () => {
    expect(spotlightMaskCircles(TARGETS)).toEqual([
      { id: "priya", transform: "translate(120px, 480px)", r: 190 },
      { id: "dov", transform: "translate(1400px, 500px)", r: 190 },
    ]);
  });

  it("returns nothing for no targets", () => {
    expect(spotlightMaskCircles([])).toEqual([]);
  });
});

describe("Spotlight", () => {
  it("puts one mask hole per target at its center", () => {
    const { container } = render(<Spotlight on targets={TARGETS} />);
    const circles = container.querySelectorAll("circle");
    expect(circles).toHaveLength(2);
    expect(circles[0]?.getAttribute("r")).toBe("190");
    expect(circles[0]?.style.transform).toBe("translate(120px, 480px)");
  });

  it("wires the mask id to the dim rect", () => {
    const { container } = render(<Spotlight on targets={TARGETS} />);
    const mask = container.querySelector("mask");
    const dim = container.querySelector("svg > rect");
    expect(mask?.getAttribute("id")).toBeTruthy();
    expect(dim?.getAttribute("mask")).toBe(`url(#${mask?.getAttribute("id")})`);
  });

  it("stays mounted and fades between on and off", () => {
    const { container, rerender } = render(<Spotlight on targets={TARGETS} />);
    const overlay = container.firstElementChild;
    if (!(overlay instanceof HTMLElement)) throw new Error("expected overlay");
    expect(overlay.style.opacity).toBe("1");
    rerender(<Spotlight on={false} targets={TARGETS} />);
    expect(overlay.style.opacity).toBe("0");
    expect(container.querySelectorAll("circle")).toHaveLength(2);
  });

  it("renders a plain dim with no holes when there are no targets", () => {
    const { container } = render(<Spotlight on targets={[]} />);
    expect(container.querySelectorAll("circle")).toHaveLength(0);
    expect(container.querySelector("svg > rect")).toBeTruthy();
  });

  it("uses the requested dim strength", () => {
    const { container } = render(<Spotlight on targets={[]} dim={0.3} />);
    expect(container.querySelector("svg > rect")?.getAttribute("fill")).toBe(
      "rgba(43,43,43,0.3)",
    );
  });
});
