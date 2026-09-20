import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "@opg/i18n";
import { PhoneLanding } from "./PhoneLanding";

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

function renderLanding(): void {
  render(
    <LocaleProvider>
      <PhoneLanding />
    </LocaleProvider>,
  );
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

describe("PhoneLanding", () => {
  it("requests a no-shared-screen room and joins as the first player", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (_input, init) => {
        expect(JSON.parse(await bodyText(init?.body))).toEqual({
          sharedScreen: false,
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
    expect(window.location.pathname).toBe("/BKTZ");
  });

  it("sends a join tap to the join form", async () => {
    const user = userEvent.setup();
    renderLanding();
    await user.click(screen.getByRole("button", { name: /join a room/i }));
    expect(window.location.pathname).toBe("/join");
  });

  it("shows the full-tonight message when the daily cap is hit", async () => {
    stubFetch(async () =>
      Response.json({ error: "full-tonight" }, { status: 503 }),
    );
    const user = userEvent.setup();
    renderLanding();
    await user.click(startButton());
    expect(
      await screen.findByText("We're full tonight. Come back tomorrow."),
    ).toBeTruthy();
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

  it("offers the TV as an option without naming a mode by what is missing", () => {
    renderLanding();
    expect(
      screen.getByText(
        "Playing with a TV or laptop? Open this page there for the big screen.",
      ),
    ).toBeTruthy();
  });

  it("renders in Hebrew when the locale is Hebrew", () => {
    window.localStorage.setItem("opg:locale", "he");
    try {
      renderLanding();
      expect(screen.getByText("משחקי מסיבות בשבילכם")).toBeTruthy();
      expect(
        screen.getByRole("button", { name: "הצטרפו לחדר" }),
      ).toBeTruthy();
    } finally {
      window.localStorage.removeItem("opg:locale");
    }
  });
});
