import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PhoneStrip, PlayerChip, TvHeader } from "./chrome";

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("TvHeader", () => {
  it("renders the brand variant with the sound chip", () => {
    render(<TvHeader variant="brand" />);
    expect(screen.getByText("OpenPartyGames")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sound on" })).toBeTruthy();
    expect(screen.queryByText("Room")).toBeNull();
  });

  it("shows the room chip when a code is present", () => {
    render(<TvHeader variant="brand" roomCode="ABCD" />);
    expect(screen.getByText("Room")).toBeTruthy();
    expect(screen.getByText("ABCD")).toBeTruthy();
  });

  it("renders the game variant with name and progress", () => {
    render(
      <TvHeader
        variant="game"
        gameName="Quip Clash"
        progress="Word 1 of 3"
        roomCode="WXYZ"
      />,
    );
    expect(screen.getByText("Quip Clash")).toBeTruthy();
    expect(screen.getByText("Word 1 of 3")).toBeTruthy();
    expect(screen.getByText("WXYZ")).toBeTruthy();
  });

  it("omits progress and room code when they are absent", () => {
    render(<TvHeader variant="game" gameName="Quip Clash" />);
    expect(screen.getByText("Quip Clash")).toBeTruthy();
    expect(screen.queryByText("Room")).toBeNull();
  });

  it("toggles the sound setting from the chip", async () => {
    render(<TvHeader variant="brand" />);
    await userEvent.click(screen.getByRole("button", { name: "Sound on" }));
    expect(screen.getByText("Sound off")).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Sound off" })
        .getAttribute("aria-pressed"),
    ).toBe("false");
  });

  it("starts muted when the stored setting says so", () => {
    localStorage.setItem("opg:muted", "1");
    render(<TvHeader variant="brand" />);
    expect(screen.getByText("Sound off")).toBeTruthy();
  });
});

describe("PhoneStrip", () => {
  it("renders the game name, progress and right slot", () => {
    render(
      <PhoneStrip
        gameName="Quip Clash"
        progress="Round 2"
        right={<span>timer</span>}
      />,
    );
    expect(screen.getByText("Quip Clash")).toBeTruthy();
    expect(screen.getByText("Round 2")).toBeTruthy();
    expect(screen.getByText("timer")).toBeTruthy();
  });

  it("renders without progress or right slot", () => {
    render(<PhoneStrip gameName="Solo" />);
    expect(screen.getByText("Solo")).toBeTruthy();
  });
});

describe("PlayerChip", () => {
  it("labels the avatar and shows the player name", () => {
    render(<PlayerChip name="Nia" avatar="cat" />);
    expect(screen.getByText("Nia")).toBeTruthy();
    expect(screen.getByRole("img", { name: "Nia's avatar" })).toBeTruthy();
  });

  it("renders a decorative avatar when there is no avatar id", () => {
    render(<PlayerChip name="Nia" avatar={null} />);
    expect(screen.getByText("Nia")).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
  });
});
