// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ServerClock } from "@opg/ui";
import type {
  ImposterAction,
  ImposterHostView,
  ImposterPlayerView,
} from "../state";
import { Phone } from "./Phone";
import { imposterPreviews } from "./preview";

afterEach(cleanup);

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

describe("word screens", () => {
  it("shows a crew member their own word and never the decoy", () => {
    renderPhone("Phone: Maya crew card", mockSend());
    expect(screen.getByText("Shh… here's your word")).toBeTruthy();
    expect(screen.getByText("Your secret word")).toBeTruthy();
    expect(screen.getByText("GIRAFFE")).toBeTruthy();
    expect(screen.queryByText("ZEBRA")).toBeNull();
  });

  it("shows the imposter the decoy word and never the crew word", () => {
    renderPhone("Phone: Priya imposter card", mockSend());
    expect(screen.getByText("Psst… you're the imposter")).toBeTruthy();
    expect(screen.getByText("Your decoy word")).toBeTruthy();
    expect(screen.getByText("ZEBRA")).toBeTruthy();
    expect(screen.queryByText("GIRAFFE")).toBeNull();
  });

  it("hides the word on Hide word and brings it back on Show word", async () => {
    renderPhone("Phone: Maya crew card", mockSend());
    await userEvent.click(submitButton("Hide word"));
    expect(screen.queryByText("GIRAFFE")).toBeNull();
    expect(screen.getByText("Tap to show")).toBeTruthy();
    await userEvent.click(submitButton("Show word"));
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

  it("keeps an existing vote and can switch it before locking in", async () => {
    const send = mockSend();
    renderPhone("Phone: Dov vote locked in", send);
    expect(screen.getByText("Your pick")).toBeTruthy();
    await userEvent.click(submitButton("Maya's avatar Maya"));
    await userEvent.click(submitButton("Lock in vote"));
    expect(send).toHaveBeenCalledWith({ type: "vote", target: "maya" });
  });
});

describe("reveal, last chance and result", () => {
  it("reveal names the imposter and stays quiet about both words", () => {
    renderPhone("Phone: Dov reveal", mockSend());
    expect(screen.getByText("The imposter was Priya")).toBeTruthy();
    expect(screen.getByText("Get ready for Priya's last chance.")).toBeTruthy();
    expect(screen.queryByText("GIRAFFE")).toBeNull();
    expect(screen.queryByText("ZEBRA")).toBeNull();
  });

  it("the imposter's last chance sends a trimmed guess and then locks", async () => {
    const send = mockSend();
    renderPhone("Phone: Priya last chance", send);
    expect(screen.getByText("You got caught!")).toBeTruthy();
    expect(screen.getByText("ZEBRA")).toBeTruthy();
    expect(submitButton("Submit guess").hasAttribute("disabled")).toBe(true);

    await userEvent.type(screen.getByLabelText("Your guess"), "  horse  ");
    await userEvent.click(submitButton("Submit guess"));
    expect(send).toHaveBeenCalledWith({ type: "guess", text: "horse" });
    expect(submitButton("Guess sent").hasAttribute("disabled")).toBe(true);
  });

  it("result shows the crew word and the points earned", () => {
    renderPhone("Phone: Dov result", mockSend());
    expect(screen.getByText("The word was")).toBeTruthy();
    expect(screen.getByText("GIRAFFE")).toBeTruthy();
    expect(screen.getByText("You earned +500 points")).toBeTruthy();
    expect(screen.getByText("Nope")).toBeTruthy();
  });

  it("an imposter sees they were caught, or that they slipped away", () => {
    renderPhone("Phone: Priya reveal caught", mockSend());
    expect(screen.getByText("You got caught!")).toBeTruthy();
    cleanup();
    renderPhone("Phone: Priya reveal free", mockSend());
    expect(screen.getByText("You slipped away!")).toBeTruthy();
  });

  it("an imposter result credits their own guess", () => {
    renderPhone("Phone: Priya result", mockSend());
    expect(screen.getByText("You guessed")).toBeTruthy();
    expect(screen.getByText("Got it")).toBeTruthy();
    expect(screen.getByText("You earned +1,000 points")).toBeTruthy();
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
