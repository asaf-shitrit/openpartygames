// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { initialLocale, LocaleProvider, useLocale } from "./LocaleProvider";

function setLocation(search: string): void {
  window.history.replaceState(null, "", `/${search}`);
}

function setLang(lang: string): void {
  Object.defineProperty(window.navigator, "language", {
    configurable: true,
    value: lang,
  });
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  setLocation("");
  setLang("en-US");
  vi.unstubAllGlobals();
});

describe("initialLocale", () => {
  it("prefers ?lang= over everything else", () => {
    window.localStorage.setItem("opg:locale", "en");
    setLang("en-US");
    setLocation("?lang=he");
    expect(initialLocale()).toBe("he");
  });

  it("ignores an unknown ?lang= value", () => {
    setLocation("?lang=fr");
    setLang("en-US");
    expect(initialLocale()).toBe("en");
  });

  it("falls back to a stored locale when there is no query param", () => {
    window.localStorage.setItem("opg:locale", "he");
    setLang("en-US");
    expect(initialLocale()).toBe("he");
  });

  it("ignores an unknown stored value", () => {
    window.localStorage.setItem("opg:locale", "fr");
    setLang("en-US");
    expect(initialLocale()).toBe("en");
  });

  it("survives storage throwing (private browsing) and falls back to English", () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    setLang("he-IL");
    expect(initialLocale()).toBe("en");
    getItem.mockRestore();
  });

  // Direction is set on the document, so an untranslated screen in a right-to-left layout
  // is what a Hebrew browser would otherwise get across most of the product. Until every
  // surface is translated, Hebrew has to be chosen rather than detected.
  it("does not follow the browser's language on its own", () => {
    setLang("he-IL");
    expect(initialLocale()).toBe("en");
  });

  it("still follows an explicit choice from a Hebrew browser", () => {
    setLang("he-IL");
    window.localStorage.setItem("opg:locale", "he");
    expect(initialLocale()).toBe("he");
  });
});

function LocaleProbe() {
  const { locale, dir, t, setLocale } = useLocale();
  return (
    <div>
      <div data-testid="locale">{locale}</div>
      <div data-testid="dir">{dir}</div>
      <div data-testid="text">{t.join.join}</div>
      <button type="button" onClick={() => setLocale("he")}>
        Switch
      </button>
    </div>
  );
}

describe("LocaleProvider", () => {
  it("starts from initialLocale and sets <html> lang/dir", () => {
    setLang("en-US");
    render(
      <LocaleProvider>
        <LocaleProbe />
      </LocaleProvider>,
    );
    expect(screen.getByTestId("locale").textContent).toBe("en");
    expect(screen.getByTestId("dir").textContent).toBe("ltr");
    expect(document.documentElement.lang).toBe("en");
    expect(document.documentElement.dir).toBe("ltr");
  });

  it("switches locale, direction and the dictionary on setLocale, and persists it", async () => {
    const user = userEvent.setup();
    render(
      <LocaleProvider>
        <LocaleProbe />
      </LocaleProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Switch" }));
    expect(screen.getByTestId("locale").textContent).toBe("he");
    expect(screen.getByTestId("dir").textContent).toBe("rtl");
    expect(screen.getByTestId("text").textContent).toBe("הצטרפו");
    expect(document.documentElement.dir).toBe("rtl");
    expect(window.localStorage.getItem("opg:locale")).toBe("he");
  });

  it("throws when useLocale is called outside a provider", () => {
    expect(() => render(<Bare />)).toThrow("useLocale must be used within a LocaleProvider");
  });
});

function Bare() {
  useLocale();
  return null;
}
