import type { ReactElement } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "@opg/i18n";
import { VipGameBar } from "./VipGameBar";

/** This screen reads its copy from the dictionary, so every render needs a provider. */
function renderLocalized(ui: ReactElement) {
  return render(ui, { wrapper: LocaleProvider });
}

/** A stand-in for the key PlayerApp builds from the round on screen. */
const CLUES = "imposter:clues/:1700:";

describe("VipGameBar", () => {
  afterEach(cleanup);

  it("puts focus on the safe choice when the end-game confirm opens", () => {
    renderLocalized(
      <VipGameBar
        settledBy={CLUES}
        onSkip={vi.fn<() => void>()}
        onEnd={vi.fn<() => void>()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "End game" }));
    // The pressed button is unmounted by the swap, so without this focus falls to <body> and a
    // keyboard VIP has to tab from the top of the page to reach the confirmation they opened.
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Keep playing" }),
    );
  });

  it("skips the current part", () => {
    const onSkip = vi.fn<() => void>();
    renderLocalized(
      <VipGameBar settledBy={CLUES} onSkip={onSkip} onEnd={vi.fn<() => void>()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Skip this part" }));
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it("disables and relabels skip after one tap, so a double tap cannot skip twice", () => {
    const onSkip = vi.fn<() => void>();
    renderLocalized(
      <VipGameBar settledBy={CLUES} onSkip={onSkip} onEnd={vi.fn<() => void>()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Skip this part" }));
    const pendingButton = screen.getByRole("button", { name: "Skipping…" });
    expect(pendingButton).toHaveProperty("disabled", true);
    fireEvent.click(pendingButton);
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it("stays disabled for as long as the room takes, with no clock of its own", () => {
    const onSkip = vi.fn<() => void>();
    const { rerender } = renderLocalized(
      <VipGameBar settledBy={CLUES} onSkip={onSkip} onEnd={vi.fn<() => void>()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Skip this part" }));
    // Frames keep arriving — another player typing, a timer redraw — and none of them mean
    // the phase this VIP asked to leave has been left.
    rerender(
      <VipGameBar settledBy={CLUES} onSkip={onSkip} onEnd={vi.fn<() => void>()} />,
    );
    expect(screen.getByRole("button", { name: "Skipping…" })).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("re-enables skip once the room reports a different round", () => {
    const onSkip = vi.fn<() => void>();
    const { rerender } = renderLocalized(
      <VipGameBar settledBy={CLUES} onSkip={onSkip} onEnd={vi.fn<() => void>()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Skip this part" }));
    rerender(
      <VipGameBar
        settledBy="imposter:vote/:1900:"
        onSkip={onSkip}
        onEnd={vi.fn<() => void>()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Skip this part" }));
    expect(onSkip).toHaveBeenCalledTimes(2);
  });

  it("re-enables skip when the server refuses it instead of leaving it stuck", () => {
    const onSkip = vi.fn<() => void>();
    const { rerender } = renderLocalized(
      <VipGameBar settledBy={CLUES} onSkip={onSkip} onEnd={vi.fn<() => void>()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Skip this part" }));
    rerender(
      <VipGameBar
        settledBy={`${CLUES}rate-limited`}
        onSkip={onSkip}
        onEnd={vi.fn<() => void>()}
      />,
    );
    expect(screen.getByRole("button", { name: "Skip this part" })).toHaveProperty(
      "disabled",
      false,
    );
  });

  it("asks before ending the game and can be cancelled", () => {
    const onEnd = vi.fn<() => void>();
    renderLocalized(
      <VipGameBar settledBy={CLUES} onSkip={vi.fn<() => void>()} onEnd={onEnd} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "End game" }));
    expect(onEnd).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Keep playing" }));
    expect(screen.getByRole("button", { name: "End game" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "End game" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, end it" }));
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it("disables the irreversible confirm button after one tap", () => {
    const onEnd = vi.fn<() => void>();
    renderLocalized(
      <VipGameBar settledBy={CLUES} onSkip={vi.fn<() => void>()} onEnd={onEnd} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "End game" }));
    const confirmButton = screen.getByRole("button", { name: "Yes, end it" });
    fireEvent.click(confirmButton);
    expect(confirmButton).toHaveProperty("disabled", true);
    fireEvent.click(confirmButton);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });
});

describe("VipGameBar, in Hebrew", () => {
  afterEach(() => {
    window.localStorage.removeItem("opg:locale");
  });

  it("renders the VIP controls in Hebrew", () => {
    window.localStorage.setItem("opg:locale", "he");
    renderLocalized(
      <VipGameBar
        settledBy={CLUES}
        onSkip={vi.fn<() => void>()}
        onEnd={vi.fn<() => void>()}
      />,
    );
    expect(screen.getByText("אתם ה-VIP")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "דלגו על החלק הזה" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "סיימו משחק" })).toBeTruthy();
  });
});
