import type { ReactNode } from "react";
import { LocaleProvider } from "@opg/i18n";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import DevRoute from "./DevRoute";

/** These dev screens render real game UI, which reads its copy from the dictionary. */
function renderLocalized(ui: ReactNode) {
  return render(<LocaleProvider>{ui}</LocaleProvider>);
}

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("DevRoute", () => {
  it("renders the sound board in sounds mode", () => {
    renderLocalized(<DevRoute mode="sounds" />);
    expect(screen.getByText("Sound board")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Unlock sound" })).toBeTruthy();
  });

  it("renders the moment player in moments mode", () => {
    renderLocalized(<DevRoute mode="moments" />);
    expect(screen.getByText("Moments")).toBeTruthy();
  });
});
