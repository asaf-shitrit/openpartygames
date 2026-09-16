import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { FxIn } from "./FxIn";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function spyAnimate() {
  const animate = vi
    .spyOn(HTMLElement.prototype, "animate")
    .mockImplementation(() => new Animation());
  return { animate };
}

describe("FxIn", () => {
  it("plays the preset with its delay when mounted live", () => {
    const { animate } = spyAnimate();
    render(
      <FxIn live preset="pop" delayMs={150}>
        <span>Hello</span>
      </FxIn>,
    );
    expect(screen.getByText("Hello")).toBeTruthy();
    expect(animate).toHaveBeenCalledTimes(1);
    expect(animate.mock.calls[0]?.[1]).toMatchObject({ delay: 150 });
  });

  it("renders settled without animating when not live", () => {
    const { animate } = spyAnimate();
    render(
      <FxIn live={false} preset="slam">
        <span>Settled</span>
      </FxIn>,
    );
    expect(screen.getByText("Settled")).toBeTruthy();
    expect(animate).not.toHaveBeenCalled();
  });

  it("never replays when live changes after mount", () => {
    const { animate } = spyAnimate();
    const { rerender } = render(
      <FxIn live={false} preset="pop">
        <span>Card</span>
      </FxIn>,
    );
    rerender(
      <FxIn live preset="pop">
        <span>Card</span>
      </FxIn>,
    );
    expect(animate).not.toHaveBeenCalled();
  });
});
