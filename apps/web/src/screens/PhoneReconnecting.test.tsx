import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LocaleProvider } from "@opg/i18n";
import { PhoneReconnecting } from "./PhoneReconnecting";

function setup(props: Parameters<typeof PhoneReconnecting>[0] = {}) {
  render(
    <LocaleProvider>
      <PhoneReconnecting {...props} />
    </LocaleProvider>,
  );
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("PhoneReconnecting", () => {
  it("reassures the player and offers a reload", () => {
    setup({ name: "Priya" });
    expect(screen.getByText("Reconnecting…")).toBeTruthy();
    expect(
      screen.getByText("Your seat and score are safe. Hang on a sec."),
    ).toBeTruthy();
    expect(
      screen.getByText("Still stuck after 30 seconds? Reload the page."),
    ).toBeTruthy();
    expect(screen.getByText("Reload")).toBeTruthy();
    expect(screen.getByText("Priya")).toBeTruthy();
  });

  it("falls back to a generic name", () => {
    setup();
    expect(screen.getByText("You")).toBeTruthy();
  });

  it("renders in Hebrew", () => {
    window.localStorage.setItem("opg:locale", "he");
    setup({ name: "Priya" });
    expect(screen.getByText("מתחברים מחדש…")).toBeTruthy();
    expect(
      screen.getByText("המקום והניקוד שלכם שמורים. רגע אחד."),
    ).toBeTruthy();
    expect(screen.getByText("רענון")).toBeTruthy();
  });
});
