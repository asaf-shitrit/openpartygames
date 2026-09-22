import type { ReactNode } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "@opg/i18n";
import { SoundProvider } from "@opg/ui";
import type { CueHandle, SoundEngine, SoundStatus } from "@opg/ui";
import { LANDING_GAMES } from "../games";
import { TvLanding } from "./TvLanding";

class FakeEngine implements SoundEngine {
  unlockCount = 0;

  status(): SoundStatus {
    return "running";
  }

  subscribe(): () => void {
    return () => {
      /* status never changes */
    };
  }

  unlock(): void {
    this.unlockCount += 1;
  }

  setMuted(): void {
    /* nothing to mute */
  }

  preload(): void {
    /* no samples */
  }

  play(): CueHandle {
    return {
      stop() {
        /* nothing is playing */
      },
    };
  }

  playMusic(): void {
    /* no music in tests */
  }

  stopAll(): void {
    /* nothing is playing */
  }
}

const CREATED = { code: "BKTZ", hostToken: "host-token" };

function stubFetch(response: () => Promise<Response>): void {
  vi.stubGlobal("fetch", vi.fn<typeof fetch>(response));
}

function startButton(): HTMLElement {
  return screen.getByRole("button", { name: /start a room/i });
}

function bodyText(body: BodyInit | null | undefined): Promise<string> {
  return new Response(body).text();
}

function renderLanding(children: ReactNode = <TvLanding />) {
  return render(<LocaleProvider>{children}</LocaleProvider>);
}

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
  window.history.pushState(null, "", "/");
});

describe("TvLanding", () => {
  it("stores the host token and opens the host screen", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (_input, init) => {
        expect(JSON.parse(await bodyText(init?.body))).toEqual({
          sharedScreen: true,
          contentLanguage: "en",
        });
        return Response.json(CREATED);
      }),
    );
    const user = userEvent.setup();
    renderLanding();
    await user.click(startButton());
    await waitFor(() =>
      expect(localStorage.getItem("opg:host:BKTZ")).toBe("host-token"),
    );
    expect(window.location.pathname).toBe("/host/BKTZ");
  });

  it("shows the full-tonight screen when the daily cap is hit", async () => {
    stubFetch(async () =>
      Response.json({ error: "full-tonight" }, { status: 503 }),
    );
    const user = userEvent.setup();
    renderLanding();
    await user.click(startButton());
    expect(await screen.findByText("We're full tonight")).toBeTruthy();
  });

  it("reports any other room error", async () => {
    stubFetch(async () =>
      Response.json({ error: "internal" }, { status: 500 }),
    );
    const user = userEvent.setup();
    renderLanding();
    await user.click(startButton());
    expect(
      await screen.findByText("Could not start a room. Try again in a moment."),
    ).toBeTruthy();
  });

  it("explains when the browser blocks local storage", async () => {
    stubFetch(async () => Response.json(CREATED));
    vi.stubGlobal("localStorage", {
      setItem: () => {
        throw new Error("blocked");
      },
    });
    const user = userEvent.setup();
    renderLanding();
    await user.click(startButton());
    expect(
      await screen.findByText(
        "This browser blocked local storage, so the room cannot be hosted here.",
      ),
    ).toBeTruthy();
    expect(window.location.pathname).toBe("/");
  });

  it("shows the Show on TV chip in the header and opens the guide", async () => {
    const user = userEvent.setup();
    renderLanding();
    await user.click(screen.getByRole("button", { name: "Show on TV" }));
    expect(
      screen.getByRole("dialog", { name: "Show this on your TV" }),
    ).toBeTruthy();
  });

  it("shows every landing game's name, including a third game", () => {
    renderLanding();
    expect(LANDING_GAMES.length).toBeGreaterThanOrEqual(3);
    for (const game of LANDING_GAMES) {
      expect(screen.getByText(game.name)).toBeTruthy();
    }
  });

  it("unlocks sound inside the Start click", async () => {
    stubFetch(async () => Response.json(CREATED));
    const engine = new FakeEngine();
    const user = userEvent.setup();
    renderLanding(
      <SoundProvider engine={engine}>
        <TvLanding />
      </SoundProvider>,
    );
    await user.click(startButton());
    expect(engine.unlockCount).toBe(1);
  });

  it("renders in Hebrew when the locale is Hebrew", () => {
    window.localStorage.setItem("opg:locale", "he");
    try {
      renderLanding();
      expect(screen.getByText("משחקי מסיבות בשבילכם")).toBeTruthy();
      expect(
        screen.getByRole("button", { name: "הציגו בטלוויזיה" }),
      ).toBeTruthy();
    } finally {
      window.localStorage.removeItem("opg:locale");
    }
  });
});
