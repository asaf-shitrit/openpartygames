// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PlayerRoomView } from "@opg/protocol";
import type { ServerClock } from "@opg/ui";
import type { RonAction, RonPlayerView } from "../types";
import { Phone } from "./Phone";
import { realOrNahPreviews } from "./preview";

afterEach(cleanup);

interface PhoneSample {
  label: string;
  surface: "phone";
  view: RonPlayerView;
  room: PlayerRoomView;
}

/** The preview table pairs surface "phone" with player views and player rooms. */
function phoneSample(label: string): PhoneSample {
  const entry = realOrNahPreviews.find(
    (p): p is PhoneSample => p.label === label && p.surface === "phone",
  );
  if (entry === undefined) throw new Error(`no phone preview ${label}`);
  return entry;
}

function renderPhone(
  label: string,
  send: (action: RonAction) => void = vi.fn<(action: RonAction) => void>(),
) {
  const { view, room } = phoneSample(label);
  const clock: ServerClock = { now: () => room.serverNow };
  render(
    <Phone
      view={view}
      room={room}
      deadline={room.game?.deadline ?? null}
      timerStartedAt={room.game?.timerStartedAt ?? null}
      clock={clock}
      send={send}
    />,
  );
}

/** Disabled is a real attribute, not just a style, so read it off the element. */
function disabled(element: HTMLElement): boolean {
  return element.getAttribute("disabled") !== null;
}

describe("Phone write phase", () => {
  it("submits the lie once the player types one", async () => {
    const send = vi.fn<(action: RonAction) => void>();
    renderPhone("Phone: Dov writing", send);
    const submit = screen.getByRole("button", { name: /submit lie/i });
    expect(disabled(submit)).toBe(true);
    await userEvent.click(submit);
    expect(send).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText("Your lie"), "kangaroos");
    expect(disabled(submit)).toBe(false);
    await userEvent.click(submit);
    expect(send).toHaveBeenCalledWith({ type: "lie", text: "kangaroos" });
  });

  it.each([
    [
      "Phone: lie was the truth",
      "That's the real answer! Write a lie instead.",
    ],
    ["Phone: lie already taken", "Someone already wrote that. Try another."],
    ["Phone: lie the wrong length", "Keep it between 1 and 40 characters."],
  ])("explains the %s rejection", (label, message) => {
    renderPhone(label);
    expect(screen.getByText(message)).toBeTruthy();
  });

  it("shows how many players are still writing once the lie is in", () => {
    renderPhone("Phone: lie locked in");
    expect(screen.getByText("Lie locked in")).toBeTruthy();
    expect(screen.getByText("Waiting for 2 more")).toBeTruthy();
    expect(screen.queryByLabelText("Your lie")).toBeNull();
  });
});

describe("Phone vote phase", () => {
  it("blocks the player's own lie and locks in the selected option", async () => {
    const send = vi.fn<(action: RonAction) => void>();
    renderPhone("Phone: Dov voting", send);
    const own = screen.getByRole("button", { name: /cane toads/ });
    expect(disabled(own)).toBe(true);
    expect(within(own).getByText("Your lie")).toBeTruthy();
    await userEvent.click(own);
    expect(send).not.toHaveBeenCalled();

    const lockIn = screen.getByRole("button", { name: /lock in/i });
    expect(disabled(lockIn)).toBe(true);
    await userEvent.click(screen.getByRole("button", { name: /rabbits/ }));
    expect(disabled(lockIn)).toBe(false);
    await userEvent.click(lockIn);
    expect(send).toHaveBeenCalledWith({ type: "pick", optionId: "o1" });
  });

  it("confirms a locked-in vote", () => {
    renderPhone("Phone: vote locked in");
    expect(screen.getByText("Vote locked in")).toBeTruthy();
    expect(screen.getByText("Hold tight for the reveal")).toBeTruthy();
  });

  it("marks an option button as pressable", () => {
    renderPhone("Phone: Dov voting");
    const row = screen.getByRole("button", { name: /rabbits/ });
    expect(row.classList.contains("opg-pressable")).toBe(true);
  });

  it("wraps the phase in the enter animation and swaps content on a phase change", () => {
    const first = phoneSample("Phone: Dov voting");
    const second = phoneSample("Phone: reveal");
    const clock: ServerClock = { now: () => first.room.serverNow };
    const { container, rerender } = render(
      <Phone
        view={first.view}
        room={first.room}
        deadline={null}
        timerStartedAt={null}
        clock={clock}
        send={vi.fn<(action: RonAction) => void>()}
      />,
    );
    const wrapper = container.querySelector(".opg-phase-enter");
    expect(wrapper).toBeTruthy();
    expect(wrapper?.textContent).toContain("Which one is real?");

    rerender(
      <Phone
        view={second.view}
        room={second.room}
        deadline={null}
        timerStartedAt={second.room.game?.timerStartedAt ?? null}
        clock={clock}
        send={vi.fn<(action: RonAction) => void>()}
      />,
    );
    const next = container.querySelector(".opg-phase-enter");
    expect(next).toBeTruthy();
    expect(next?.textContent).toContain("The truth: emus");
  });
});

describe("Phone reveal phase", () => {
  it("shows the settled personal cards: fooled, fooling, and the truth missed", () => {
    renderPhone("Phone: reveal");
    expect(screen.getByText("Maya's lie got you")).toBeTruthy();
    expect(screen.getByText("You fooled Sam and Noa!")).toBeTruthy();
    expect(screen.getByText("+1,000")).toBeTruthy();
    expect(screen.getByText("The truth: emus")).toBeTruthy();
  });

  it("celebrates finding the truth", () => {
    renderPhone("Phone: Dov found the truth");
    expect(screen.getByText("You found it!")).toBeTruthy();
  });

  it("keeps the round's answer on screen when the player never wrote a lie", () => {
    renderPhone("Phone: Dov missed a round");
    expect(screen.queryByText("Your lie fooled nobody")).toBeNull();
    // Nothing personal to stage, but the truth still lands so the screen is never blank.
    expect(screen.getByText(/The truth: |You found it!/)).toBeTruthy();
  });
});
