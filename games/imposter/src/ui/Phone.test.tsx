// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ServerClock } from "@opg/ui";
import type {
  ImposterAction,
  ImposterHostView,
  ImposterPlayerView,
} from "../state";
import { Phone } from "./Phone";
import { imposterPreviews } from "./preview";

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
  const preview = imposterPreviews.find(
    (candidate) => candidate.label === label,
  );
  if (preview === undefined) throw new Error(`no preview labelled ${label}`);
  return preview;
}

function isPlayerView(
  view: ImposterHostView | ImposterPlayerView,
): view is ImposterPlayerView {
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

function renderPhone(label: string, send: (action: ImposterAction) => void) {
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

function phonePreviews(): Array<{ label: string; view: ImposterPlayerView }> {
  const previews: Array<{ label: string; view: ImposterPlayerView }> = [];
  for (const preview of imposterPreviews) {
    if (preview.surface !== "phone") continue;
    if (!isPlayerView(preview.view)) continue;
    previews.push({ label: preview.label, view: preview.view });
  }
  return previews;
}

function mockSend() {
  return vi.fn<(action: ImposterAction) => void>();
}

function submitButton(name: string): HTMLElement {
  return screen.getByRole("button", { name });
}

function flipCard(): void {
  const button = screen.getByRole("button", { name: "Your secret card" });
  fireEvent.pointerDown(button);
  fireEvent.pointerUp(button);
}

describe("word screens", () => {
  it("starts face down, with no word text in the DOM", () => {
    renderPhone("Phone: Maya crew card", mockSend());
    expect(screen.getByText("Hold to peek")).toBeTruthy();
    expect(screen.queryByText("GIRAFFE")).toBeNull();
    expect(screen.queryByText("Shh… here's your word")).toBeNull();
  });

  it("shows a crew member their own word and never the decoy, once flipped", () => {
    renderPhone("Phone: Maya crew card", mockSend());
    flipCard();
    expect(screen.getByText("Shh… here's your word")).toBeTruthy();
    expect(screen.getByText("Your secret word")).toBeTruthy();
    expect(screen.getByText("GIRAFFE")).toBeTruthy();
    expect(screen.queryByText("ZEBRA")).toBeNull();
  });

  it("shows the imposter the decoy word and never the crew word, once flipped", () => {
    renderPhone("Phone: Priya imposter card", mockSend());
    flipCard();
    expect(screen.getByText("Psst… you're the imposter")).toBeTruthy();
    expect(screen.getByText("Your decoy word")).toBeTruthy();
    expect(screen.getByText("ZEBRA")).toBeTruthy();
    expect(screen.queryByText("GIRAFFE")).toBeNull();
  });

  it("buzzes the same flip pattern for crew and the imposter", () => {
    const crewVibrate = stubVibrate();
    renderPhone("Phone: Maya crew card", mockSend());
    flipCard();
    expect(crewVibrate).toHaveBeenCalledWith([30]);
    cleanup();

    const imposterVibrate = stubVibrate();
    renderPhone("Phone: Priya imposter card", mockSend());
    flipCard();
    expect(imposterVibrate).toHaveBeenCalledWith([30]);
  });

  it("hides the word again on Hide word, and peeking again reveals it", async () => {
    renderPhone("Phone: Maya crew card", mockSend());
    flipCard();
    expect(screen.getByText("GIRAFFE")).toBeTruthy();

    await userEvent.click(submitButton("Hide word"));
    expect(screen.queryByText("GIRAFFE")).toBeNull();
    expect(screen.getByText("Hold to peek")).toBeTruthy();

    flipCard();
    expect(screen.getByText("GIRAFFE")).toBeTruthy();
  });

  it("renders every phone preview", () => {
    const previews = phonePreviews();
    expect(previews.length).toBeGreaterThan(0);
    for (const preview of previews) {
      renderPhone(preview.label, mockSend());
      expect(screen.getByText("Imposter")).toBeTruthy();
      cleanup();
    }
  });

  it("never shows the decoy word on a crew phone", () => {
    const crewPreviews = phonePreviews().filter(
      (preview) => preview.view.role === "crew",
    );
    expect(crewPreviews.length).toBeGreaterThan(0);
    for (const preview of crewPreviews) {
      renderPhone(preview.label, mockSend());
      if (preview.view.phase === "word-check") flipCard();
      expect(screen.queryByText("ZEBRA")).toBeNull();
      cleanup();
    }
  });
});

describe("clue turn", () => {
  it("tells a waiting player who is speaking and when they are up", () => {
    renderPhone("Phone: Priya watching Dov's clue", mockSend());
    expect(screen.getByText("Dov is giving a clue")).toBeTruthy();
    expect(screen.getByText("You're up next!")).toBeTruthy();
    cleanup();
    renderPhone("Phone: Sam watching Dov's clue", mockSend());
    expect(screen.getByText("You're up after Priya")).toBeTruthy();
  });

  it("sends done from the I'm done button", async () => {
    const send = mockSend();
    renderPhone("Phone: Dov your turn", send);
    expect(screen.getByText("Your turn!")).toBeTruthy();
    await userEvent.click(submitButton("I'm done"));
    expect(send).toHaveBeenCalledWith({ type: "done" });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("buzzes 'turn' when a fresh turn starts, but not on a stale reconnect", () => {
    const { view, room } = playerSample("Phone: Dov your turn");
    const freshVibrate = stubVibrate();
    const freshClock: ServerClock = { now: () => room.serverNow };
    render(
      <Phone
        view={view}
        room={room}
        deadline={room.serverNow + 30000}
        timerStartedAt={room.serverNow}
        clock={freshClock}
        send={mockSend()}
      />,
    );
    expect(freshVibrate).toHaveBeenCalledWith([90, 60, 90]);
    cleanup();

    const staleVibrate = stubVibrate();
    render(
      <Phone
        view={view}
        room={room}
        deadline={room.serverNow + 30000}
        timerStartedAt={room.serverNow - 5000}
        clock={freshClock}
        send={mockSend()}
      />,
    );
    expect(staleVibrate).not.toHaveBeenCalled();
  });
});

describe("voting", () => {
  it("sends the picked player when the vote is locked in", async () => {
    const send = mockSend();
    renderPhone("Phone: Dov vote selecting", send);
    expect(screen.getByText("Who's the imposter?")).toBeTruthy();
    await userEvent.click(submitButton("Priya's avatar Priya"));
    expect(screen.getByText("Your pick")).toBeTruthy();
    await userEvent.click(submitButton("Lock in vote"));
    expect(send).toHaveBeenCalledWith({ type: "vote", target: "priya" });
  });

  it("marks a vote row as pressable", () => {
    renderPhone("Phone: Dov vote selecting", mockSend());
    const row = submitButton("Priya's avatar Priya");
    expect(row.classList.contains("opg-pressable")).toBe(true);
  });

  it("shows the locked confirmation and the chosen name once myVote is set", () => {
    renderPhone("Phone: Dov vote locked in", mockSend());
    expect(screen.getByText("Vote locked in")).toBeTruthy();
    expect(screen.getByText("You voted for Priya.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Lock in vote" })).toBeNull();
  });

  it("sends the vote only once when Lock in vote is tapped twice", async () => {
    const send = mockSend();
    renderPhone("Phone: Dov vote selecting", send);
    await userEvent.click(submitButton("Priya's avatar Priya"));
    await userEvent.click(submitButton("Lock in vote"));
    await userEvent.click(submitButton("Lock in vote"));
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith({ type: "vote", target: "priya" });
  });

  it("lets a player vote again after a kick clears their locked vote", async () => {
    const selecting = playerSample("Phone: Dov vote selecting");
    const locked = playerSample("Phone: Dov vote locked in");
    const clock: ServerClock = { now: () => selecting.room.serverNow };
    const send = mockSend();
    const phoneFor = (view: ImposterPlayerView) => (
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
    await userEvent.click(submitButton("Maya's avatar Maya"));
    await userEvent.click(submitButton("Lock in vote"));
    expect(send).toHaveBeenLastCalledWith({ type: "vote", target: "maya" });
  });

  it("lets a player vote again when their vote was dropped before it landed", async () => {
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
    await userEvent.click(submitButton("Priya's avatar Priya"));
    await userEvent.click(submitButton("Lock in vote"));
    expect(send).toHaveBeenCalledWith({ type: "vote", target: "priya" });

    // Priya left before the vote landed: myVote stays null and the roster shrinks.
    const ballot: ImposterPlayerView = {
      ...selecting.view,
      voteCandidates: selecting.view.voteCandidates.filter(
        (id) => id !== "priya",
      ),
    };
    rerender(
      <Phone
        view={ballot}
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

  it("buzzes 'locked' the moment the server view reports the vote is in", () => {
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

  it("wraps the phase in the enter animation and swaps content on a phase change", () => {
    const first = playerSample("Phone: Dov vote selecting");
    const second = playerSample("Phone: Dov reveal");
    const clock: ServerClock = { now: () => first.room.serverNow };
    const { container, rerender } = render(
      <Phone
        view={first.view}
        room={first.room}
        deadline={null}
        timerStartedAt={null}
        clock={clock}
        send={mockSend()}
      />,
    );
    const wrapper = container.querySelector(".opg-phase-enter");
    expect(wrapper).toBeTruthy();
    expect(wrapper?.textContent).toContain("Who's the imposter?");

    rerender(
      <Phone
        view={second.view}
        room={second.room}
        deadline={second.room.game?.deadline ?? null}
        timerStartedAt={second.room.game?.timerStartedAt ?? null}
        clock={clock}
        send={mockSend()}
      />,
    );
    const next = container.querySelector(".opg-phase-enter");
    expect(next).toBeTruthy();
    expect(next?.textContent).toContain("You spotted Priya!");
  });
});

describe("reveal, last chance and result", () => {
  it("reveal names the imposter and stays quiet about both words", () => {
    renderPhone("Phone: Dov reveal", mockSend());
    expect(screen.getByText("You spotted Priya!")).toBeTruthy();
    expect(screen.getByText("+500 if they miss the word.")).toBeTruthy();
    expect(screen.queryByText("GIRAFFE")).toBeNull();
    expect(screen.queryByText("ZEBRA")).toBeNull();
  });

  it("the imposter's last chance sends a guess and then locks", async () => {
    const send = mockSend();
    renderPhone("Phone: Priya last chance", send);
    expect(screen.getByText("You got caught!")).toBeTruthy();
    expect(screen.getByText("ZEBRA")).toBeTruthy();
    expect(submitButton("Submit guess").hasAttribute("disabled")).toBe(true);

    fireEvent.change(screen.getByLabelText("Your guess"), {
      target: { value: "horse" },
    });
    await userEvent.click(submitButton("Submit guess"));
    expect(send).toHaveBeenCalledWith({ type: "guess", text: "horse" });
    expect(submitButton("Guess sent").hasAttribute("disabled")).toBe(true);
  });

  it("crew waits for the guess with eyes on the TV", () => {
    renderPhone("Phone: Dov waiting for guess", mockSend());
    expect(screen.getByText("Priya is guessing…")).toBeTruthy();
    expect(screen.getByText("Eyes on the TV")).toBeTruthy();
  });

  it("an imposter sees they were caught, or that they slipped away", () => {
    renderPhone("Phone: Priya reveal caught", mockSend());
    expect(screen.getByText("You got caught!")).toBeTruthy();
    cleanup();
    renderPhone("Phone: Priya reveal free", mockSend());
    expect(screen.getByText("You slipped away!")).toBeTruthy();
  });

  it("routes the result phase to the personal result screen", () => {
    renderPhone("Phone: Dov result", mockSend());
    expect(screen.getByText("Nice spotting!")).toBeTruthy();
  });

  it("reveal, waiting and result screens have no action buttons", () => {
    for (const label of [
      "Phone: Dov reveal",
      "Phone: Dov waiting for guess",
      "Phone: Dov result",
    ]) {
      renderPhone(label, mockSend());
      expect(screen.queryAllByRole("button")).toHaveLength(0);
      cleanup();
    }
  });
});
