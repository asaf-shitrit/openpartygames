import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LocaleProvider } from "@opg/i18n";
import { PhoneKicked } from "./PhoneKicked";

function setup(props: Parameters<typeof PhoneKicked>[0] = {}) {
  render(
    <LocaleProvider>
      <PhoneKicked {...props} />
    </LocaleProvider>,
  );
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("PhoneKicked", () => {
  it("names who removed you when a name is given", () => {
    setup({ name: "Priya" });
    expect(screen.getByText("You were removed")).toBeTruthy();
    expect(
      screen.getByText("Priya, the VIP removed you from the room."),
    ).toBeTruthy();
  });

  it("falls back to an anonymous message with no name", () => {
    setup();
    expect(
      screen.getByText("The VIP removed you from the room."),
    ).toBeTruthy();
  });

  it("offers a way to join a new room", () => {
    setup();
    expect(screen.getByText("Join a new room")).toBeTruthy();
  });

  it("renders in Hebrew", () => {
    window.localStorage.setItem("opg:locale", "he");
    setup({ name: "Priya" });
    expect(screen.getByText("הוצאתם מהחדר")).toBeTruthy();
    expect(
      screen.getByText("Priya, ה-VIP הוציא/ה אתכם מהחדר."),
    ).toBeTruthy();
    expect(screen.getByText("הצטרפו לחדר חדש")).toBeTruthy();
  });
});
