import type { ReactElement } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "@opg/i18n";
import { AppScreenView, ScreenGallery } from "./ScreenGallery";
import { preloadGameUi } from "../games";
import { LOADING_ATTRIBUTE } from "../loading";
import { SCREENS } from "./screens";
import type { AppCase } from "./screens";

// Every other screen suite in this app calls this explicitly; without it, DOM left mounted by
// an earlier case here (the "no id matches" screen-missing render) is still around when a
// later case queries the same testid.
afterEach(cleanup);

// A game's screens are a lazy chunk, and the first import of one can take longer than a
// `waitFor` allows on a busy machine. Loading them up front keeps the waits below about
// rendering, not about how loaded the CPU is.
const PRELOAD_TIMEOUT_MS = 60_000;
// Even preloaded, the swap from placeholder to screen takes a few frames, which a starved CPU
// stretches past `waitFor`'s 1s. The wait still ends the moment the screen is in.
const LAZY_LOAD_TIMEOUT_MS = 20_000;
vi.setConfig({ testTimeout: 2 * LAZY_LOAD_TIMEOUT_MS });
beforeAll(async () => {
  const gameIds = new Set(SCREENS.flatMap((each) => (each.kind === "game" ? [each.gameId] : [])));
  await Promise.all([...gameIds].map((id) => preloadGameUi(id)));
}, PRELOAD_TIMEOUT_MS);

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
const tvLobby = SCREENS.find((each) => each.kind === "app" && each.appId === "tv-lobby");

describe("ScreenGallery", () => {
  it("lists every screen when no id is given", () => {
    renderGallery("");
    const index = screen.getByTestId("screen-index");
    expect(index.querySelectorAll("li")).toHaveLength(SCREENS.length);
  });

  it("renders a phone screen's own game UI", async () => {
    expect(firstPhone).toBeDefined();
    renderGallery(`?id=${firstPhone?.id ?? ""}`);
    await waitFor(() => expect(document.body.dataset.screen).toBe(firstPhone?.id), {
      timeout: LAZY_LOAD_TIMEOUT_MS,
    });
    expect(screen.queryByTestId("screen-missing")).toBeNull();
    expect(document.body.textContent).not.toBe("");
    expect(document.body.textContent).not.toContain("Updating the game");
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

  it("marks the body with the screen it is showing, which is what the suite waits for", async () => {
    expect(firstPhone).toBeDefined();
    renderGallery(`?id=${firstPhone?.id ?? ""}`);
    await waitFor(() => expect(document.body.dataset.screen).toBe(firstPhone?.id), {
      timeout: LAZY_LOAD_TIMEOUT_MS,
    });
  });

  it("holds that mark until the game's screens are in, not while its loading message shows", async () => {
    expect(firstPhone).toBeDefined();
    renderGallery(`?id=${firstPhone?.id ?? ""}`);
    // The game's screens load on demand and say "Updating the game…" meanwhile; that has text,
    // so the layout suite would accept it as a screen. It must not be told the screen is up yet.
    expect(document.body.dataset.screen).toBeUndefined();
    await waitFor(() => expect(document.body.dataset.screen).toBe(firstPhone?.id), {
      timeout: LAZY_LOAD_TIMEOUT_MS,
    });
    expect(document.body.textContent).not.toContain("Updating the game");
  });

  it("holds that mark on an app screen until its QR code is in, not its empty placeholder", async () => {
    expect(tvLobby).toBeDefined();
    renderGallery(`?id=${tvLobby?.id ?? ""}`);
    // The QR library loads on demand behind a wordless square; measuring that square would
    // check a screen the guests never see.
    await waitFor(() => expect(document.body.dataset.screen).toBe(tvLobby?.id), {
      timeout: LAZY_LOAD_TIMEOUT_MS,
    });
    expect(document.querySelector(`[${LOADING_ATTRIBUTE}]`)).toBeNull();
    expect(document.querySelector("svg.opg-qr")).not.toBeNull();
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
