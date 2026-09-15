import { afterEach, describe, expect, it } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { PhoneScreen, Stage } from "./layout";

afterEach(cleanup);

function firstChild(container: HTMLElement): HTMLElement {
  const node = container.firstElementChild;
  if (!(node instanceof HTMLElement)) throw new Error("expected an element");
  return node;
}

describe("Stage", () => {
  it("scales the 1920x1080 surface to fit the viewport", () => {
    window.innerWidth = 960;
    window.innerHeight = 1080;
    const { container } = render(
      <Stage>
        <div>screen</div>
      </Stage>,
    );
    const inner = container.querySelector(".opg-root");
    if (!(inner instanceof HTMLElement)) throw new Error("missing stage");
    expect(inner.style.width).toBe("1920px");
    expect(inner.style.height).toBe("1080px");
    expect(inner.style.transform).toBe("scale(0.5)");
    expect(screen.getByText("screen")).toBeTruthy();
  });

  it("uses the default letterbox background and accepts an override", () => {
    const { container, rerender } = render(<Stage>x</Stage>);
    expect(firstChild(container).style.background).toBe("#2B2B2B");
    rerender(<Stage background="#000">x</Stage>);
    expect(firstChild(container).style.background).toBe("#000");
  });

  it("recomputes the scale on resize", () => {
    window.innerWidth = 1920;
    window.innerHeight = 1080;
    const { container } = render(<Stage>x</Stage>);
    const inner = container.querySelector(".opg-root");
    if (!(inner instanceof HTMLElement)) throw new Error("missing stage");
    window.innerWidth = 3840;
    window.innerHeight = 2160;
    act(() => {
      fireEvent(window, new Event("resize"));
    });
    expect(inner.style.transform).toBe("scale(2)");
  });
});

describe("PhoneScreen", () => {
  it("renders a phone column with the grid class", () => {
    const { container } = render(<PhoneScreen>phone</PhoneScreen>);
    const el = firstChild(container);
    expect(el.className).toContain("opg-root");
    expect(el.className).toContain("opg-grid-phone");
    expect(el.style.maxWidth).toBe("480px");
    expect(screen.getByText("phone")).toBeTruthy();
  });

  it("merges a custom style", () => {
    const { container } = render(
      <PhoneScreen style={{ gap: 4 }}>x</PhoneScreen>,
    );
    expect(firstChild(container).style.gap).toBe("4px");
  });
});
