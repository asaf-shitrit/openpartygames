import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { FlipCard } from "./FlipCard";

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

function restoreMatchMedia() {
  if (matchMediaDescriptor) {
    Object.defineProperty(window, "matchMedia", matchMediaDescriptor);
  } else {
    Reflect.deleteProperty(window, "matchMedia");
  }
}

function Harness({ holdMs }: { holdMs?: number }) {
  const [flipped, setFlipped] = useState(false);
  return (
    <FlipCard
      back={<div>Face down</div>}
      front={<div>Secret role</div>}
      flipped={flipped}
      onFlip={() => setFlipped(true)}
      holdMs={holdMs}
      label="Your secret card"
    />
  );
}

function ToggleHarness() {
  const [flipped, setFlipped] = useState(false);
  return (
    <>
      <FlipCard
        back={<div>Face down</div>}
        front={<div>Secret role</div>}
        flipped={flipped}
        onFlip={() => setFlipped(true)}
        label="Your secret card"
      />
      <button type="button" onClick={() => setFlipped(false)}>
        Hide
      </button>
    </>
  );
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("FlipCard", () => {
  it("flips on a quick tap", () => {
    render(<Harness />);
    const button = screen.getByRole("button", { name: "Your secret card" });
    fireEvent.pointerDown(button);
    fireEvent.pointerUp(button);
    expect(button.getAttribute("aria-pressed")).toBe("true");
  });

  it("flips once after being held past holdMs", () => {
    const onFlip = vi.fn<() => void>();
    render(
      <FlipCard
        back={<div>Face down</div>}
        front={<div>Secret role</div>}
        flipped={false}
        onFlip={onFlip}
        holdMs={400}
        label="Your secret card"
      />,
    );
    const button = screen.getByRole("button", { name: "Your secret card" });
    fireEvent.pointerDown(button);
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(onFlip).toHaveBeenCalledTimes(1);
    fireEvent.pointerUp(button);
    expect(onFlip).toHaveBeenCalledTimes(1);
  });

  it("flips on Enter", () => {
    render(<Harness />);
    const button = screen.getByRole("button", { name: "Your secret card" });
    fireEvent.keyDown(button, { key: "Enter" });
    expect(button.getAttribute("aria-pressed")).toBe("true");
  });

  it("flips on Space", () => {
    render(<Harness />);
    const button = screen.getByRole("button", { name: "Your secret card" });
    fireEvent.keyDown(button, { key: " " });
    expect(button.getAttribute("aria-pressed")).toBe("true");
  });

  it("does not call onFlip again once already flipped", () => {
    const onFlip = vi.fn<() => void>();
    render(
      <FlipCard
        back={<div>Face down</div>}
        front={<div>Secret role</div>}
        flipped
        onFlip={onFlip}
        label="Your secret card"
      />,
    );
    const button = screen.getByRole("button", { name: "Your secret card" });
    fireEvent.pointerDown(button);
    fireEvent.pointerUp(button);
    fireEvent.keyDown(button, { key: "Enter" });
    expect(onFlip).not.toHaveBeenCalled();
  });

  it("hides the front from the accessibility tree until flipped", () => {
    render(<Harness />);
    expect(screen.queryByText("Secret role")).toBeNull();
    const button = screen.getByRole("button", { name: "Your secret card" });
    fireEvent.pointerDown(button);
    fireEvent.pointerUp(button);
    expect(screen.getByText("Secret role")).toBeTruthy();
  });

  it("renders the front, unanimated, when mounted already flipped", () => {
    const spy = vi.spyOn(Element.prototype, "animate");
    render(
      <FlipCard
        back={<div>Face down</div>}
        front={<div>Secret role</div>}
        flipped
        onFlip={() => undefined}
        label="Your secret card"
      />,
    );
    expect(screen.getByText("Secret role")).toBeTruthy();
    expect(spy).not.toHaveBeenCalled();
  });

  it("cancels the flip animation when the card is hidden again", () => {
    const animation = document.createElement("div").animate([], 0);
    const cancel = vi.fn<() => void>();
    animation.cancel = cancel;
    vi.spyOn(Element.prototype, "animate").mockReturnValue(animation);

    render(<ToggleHarness />);
    fireEvent.keyDown(screen.getByRole("button", { name: "Your secret card" }), {
      key: "Enter",
    });
    expect(screen.getByText("Secret role")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Hide" }));
    expect(cancel).toHaveBeenCalled();
    expect(screen.queryByText("Secret role")).toBeNull();
  });

  describe("under reduced motion", () => {
    afterEach(restoreMatchMedia);

    it("crossfades instead of animating a WAAPI flip", () => {
      stubReducedMotion(true);
      const spy = vi.spyOn(Element.prototype, "animate");
      render(<Harness />);
      const button = screen.getByRole("button", { name: "Your secret card" });
      fireEvent.pointerDown(button);
      fireEvent.pointerUp(button);
      expect(screen.getByText("Secret role")).toBeTruthy();
      expect(spy).not.toHaveBeenCalled();
    });

    it("renders the back face visible before the flip", () => {
      stubReducedMotion(true);
      render(<Harness />);
      expect(screen.getByText("Face down")).toBeTruthy();
      expect(screen.queryByText("Secret role")).toBeNull();
    });
  });
});
