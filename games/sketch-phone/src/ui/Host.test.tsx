// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ServerClock } from "@opg/ui";
import { en, LocaleProvider } from "@opg/i18n";
import { Host } from "./Host";
import { sketchPhoneHostPreviews } from "./preview";

afterEach(cleanup);

const CLOCK: ServerClock = { now: () => 1_735_689_600_000 };

function renderHost(label: string) {
  const preview = sketchPhoneHostPreviews.find((each) => each.label === label);
  if (preview === undefined) throw new Error(`no host preview called ${label}`);
  const game = preview.room.game;
  render(
    <LocaleProvider>
      <Host
        view={preview.view}
        room={preview.room}
        deadline={game?.deadline ?? null}
        timerStartedAt={game?.timerStartedAt ?? null}
        clock={CLOCK}
      />
    </LocaleProvider>,
  );
  return preview;
}

describe("the TV screens", () => {
  it("names the game on every phase", () => {
    for (const preview of sketchPhoneHostPreviews) {
      renderHost(preview.label);
      expect(screen.getAllByText(en.sketchPhone.title).length).toBeGreaterThan(0);
      cleanup();
    }
  });

  it("asks for a phrase, with the round's own verb and the roster", () => {
    const preview = renderHost("Host: write");
    expect(screen.getByText(en.sketchPhone.writeOnTv)).toBeTruthy();
    expect(screen.getByText(en.sketchPhone.everyoneIsWriting)).toBeTruthy();
    expect(
      screen.getByText("0 of 8 done"),
    ).toBeTruthy();
    // "Write" is both the progress label and the current step chip.
    expect(screen.getAllByText(en.sketchPhone.progressWrite).length).toBe(2);
    expect(preview.view.phase).toBe("write");
  });

  it("shows the passing round with the steps and the drawing verb", () => {
    renderHost("Host: passing round");
    expect(screen.getByText(en.sketchPhone.drawWhatYouGot)).toBeTruthy();
    expect(screen.getByText(en.sketchPhone.everyoneIsDrawing)).toBeTruthy();
    expect(screen.getByText(en.sketchPhone.progressDraw)).toBeTruthy();
    // Eight players hand a chain off seven times.
    expect(screen.getByText("Round 2 of 8")).toBeTruthy();
    expect(screen.getByText("0 of 8 done")).toBeTruthy();
  });

  it("replays the chain one link at a time, never the whole thing", () => {
    const preview = renderHost("Host: replay");
    expect(screen.getByText(en.sketchPhone.yourChain)).toBeTruthy();
    expect(screen.getByText(en.sketchPhone.movedOneSeat)).toBeTruthy();
    // Four links revealed of a chain of eight: the last four are still secret.
    expect(preview.view.revealed).toBe(4);
    expect(preview.view.links?.length).toBe(4);
  });

  it("asks the room to vote on their phones", () => {
    renderHost("Host: vote");
    expect(screen.getByText(en.sketchPhone.pickFavouriteHost)).toBeTruthy();
    expect(screen.getByText(en.sketchPhone.voteOnPhone)).toBeTruthy();
    expect(screen.getByText("0 of 8 voted")).toBeTruthy();
  });

  it("crowns the favourite with its points and the words it came from", () => {
    renderHost("Host: favourite");
    expect(screen.getByText(en.sketchPhone.favourite)).toBeTruthy();
    expect(screen.getByText("+400")).toBeTruthy();
    expect(screen.getByText("4 votes")).toBeTruthy();
    expect(screen.getByText(en.sketchPhone.everyoneElse)).toBeTruthy();
  });

  it("still says something when nobody voted", () => {
    renderHost("Host: favourite, no votes");
    expect(screen.getByText(en.sketchPhone.noFavourite)).toBeTruthy();
  });
});
