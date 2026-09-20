import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LocaleProvider } from "@opg/i18n";
import { TvFullTonight } from "./TvFullTonight";

function setup() {
  render(
    <LocaleProvider>
      <TvFullTonight />
    </LocaleProvider>,
  );
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("TvFullTonight", () => {
  it("explains the room cap and what to do about it", () => {
    setup();
    expect(screen.getByText("We're full tonight")).toBeTruthy();
    expect(
      screen.getByText(
        "So many parties are running that we've hit tonight's limit on new rooms.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("Come back tomorrow")).toBeTruthy();
    expect(screen.getByText("Run your own copy, free")).toBeTruthy();
    expect(screen.getByText("Rooms already playing keep going.")).toBeTruthy();
  });

  it("renders in Hebrew", () => {
    window.localStorage.setItem("opg:locale", "he");
    setup();
    expect(screen.getByText("התמלאנו הערב")).toBeTruthy();
    expect(screen.getByText("חזרו מחר")).toBeTruthy();
    expect(screen.getByText("הריצו עותק משלכם, בחינם")).toBeTruthy();
    expect(
      screen.getByText("חדרים שכבר משחקים ממשיכים כרגיל."),
    ).toBeTruthy();
  });
});
