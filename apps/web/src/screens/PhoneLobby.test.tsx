import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "@opg/i18n";
import { makeGame, makePlayer, makePlayerView } from "./fixtures/room";
import { PhoneLobby } from "./PhoneLobby";

const ME = makePlayer({
  id: "p1",
  name: "Priya",
  avatar: "blob",
  isVip: true,
  crowns: 2,
});
const SAM = makePlayer({ id: "p2", name: "Sam", avatar: "drop", crowns: 1 });
const LEE = makePlayer({ id: "p3", name: "Lee", avatar: "cat" });

function setup(
  patch: Parameters<typeof makePlayerView>[0] = {},
  handlers: {
    onChangeAvatar?: () => void;
    onLeave?: () => void;
  } = {},
) {
  render(
    <LocaleProvider>
      <PhoneLobby
        view={makePlayerView({
          players: [ME, SAM, LEE],
          you: "p1",
          vipId: "p1",
          ...patch,
        })}
        {...handlers}
      />
    </LocaleProvider>,
  );
  return { user: userEvent.setup() };
}

afterEach(cleanup);

describe("PhoneLobby", () => {
  it("shows the room code, you, and who is here", () => {
    setup();
    expect(screen.getByText("You're in!")).toBeTruthy();
    expect(screen.getByText("Room BKTZ")).toBeTruthy();
    expect(screen.getByText("Who's here (3)")).toBeTruthy();
    expect(screen.getByText("Priya (you)")).toBeTruthy();
    expect(screen.getByText("Sam")).toBeTruthy();
  });

  it("tells the VIP they pick the game", () => {
    setup();
    expect(screen.getByText("You're the VIP and pick the game.")).toBeTruthy();
    expect(screen.getByText("VIP")).toBeTruthy();
  });

  it("points non-VIP players at the TV and names the VIP", () => {
    setup({ you: "p2", vipId: "p1" });
    expect(
      screen.getByText("Priya is the VIP and picks the game. Watch the TV."),
    ).toBeTruthy();
    expect(screen.queryByText("Priya (you)")).toBeNull();
  });

  it("falls back when the VIP left the room", () => {
    setup({ vipId: "ghost" });
    expect(
      screen.getByText("The VIP is the VIP and picks the game. Watch the TV."),
    ).toBeTruthy();
  });

  it("drops the TV line for a non-VIP with no shared screen", () => {
    setup({ you: "p2", vipId: "p1", sharedScreen: false });
    expect(
      screen.getByText("Priya is the VIP and picks the game."),
    ).toBeTruthy();
    expect(screen.queryByText(/Watch the TV/)).toBeNull();
  });

  it("shows crowns for you and for another player", () => {
    setup();
    expect(screen.getByText("2 crowns")).toBeTruthy();
    expect(screen.getByText("1 crown")).toBeTruthy();
  });

  it("falls back to a generic name when you are missing", () => {
    setup({ you: "ghost" });
    expect(screen.getByText("You")).toBeTruthy();
  });

  it("sends change-avatar", async () => {
    const onChangeAvatar = vi.fn<() => void>();
    const { user } = setup({}, { onChangeAvatar });
    const changeButton = screen.getByRole("button", {
      name: /change doodle/i,
    });
    expect(changeButton.classList.contains("opg-pressable")).toBe(true);
    await user.click(changeButton);
    expect(onChangeAvatar).toHaveBeenCalledTimes(1);
  });

  it("hides change-avatar without a handler", () => {
    setup();
    expect(screen.queryByRole("button", { name: /change doodle/i })).toBeNull();
  });

  it("sends leave", async () => {
    const onLeave = vi.fn<() => void>();
    const { user } = setup({}, { onLeave });
    await user.click(screen.getByRole("button", { name: /leave room/i }));
    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  it("hides leave without a handler", () => {
    setup();
    expect(screen.queryByRole("button", { name: /leave room/i })).toBeNull();
  });

  it("shows the selected game and the blocked reason in a no-TV room", () => {
    setup({
      you: "p2",
      vipId: "p1",
      sharedScreen: false,
      games: [
        makeGame({ noTv: false }),
        makeGame({ id: "most-likely-to", name: "Most Likely To", noTv: true }),
      ],
      selectedGameId: "imposter",
    });
    expect(screen.getByText("Priya picked")).toBeTruthy();
    expect(screen.getByText("Imposter")).toBeTruthy();
    expect(screen.getByText("One of you has a decoy word.")).toBeTruthy();
    expect(screen.getByText("3–8 players · about 15 min")).toBeTruthy();
    expect(screen.getByText("Plays on a shared screen.")).toBeTruthy();
    expect(
      screen.getByText(
        "Priya can pick Most Likely To, or add a shared screen.",
      ),
    ).toBeTruthy();
  });

  it("drops the blocked reason when the picked game plays with no shared screen", () => {
    setup({
      you: "p2",
      vipId: "p1",
      sharedScreen: false,
      games: [makeGame({ noTv: true })],
      selectedGameId: "imposter",
    });
    expect(screen.getByText("Imposter")).toBeTruthy();
    expect(screen.queryByText("Plays on a shared screen.")).toBeNull();
    expect(screen.queryByText(/add a shared screen/)).toBeNull();
  });

  it("hides the selected game in a shared-screen room", () => {
    setup({ you: "p2", vipId: "p1", sharedScreen: true });
    expect(screen.queryByText("Priya picked")).toBeNull();
  });
});
