import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { makeHostView, makePlayer } from "./fixtures/room";
import { TvLobby } from "./TvLobby";

afterEach(cleanup);

describe("TvLobby", () => {
  it("shows the room code and a QR code svg", () => {
    const { container } = render(
      <TvLobby
        view={makeHostView({
          players: [makePlayer({ id: "p1", name: "Priya", isVip: true })],
        })}
      />,
    );
    expect(screen.getByText("BKTZ")).toBeTruthy();
    expect(screen.getByText("1 of 8 players")).toBeTruthy();
    const qrTitle = container.querySelector("svg title");
    expect(qrTitle?.textContent).toContain("/BKTZ");
    expect(container.querySelector(".opg-qr")).not.toBeNull();
  });

  it("shows the VIP callout and open seats", () => {
    render(
      <TvLobby
        view={makeHostView({
          players: [makePlayer({ id: "p1", name: "Priya", isVip: true })],
          vipId: "p1",
        })}
      />,
    );
    expect(
      screen.getByText("is the VIP and picks the game from their phone"),
    ).toBeTruthy();
    expect(screen.getAllByText("Open seat").length).toBe(7);
  });

  it("waits for the first player when nobody has joined", () => {
    render(<TvLobby view={makeHostView({ players: [], vipId: null })} />);
    expect(screen.getByText("Waiting for the first player to join")).toBeTruthy();
  });

  it("tells players to open the address this screen is served from", () => {
    render(<TvLobby view={makeHostView({ players: [], vipId: null })} />);
    expect(screen.getByText(window.location.host)).toBeTruthy();
    expect(screen.queryByText("openpartygames.org")).toBeNull();
  });
});
