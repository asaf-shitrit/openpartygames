import type { ReactElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LocaleProvider } from "@opg/i18n";
import { AppScreenView, ScreenGallery } from "./ScreenGallery";
import { SCREENS } from "./screens";
import type { AppCase } from "./screens";

// Every other screen suite in this app calls this explicitly; without it, DOM left mounted by
// an earlier case here (the "no id matches" screen-missing render) is still around when a
// later case queries the same testid.
afterEach(cleanup);

function renderGallery(search: string) {
  return render(
    <LocaleProvider>
      <ScreenGallery search={search} />
    </LocaleProvider>,
  );
}

function renderLocalized(ui: ReactElement) {
  return render(<LocaleProvider>{ui}</LocaleProvider>);
}

const firstPhone = SCREENS.find((each) => each.surface === "phone");
const firstHost = SCREENS.find((each) => each.surface === "host");
const firstAppPhone = SCREENS.find(
  (each) => each.surface === "phone" && each.kind === "app",
);
const firstAppHost = SCREENS.find(
  (each) => each.surface === "host" && each.kind === "app",
);

describe("ScreenGallery", () => {
  it("lists every screen when no id is given", () => {
    renderGallery("");
    const index = screen.getByTestId("screen-index");
    expect(index.querySelectorAll("li")).toHaveLength(SCREENS.length);
  });

  it("renders a phone screen's own game UI", () => {
    expect(firstPhone).toBeDefined();
    renderGallery(`?id=${firstPhone?.id ?? ""}`);
    expect(screen.queryByTestId("screen-missing")).toBeNull();
    expect(document.body.textContent).not.toBe("");
  });

  it("renders a host screen inside the TV stage", () => {
    expect(firstHost).toBeDefined();
    renderGallery(`?id=${firstHost?.id ?? ""}`);
    expect(screen.queryByTestId("screen-missing")).toBeNull();
    expect(document.querySelector(".opg-grid-tv")).not.toBeNull();
  });

  it("says so when the id matches nothing", () => {
    renderGallery("?id=imposter/9999");
    expect(screen.getByTestId("screen-missing").textContent).toContain("imposter/9999");
  });

  it("marks the body with the screen it is showing, which is what the suite waits for", () => {
    expect(firstPhone).toBeDefined();
    renderGallery(`?id=${firstPhone?.id ?? ""}`);
    expect(document.body.dataset.screen).toBe(firstPhone?.id);
  });

  it("renders an app-owned phone screen (the join flow, the lobby, ...)", () => {
    expect(firstAppPhone).toBeDefined();
    renderGallery(`?id=${firstAppPhone?.id ?? ""}`);
    expect(screen.queryByTestId("screen-missing")).toBeNull();
    expect(document.body.textContent).not.toBe("");
  });

  it("renders an app-owned host screen inside the TV stage", () => {
    expect(firstAppHost).toBeDefined();
    renderGallery(`?id=${firstAppHost?.id ?? ""}`);
    expect(screen.queryByTestId("screen-missing")).toBeNull();
    expect(document.querySelector(".opg-grid-tv")).not.toBeNull();
  });
});

describe("AppScreenView", () => {
  const missing: AppCase = {
    kind: "app",
    id: "app/9999",
    gameId: "app",
    label: "not a real screen",
    surface: "phone",
    appId: "not-registered",
  };

  it("says so when its appId isn't in app-screens.tsx's registry", () => {
    renderLocalized(<AppScreenView screen={missing} />);
    expect(screen.getByTestId("screen-missing").textContent).toContain("not-registered");
  });
});
