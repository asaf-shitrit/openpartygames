import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { LocaleProvider } from "@opg/i18n";
import { Crown, Tally } from "./marks";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

/** Tally reads its screen-reader count from the dictionary, so it needs a locale. */
function renderTally(ui: ReactElement) {
  return render(<LocaleProvider>{ui}</LocaleProvider>);
}

function renderHebrewTally(ui: ReactElement) {
  window.localStorage.setItem("opg:locale", "he");
  return render(<LocaleProvider>{ui}</LocaleProvider>);
}

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

describe("Tally, in Hebrew", () => {
  it("keeps the ×N mark in an LTR isolate so it does not paint as N×", () => {
    const { container } = renderHebrewTally(<Tally count={3} />);
    const mark = container.querySelector("bdi");
    expect(mark?.getAttribute("dir")).toBe("ltr");
    expect(mark?.textContent).toBe("×3");
  });
});

describe("Tally", () => {
  it("shows the crown count and a screen-reader label", () => {
    renderTally(<Tally count={3} />);
    expect(screen.getByText("×3")).toBeTruthy();
    expect(screen.getByText("3 crowns")).toBeTruthy();
  });

  it("uses the singular label for one crown", () => {
    renderTally(<Tally count={1} />);
    expect(screen.getByText("1 crown")).toBeTruthy();
  });

  it("reads its count in Hebrew, not hardcoded English", () => {
    renderHebrewTally(<Tally count={3} />);
    // The "×3" is aria-hidden and locale-independent; the read-aloud half is the whole point.
    expect(screen.getByText("×3")).toBeTruthy();
    expect(screen.queryByText("3 crowns")).toBeNull();
    expect(screen.getByText("3 כתרים")).toBeTruthy();
  });

  it("uses Hebrew's dual form for two crowns", () => {
    renderHebrewTally(<Tally count={2} />);
    expect(screen.getByText("שני כתרים")).toBeTruthy();
  });

  it("scales the marker count with size", () => {
    const { container } = renderTally(<Tally count={2} size={80} />);
    const count = screen.getByText("×2").parentElement;
    expect(count?.style.fontSize).toBe(`${Math.round(80 * 0.75)}px`);
    expect(firstChild(container)).toBeTruthy();
  });
});
