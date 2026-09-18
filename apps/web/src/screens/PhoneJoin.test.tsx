import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PhoneJoin } from "./PhoneJoin";

function stubFetch(handler: () => Promise<Response>): void {
  vi.stubGlobal("fetch", vi.fn<typeof fetch>(handler));
}

function roomInfo(joinable: boolean, inGame = false): Response {
  return Response.json({
    code: "BKTZ",
    exists: true,
    locked: !joinable,
    inGame,
    playerCount: 1,
    joinable,
  });
}

function renderForm(onJoin = vi.fn<(code: string, name: string) => void>()) {
  render(<PhoneJoin onJoin={onJoin} />);
  return { onJoin, user: userEvent.setup() };
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("PhoneJoin", () => {
  it("requires a 4-letter room code", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    const { user } = renderForm();
    await user.click(screen.getByRole("button", { name: /join/i }));
    expect(screen.getByText("Enter the 4-letter room code.")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requires a name", async () => {
    const { user } = renderForm();
    await user.type(screen.getByLabelText("Room code"), "BKTZ");
    await user.click(screen.getByRole("button", { name: /join/i }));
    expect(screen.getByText("Enter a name.")).toBeTruthy();
  });

  it("reports a missing room with a sounds-alike hint", async () => {
    stubFetch(async () =>
      Response.json({ error: "not-found" }, { status: 404 }),
    );
    const { user } = renderForm();
    await user.type(screen.getByLabelText("Room code"), "BKTZ");
    await user.type(screen.getByLabelText("Your name"), "Priya");
    await user.click(screen.getByRole("button", { name: /join/i }));
    await waitFor(() =>
      expect(screen.getByText("That room code doesn't exist.")).toBeTruthy(),
    );
    expect(
      screen.getByText(
        "Sounds alike: B/D/P/T/V/Z, M/N, S/F. Ask them to say it again.",
      ),
    ).toBeTruthy();
  });

  it("reports too many tries when the join limiter kicks in", async () => {
    stubFetch(async () =>
      Response.json({ error: "rate-limited" }, { status: 429 }),
    );
    const { user } = renderForm();
    await user.type(screen.getByLabelText("Room code"), "BKTZ");
    await user.type(screen.getByLabelText("Your name"), "Priya");
    await user.click(screen.getByRole("button", { name: /join/i }));
    await waitFor(() =>
      expect(
        screen.getByText("Too many tries. Wait a moment and try again."),
      ).toBeTruthy(),
    );
  });

  it("reports a room that is gone", async () => {
    stubFetch(async () =>
      Response.json({
        code: "BKTZ",
        exists: false,
        locked: false,
        inGame: false,
        playerCount: 0,
        joinable: false,
      }),
    );
    const { user } = renderForm();
    await user.type(screen.getByLabelText("Room code"), "BKTZ");
    await user.type(screen.getByLabelText("Your name"), "Priya");
    await user.click(screen.getByRole("button", { name: /join/i }));
    await waitFor(() =>
      expect(screen.getByText("That room code doesn't exist.")).toBeTruthy(),
    );
  });

  it("reports a full or locked room", async () => {
    stubFetch(async () => roomInfo(false));
    const { user } = renderForm();
    await user.type(screen.getByLabelText("Room code"), "BKTZ");
    await user.type(screen.getByLabelText("Your name"), "Priya");
    await user.click(screen.getByRole("button", { name: /join/i }));
    await waitFor(() =>
      expect(screen.getByText("That room is full or locked.")).toBeTruthy(),
    );
  });

  it("reports an unreachable room", async () => {
    stubFetch(async () => {
      throw new Error("offline");
    });
    const { user } = renderForm();
    await user.type(screen.getByLabelText("Room code"), "BKTZ");
    await user.type(screen.getByLabelText("Your name"), "Priya");
    await user.click(screen.getByRole("button", { name: /join/i }));
    await waitFor(() =>
      expect(
        screen.getByText("Could not reach the room. Check your connection."),
      ).toBeTruthy(),
    );
  });

  it("joins with the normalized code and trimmed name", async () => {
    stubFetch(async () => roomInfo(true));
    const { onJoin, user } = renderForm();
    await user.type(screen.getByLabelText("Room code"), "bktz");
    await user.type(screen.getByLabelText("Your name"), "Priya");
    await user.click(screen.getByRole("button", { name: /join/i }));
    await waitFor(() => expect(onJoin).toHaveBeenCalledWith("BKTZ", "Priya"));
  });

  it("shows an error passed by the parent", () => {
    render(
      <PhoneJoin
        error="Server said no"
        onJoin={vi.fn<(code: string, name: string) => void>()}
      />,
    );
    expect(screen.getByText("Server said no")).toBeTruthy();
  });

  it("disables the button while busy", () => {
    render(
      <PhoneJoin busy onJoin={vi.fn<(code: string, name: string) => void>()} />,
    );
    expect(screen.getByRole("button", { name: /joining/i })).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("hints where the code comes from without naming a TV", () => {
    renderForm();
    expect(screen.getByText("Ask someone in the room")).toBeTruthy();
    expect(screen.queryByText(/TV/)).toBeNull();
  });

  it("types into the name field when it is clicked, not the room code", async () => {
    const { user } = renderForm();
    const code = screen.getByLabelText("Room code");
    await user.type(code, "BKTZ");
    const name = screen.getByLabelText("Your name");
    await user.click(name);
    await user.type(name, "Maya");
    expect(name).toHaveProperty("value", "Maya");
    expect(code).toHaveProperty("value", "BKTZ");
  });
});
