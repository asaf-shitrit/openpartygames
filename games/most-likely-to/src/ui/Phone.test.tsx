// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ServerClock } from "@opg/ui";
import type { MltAction, MltHostView, MltPlayerView } from "../state";
import { Phone } from "./Phone";
import { mostLikelyToPreviews } from "./preview";

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(navigator, "vibrate");
});

function stubVibrate() {
  const vibrate = vi.fn<(pattern: number | number[]) => boolean>(() => true);
  Object.defineProperty(navigator, "vibrate", {
    configurable: true,
    value: vibrate,
  });
  return vibrate;
}

function findPreview(label: string) {
  const preview = mostLikelyToPreviews.find(
    (candidate) => candidate.label === label,
  );
  if (preview === undefined) throw new Error(`no preview labelled ${label}`);
  return preview;
}

function isPlayerView(
  view: MltHostView | MltPlayerView,
): view is MltPlayerView {
  return "myVote" in view;
}

function playerSample(label: string) {
  const preview = findPreview(label);
  const room = preview.room;
  const view = preview.view;
  if (!isPlayerView(view)) throw new Error(`${label} is not a player view`);
  if (room.role !== "player") throw new Error(`${label} is not a player room`);
  return { view, room };
}

function renderPhone(label: string, send: (action: MltAction) => void) {
  const { view, room } = playerSample(label);
  const clock: ServerClock = { now: () => room.serverNow };
  return render(
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

function mockSend() {
  return vi.fn<(action: MltAction) => void>();
}

function submitButton(name: string): HTMLElement {
  return screen.getByRole("button", { name });
}

describe("voting", () => {
  it("sends the picked player when the vote is locked in", async () => {
    const send = mockSend();
    renderPhone("Phone: Dov vote selecting", send);
    await userEvent.click(submitButton("Priya's avatar Priya"));
    expect(screen.getByText("Your pick")).toBeTruthy();
    await userEvent.click(submitButton("Lock in vote"));
    expect(send).toHaveBeenCalledWith({ type: "vote", target: "priya" });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("disables Lock in vote before a pick", () => {
    renderPhone("Phone: Dov vote selecting", mockSend());
    const button = submitButton("Lock in vote");
    expect(button.hasAttribute("disabled")).toBe(true);
  });

  it("labels the viewer's own row You", () => {
    renderPhone("Phone: Dov vote selecting", mockSend());
    expect(screen.getByText("Dov (You)")).toBeTruthy();
    expect(screen.getByText("Maya")).toBeTruthy();
  });

  it("sends the vote only once when Lock in vote is tapped twice", async () => {
    const send = mockSend();
    renderPhone("Phone: Dov vote selecting", send);
    await userEvent.click(submitButton("Priya's avatar Priya"));
    await userEvent.click(submitButton("Lock in vote"));
    await userEvent.click(submitButton("Lock in vote"));
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("shows the locked card with the pick and the vote count", () => {
    renderPhone("Phone: Dov vote locked in", mockSend());
    expect(screen.getByText("Vote locked in")).toBeTruthy();
    expect(screen.getByText("You picked Priya.")).toBeTruthy();
    expect(screen.getByText("4 of 6 voted")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Lock in vote" })).toBeNull();
  });

  it("shows yourself when the locked pick is the viewer", () => {
    const { view, room } = playerSample("Phone: Dov vote locked in");
    const selfView = { ...view, myVote: room.you };
    const clock: ServerClock = { now: () => room.serverNow };
    render(
      <Phone
        view={selfView}
        room={room}
        deadline={room.game?.deadline ?? null}
        timerStartedAt={room.game?.timerStartedAt ?? null}
        clock={clock}
        send={mockSend()}
      />,
    );
    expect(screen.getByText("You picked yourself.")).toBeTruthy();
  });

  it("buzzes locked the moment the server view reports the vote is in", () => {
    const selecting = playerSample("Phone: Dov vote selecting");
    const locked = playerSample("Phone: Dov vote locked in");
    const clock: ServerClock = { now: () => selecting.room.serverNow };
    const lockVibrate = stubVibrate();
    const { rerender } = render(
      <Phone
        view={selecting.view}
        room={selecting.room}
        deadline={null}
        timerStartedAt={null}
        clock={clock}
        send={mockSend()}
      />,
    );
    expect(lockVibrate).not.toHaveBeenCalled();

    rerender(
      <Phone
        view={locked.view}
        room={locked.room}
        deadline={null}
        timerStartedAt={null}
        clock={clock}
        send={mockSend()}
      />,
    );
    expect(lockVibrate).toHaveBeenCalledWith([25, 40, 25]);
    cleanup();

    const reconnectVibrate = stubVibrate();
    renderPhone("Phone: Dov vote locked in", mockSend());
    expect(reconnectVibrate).not.toHaveBeenCalled();
  });

  it("lets a player vote again after a kick clears their locked vote", async () => {
    const selecting = playerSample("Phone: Dov vote selecting");
    const locked = playerSample("Phone: Dov vote locked in");
    const clock: ServerClock = { now: () => selecting.room.serverNow };
    const send = mockSend();
    const phoneFor = (view: MltPlayerView) => (
      <Phone
        view={view}
        room={selecting.room}
        deadline={null}
        timerStartedAt={null}
        clock={clock}
        send={send}
      />
    );
    const { rerender } = render(phoneFor(selecting.view));
    await userEvent.click(submitButton("Priya's avatar Priya"));
    await userEvent.click(submitButton("Lock in vote"));
    rerender(phoneFor(locked.view));
    expect(screen.getByText("Vote locked in")).toBeTruthy();

    // Priya was kicked, so the server dropped Dov's vote and sent a fresh ballot.
    rerender(
      phoneFor({
        ...selecting.view,
        voteCandidates: selecting.view.voteCandidates.filter(
          (id) => id !== "priya",
        ),
      }),
    );
    expect(screen.queryByText("Vote locked in")).toBeNull();
    await userEvent.click(submitButton("Maya's avatar Maya"));
    await userEvent.click(submitButton("Lock in vote"));
    expect(send).toHaveBeenLastCalledWith({ type: "vote", target: "maya" });
  });

  it("lets a player lock again when their vote was dropped for a kicked target", async () => {
    const selecting = playerSample("Phone: Dov vote selecting");
    const clock: ServerClock = { now: () => selecting.room.serverNow };
    const send = mockSend();
    const { rerender } = render(
      <Phone
        view={selecting.view}
        room={selecting.room}
        deadline={null}
        timerStartedAt={null}
        clock={clock}
        send={send}
      />,
    );
    await userEvent.click(submitButton("Leo's avatar Leo"));
    await userEvent.click(submitButton("Lock in vote"));
    expect(send).toHaveBeenCalledWith({ type: "vote", target: "leo" });

    // Leo was kicked before the vote landed, so the server never recorded it:
    // myVote stays null and the roster shrinks.
    const withoutLeo: MltPlayerView = {
      ...selecting.view,
      voteCandidates: selecting.view.voteCandidates.filter((id) => id !== "leo"),
      playerCount: selecting.view.playerCount - 1,
    };
    rerender(
      <Phone
        view={withoutLeo}
        room={selecting.room}
        deadline={null}
        timerStartedAt={null}
        clock={clock}
        send={send}
      />,
    );
    await userEvent.click(submitButton("Maya's avatar Maya"));
    await userEvent.click(submitButton("Lock in vote"));
    expect(send).toHaveBeenLastCalledWith({ type: "vote", target: "maya" });
  });

  it("resets the vote form when a new round starts", async () => {
    const selecting = playerSample("Phone: Dov vote selecting");
    const clock: ServerClock = { now: () => selecting.room.serverNow };
    const send = mockSend();
    const { rerender } = render(
      <Phone
        view={selecting.view}
        room={selecting.room}
        deadline={null}
        timerStartedAt={null}
        clock={clock}
        send={send}
      />,
    );
    await userEvent.click(submitButton("Maya's avatar Maya"));
    expect(screen.getByText("Your pick")).toBeTruthy();

    const nextRound = { ...selecting.view, roundNumber: selecting.view.roundNumber + 1 };
    rerender(
      <Phone
        view={nextRound}
        room={selecting.room}
        deadline={null}
        timerStartedAt={null}
        clock={clock}
        send={send}
      />,
    );
    expect(screen.queryByText("Your pick")).toBeNull();
  });
});

describe("reveal phase", () => {
  it("renders the phone reveal", () => {
    renderPhone("Phone: Maya reveal matched", mockSend());
    expect(screen.getByText("Here comes the verdict")).toBeTruthy();
  });
});
