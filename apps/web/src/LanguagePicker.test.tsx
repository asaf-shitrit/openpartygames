import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { en, LocaleProvider } from "@opg/i18n";
import { LanguagePicker } from "./LanguagePicker";

function renderPicker() {
  return render(
    <LocaleProvider>
      <LanguagePicker t={en} />
    </LocaleProvider>,
  );
}

describe("LanguagePicker", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.dir = "";
  });
  afterEach(cleanup);

  it("names each language in its own language", () => {
    renderPicker();
    expect(screen.getByRole("button", { name: "English" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "עברית" })).toBeTruthy();
  });

  it("marks the current language pressed, not just coloured", () => {
    renderPicker();
    expect(
      screen.getByRole("button", { name: "English" }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen.getByRole("button", { name: "עברית" }).getAttribute("aria-pressed"),
    ).toBe("false");
  });

  it("switches the document to Hebrew and right-to-left", async () => {
    const user = userEvent.setup();
    renderPicker();
    await user.click(screen.getByRole("button", { name: "עברית" }));
    expect(document.documentElement.lang).toBe("he");
    expect(document.documentElement.dir).toBe("rtl");
    expect(
      screen.getByRole("button", { name: "עברית" }).getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("remembers the choice for the next visit", async () => {
    const user = userEvent.setup();
    renderPicker();
    await user.click(screen.getByRole("button", { name: "עברית" }));
    cleanup();
    renderPicker();
    expect(
      screen.getByRole("button", { name: "עברית" }).getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("every tap target clears 44px", () => {
    renderPicker();
    for (const name of ["English", "עברית"]) {
      const style = screen.getByRole("button", { name }).style;
      expect(Number.parseInt(style.minHeight, 10)).toBeGreaterThanOrEqual(44);
      expect(Number.parseInt(style.minWidth, 10)).toBeGreaterThanOrEqual(44);
    }
  });
});
