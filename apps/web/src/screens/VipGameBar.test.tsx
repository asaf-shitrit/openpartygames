import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VipGameBar } from "./VipGameBar";

describe("VipGameBar", () => {
  afterEach(cleanup);

  it("skips the current part", () => {
    const onSkip = vi.fn<() => void>();
    render(<VipGameBar onSkip={onSkip} onEnd={vi.fn<() => void>()} />);
    fireEvent.click(screen.getByRole("button", { name: "Skip this part" }));
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it("asks before ending the game and can be cancelled", () => {
    const onEnd = vi.fn<() => void>();
    render(<VipGameBar onSkip={vi.fn<() => void>()} onEnd={onEnd} />);
    fireEvent.click(screen.getByRole("button", { name: "End game" }));
    expect(onEnd).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Keep playing" }));
    expect(screen.getByRole("button", { name: "End game" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "End game" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, end it" }));
    expect(onEnd).toHaveBeenCalledTimes(1);
  });
});
