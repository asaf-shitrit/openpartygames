import type { ReactElement } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "@opg/i18n";
import { VipGameBar } from "./VipGameBar";

/** This screen reads its copy from the dictionary, so every render needs a provider. */
function renderLocalized(ui: ReactElement) {
  return render(ui, { wrapper: LocaleProvider });
}

describe("VipGameBar", () => {
  afterEach(cleanup);

  it("skips the current part", () => {
    const onSkip = vi.fn<() => void>();
    renderLocalized(<VipGameBar onSkip={onSkip} onEnd={vi.fn<() => void>()} />);
    fireEvent.click(screen.getByRole("button", { name: "Skip this part" }));
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it("asks before ending the game and can be cancelled", () => {
    const onEnd = vi.fn<() => void>();
    renderLocalized(<VipGameBar onSkip={vi.fn<() => void>()} onEnd={onEnd} />);
    fireEvent.click(screen.getByRole("button", { name: "End game" }));
    expect(onEnd).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Keep playing" }));
    expect(screen.getByRole("button", { name: "End game" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "End game" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, end it" }));
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
      <VipGameBar onSkip={vi.fn<() => void>()} onEnd={vi.fn<() => void>()} />,
    );
    expect(screen.getByText("אתם ה-VIP")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "דלגו על החלק הזה" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "סיימו משחק" })).toBeTruthy();
  });
});
