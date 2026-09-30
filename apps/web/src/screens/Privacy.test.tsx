import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LocaleProvider } from "@opg/i18n";
import { GITHUB_URL } from "../links";
import { Privacy } from "./Privacy";

function setup() {
  render(
    <LocaleProvider>
      <Privacy />
    </LocaleProvider>,
  );
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("Privacy", () => {
  it("lists every privacy point in English", () => {
    setup();
    expect(screen.getByText("Privacy")).toBeTruthy();
    expect(screen.getByText("No account, no profile")).toBeTruthy();
    expect(screen.getByText("No cookies, no ad trackers")).toBeTruthy();
    expect(screen.getByText("Anonymous game stats")).toBeTruthy();
    expect(screen.getByText("Your name and answers stay in the room")).toBeTruthy();
    expect(screen.getByText("Room codes and rate limits")).toBeTruthy();
    expect(screen.getByText("Questions or fixes")).toBeTruthy();
  });

  it("links to the source on GitHub", () => {
    setup();
    const link = screen.getByRole("link", { name: "Open source on GitHub" });
    expect(link.getAttribute("href")).toBe(GITHUB_URL);
  });

  it("renders in Hebrew", () => {
    window.localStorage.setItem("opg:locale", "he");
    setup();
    expect(screen.getByText("פרטיות")).toBeTruthy();
    expect(screen.getByText("בלי חשבון, בלי פרופיל")).toBeTruthy();
    expect(screen.getByText("שאלות או תיקונים")).toBeTruthy();
    expect(screen.getByRole("link", { name: "קוד פתוח ב-GitHub" })).toBeTruthy();
    expect(screen.queryByText("No account, no profile")).toBeNull();
  });
});
