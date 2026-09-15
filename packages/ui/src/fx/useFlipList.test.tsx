import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { useFlipList } from "./useFlipList";

const matchMediaDescriptor = Object.getOwnPropertyDescriptor(
  window,
  "matchMedia",
);

function stubReducedMotion(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (media: string) => ({
      media,
      matches,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }),
  });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  if (matchMediaDescriptor) {
    Object.defineProperty(window, "matchMedia", matchMediaDescriptor);
  } else {
    Reflect.deleteProperty(window, "matchMedia");
  }
});

function setTop(el: HTMLElement, top: number) {
  Object.defineProperty(el, "offsetTop", { configurable: true, value: top });
}

interface ListProps {
  order: string[];
  tops: Record<string, number>;
}

function List({ order, tops }: ListProps) {
  const { register } = useFlipList(order);
  return (
    <div>
      {order.map((id) => (
        <div
          key={id}
          data-id={id}
          ref={(el) => {
            const registered = register(id);
            registered(el);
            if (el) setTop(el, tops[id] ?? 0);
          }}
        />
      ))}
    </div>
  );
}

describe("useFlipList", () => {
  it("does not animate on first mount", () => {
    stubReducedMotion(false);
    const spy = vi.spyOn(Element.prototype, "animate");
    render(<List order={["a", "b"]} tops={{ a: 0, b: 60 }} />);
    expect(spy).not.toHaveBeenCalled();
  });

  it("animates a reorder with the delta between old and new offsetTop", () => {
    stubReducedMotion(false);
    const { rerender } = render(
      <List order={["a", "b"]} tops={{ a: 0, b: 60 }} />,
    );
    const spy = vi.spyOn(Element.prototype, "animate");
    rerender(<List order={["b", "a"]} tops={{ a: 60, b: 0 }} />);

    expect(spy).toHaveBeenCalledTimes(2);
    const deltas = spy.mock.calls.map((call) => {
      const keyframes = call[0];
      const first = Array.isArray(keyframes) ? keyframes[0] : undefined;
      return first?.translate;
    });
    expect(deltas).toEqual(
      expect.arrayContaining(["0 60px", "0 -60px"]),
    );
  });

  it("does not animate under reduced motion", () => {
    stubReducedMotion(true);
    const { rerender } = render(
      <List order={["a", "b"]} tops={{ a: 0, b: 60 }} />,
    );
    const spy = vi.spyOn(Element.prototype, "animate");
    rerender(<List order={["b", "a"]} tops={{ a: 60, b: 0 }} />);
    expect(spy).not.toHaveBeenCalled();
  });
});
