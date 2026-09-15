import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import type { AvatarId } from "@opg/protocol";
import { Avatar, AVATAR_FILLS } from "./Avatar";

afterEach(cleanup);

const AVATAR_IDS = [
  "blob",
  "toast",
  "drop",
  "cloud",
  "star",
  "cat",
  "ghost",
  "bean",
  "robot",
  "mushroom",
  "egg",
  "sun",
] satisfies AvatarId[];

function firstChild(container: HTMLElement): HTMLElement | SVGElement {
  const node = container.firstElementChild;
  if (!(node instanceof HTMLElement) && !(node instanceof SVGElement)) {
    throw new Error("expected an element");
  }
  return node;
}

describe("AVATAR_FILLS", () => {
  it("has a color for every avatar id", () => {
    for (const id of AVATAR_IDS) {
      expect(AVATAR_FILLS[id]).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });
});

describe("Avatar", () => {
  it("renders an open seat with a plus icon when id is null", () => {
    const { container } = render(<Avatar id={null} />);
    const seat = firstChild(container);
    expect(seat.getAttribute("aria-hidden")).toBe("true");
    expect(seat.querySelector("svg")).toBeTruthy();
  });

  it("labels the open seat when alt is given", () => {
    const { container } = render(<Avatar id={null} alt="Pick a seat" />);
    const seat = firstChild(container);
    expect(seat.getAttribute("role")).toBe("img");
    expect(seat.getAttribute("aria-label")).toBe("Pick a seat");
    expect(seat.getAttribute("aria-hidden")).toBeNull();
  });

  it("renders every doodle avatar", () => {
    for (const id of AVATAR_IDS) {
      const { container, unmount } = render(<Avatar id={id} />);
      const svg = firstChild(container);
      expect(svg.getAttribute("viewBox")).toBe("0 0 100 100");
      expect(svg.children.length).toBeGreaterThan(0);
      unmount();
    }
  });

  it("uses the thick stroke below 90px and the thin one at 90px", () => {
    const { container, rerender } = render(<Avatar id="blob" size={72} />);
    expect(
      firstChild(container).querySelector("[stroke-width='5']"),
    ).toBeTruthy();
    rerender(<Avatar id="blob" size={90} />);
    expect(
      firstChild(container).querySelector("[stroke-width='4']"),
    ).toBeTruthy();
  });

  it("is decorative unless alt is provided", () => {
    const { container, rerender } = render(<Avatar id="cat" />);
    const svg = firstChild(container);
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    rerender(<Avatar id="cat" alt="Cat avatar" />);
    expect(svg.getAttribute("role")).toBe("img");
    expect(svg.getAttribute("aria-label")).toBe("Cat avatar");
  });

  it("dims a taken avatar when faded", () => {
    const { container } = render(<Avatar id="sun" faded />);
    expect(firstChild(container).style.opacity).toBe("0.4");
  });

  it("applies a custom size and style", () => {
    const { container } = render(
      <Avatar id="egg" size={120} style={{ margin: 4 }} />,
    );
    const svg = firstChild(container);
    expect(svg.getAttribute("width")).toBe("120");
    expect(svg.style.margin).toBe("4px");
  });
});
