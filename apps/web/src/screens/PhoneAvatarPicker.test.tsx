import type { AvatarId } from "@opg/protocol";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makePlayer, makePlayerView } from "./fixtures/room";
import { PhoneAvatarPicker } from "./PhoneAvatarPicker";

const ME = makePlayer({ id: "p1", name: "Priya", avatar: "blob" });
const SAM = makePlayer({ id: "p2", name: "Sam", avatar: "drop" });

function setup(patch: Parameters<typeof makePlayerView>[0] = {}) {
  const onPick = vi.fn<(avatar: AvatarId) => void>();
  const onDone = vi.fn<() => void>();
  render(
    <PhoneAvatarPicker
      view={makePlayerView({ players: [ME, SAM], you: "p1", ...patch })}
      onPick={onPick}
      onDone={onDone}
    />,
  );
  return { onPick, onDone, user: userEvent.setup() };
}

afterEach(cleanup);

describe("PhoneAvatarPicker", () => {
  it("greets the player and stamps their name", () => {
    setup();
    expect(screen.getByText("Hi, Priya!")).toBeTruthy();
    expect(screen.getByText("Priya", { selector: ".opg-marker" })).toBeTruthy();
  });

  it("marks another player's avatar as taken and unpickable", () => {
    setup();
    expect(
      screen.getByRole("img", { name: "drop avatar, taken by Sam" }),
    ).toBeTruthy();
    expect(screen.getByText("Taken")).toBeTruthy();
    expect(screen.getByText("Sam")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Choose the drop avatar" }),
    ).toBeNull();
  });

  it("shows the picked avatar as pressed", () => {
    setup();
    const mine = screen.getByRole("button", {
      name: /choose the blob avatar/i,
    });
    expect(mine.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("Picked")).toBeTruthy();
  });

  it("sends the avatar id when a free avatar is picked", async () => {
    const { onPick, user } = setup();
    await user.click(
      screen.getByRole("button", { name: /choose the star avatar/i }),
    );
    expect(onPick).toHaveBeenCalledWith("star");
  });

  it("confirms with the done callback", async () => {
    const { onDone, user } = setup();
    await user.click(screen.getByRole("button", { name: /that's me/i }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("falls back when the player is not in the room view", () => {
    setup({ you: "ghost", players: [SAM] });
    expect(screen.getByText("Hi, player!")).toBeTruthy();
    expect(screen.getByText("You")).toBeTruthy();
    expect(screen.queryByText("Picked")).toBeNull();
  });
});
