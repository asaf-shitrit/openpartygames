import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TvLanding } from "./TvLanding";

const CREATED = { code: "BKTZ", hostToken: "host-token" };

function stubFetch(response: () => Promise<Response>): void {
  vi.stubGlobal("fetch", vi.fn<typeof fetch>(response));
}

function startButton(): HTMLElement {
  return screen.getByRole("button", { name: /start a room/i });
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
    stubFetch(async () => Response.json(CREATED));
    const user = userEvent.setup();
    render(<TvLanding />);
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
    render(<TvLanding />);
    await user.click(startButton());
    expect(await screen.findByText("We're full tonight")).toBeTruthy();
  });

  it("reports any other room error", async () => {
    stubFetch(async () =>
      Response.json({ error: "internal" }, { status: 500 }),
    );
    const user = userEvent.setup();
    render(<TvLanding />);
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
    render(<TvLanding />);
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
    render(<TvLanding />);
    await user.click(screen.getByRole("button", { name: "Show on TV" }));
    expect(
      screen.getByRole("dialog", { name: "Show this on your TV" }),
    ).toBeTruthy();
  });
});
