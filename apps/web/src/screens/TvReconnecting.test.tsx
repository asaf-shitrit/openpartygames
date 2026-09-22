import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LocaleProvider } from "@opg/i18n";
import { TvReconnecting } from "./TvReconnecting";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("TvReconnecting", () => {
  it("announces the reconnect and reassures the room", () => {
    const { container } = render(
      <LocaleProvider>
        <TvReconnecting />
      </LocaleProvider>,
    );
    expect(screen.getByText("Reconnecting…")).toBeTruthy();
    expect(
      screen.getByText("Hang tight. The game and scores are safe."),
    ).toBeTruthy();
    const overlay = container.querySelector("output");
    expect(overlay).not.toBeNull();
    expect(overlay?.getAttribute("aria-live")).toBe("polite");
  });

  it("renders in Hebrew", () => {
    window.localStorage.setItem("opg:locale", "he");
    render(
      <LocaleProvider>
        <TvReconnecting />
      </LocaleProvider>,
    );
    expect(screen.getByText("מתחברים מחדש…")).toBeTruthy();
    expect(
      screen.getByText("תחזיקו מעמד. המשחק והניקוד שמורים."),
    ).toBeTruthy();
  });
});
