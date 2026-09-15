import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import type { IconName } from "./Icon";
import { Icon } from "./Icon";

afterEach(cleanup);

const ICON_NAMES = [
  "sound",
  "sound-off",
  "check",
  "pencil",
  "lock",
  "eye-off",
  "arrow-right",
  "plus",
  "reload",
  "mask",
  "cards",
  "monitor",
  "kick",
] satisfies IconName[];

function firstChild(container: HTMLElement): HTMLElement | SVGElement {
  const node = container.firstElementChild;
  if (!(node instanceof HTMLElement) && !(node instanceof SVGElement)) {
    throw new Error("expected an element");
  }
  return node;
}

describe("Icon", () => {
  it("renders every icon name with children", () => {
    for (const name of ICON_NAMES) {
      const { container, unmount } = render(<Icon name={name} />);
      const svg = firstChild(container);
      expect(svg.tagName.toLowerCase()).toBe("svg");
      expect(svg.children.length).toBeGreaterThan(0);
      unmount();
    }
  });

  it("is hidden from assistive tech without a title", () => {
    const { container } = render(<Icon name="check" />);
    const svg = firstChild(container);
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.getAttribute("role")).toBeNull();
    expect(svg.querySelector("title")).toBeNull();
  });

  it("exposes a labelled image when given a title", () => {
    const { container } = render(<Icon name="lock" title="Locked" />);
    const svg = firstChild(container);
    expect(svg.getAttribute("role")).toBe("img");
    expect(svg.getAttribute("aria-hidden")).toBeNull();
    expect(svg.querySelector("title")?.textContent).toBe("Locked");
  });

  it("applies size, color, stroke width and style", () => {
    const { container } = render(
      <Icon
        name="sound"
        size={40}
        color="#123456"
        strokeWidth={3}
        style={{ margin: 5 }}
      />,
    );
    const svg = firstChild(container);
    expect(svg.getAttribute("width")).toBe("40");
    expect(svg.getAttribute("height")).toBe("40");
    expect(svg.getAttribute("stroke")).toBe("#123456");
    expect(svg.getAttribute("stroke-width")).toBe("3");
    expect(svg.style.margin).toBe("5px");
    expect(svg.style.flexShrink).toBe("0");
  });

  it("uses currentColor and the spec stroke width by default", () => {
    const { container } = render(<Icon name="check" />);
    const svg = firstChild(container);
    expect(svg.getAttribute("stroke")).toBe("currentColor");
    expect(svg.getAttribute("stroke-width")).toBe("3");
  });
});
