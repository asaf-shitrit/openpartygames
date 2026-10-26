// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ServerClock } from "@opg/ui";
import { en, LocaleProvider } from "@opg/i18n";
import type { SketchAction } from "../state";
import { Phone } from "./Phone";
import { sketchPhonePlayerPreviews } from "./preview";

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
});

const CLOCK: ServerClock = { now: () => 1_735_689_600_000 };

function previewOf(label: string) {
  const preview = sketchPhonePlayerPreviews.find((each) => each.label === label);
  if (preview === undefined) throw new Error(`no phone preview called ${label}`);
  return preview;
}

function renderPhone(label: string) {
  const preview = previewOf(label);
  const send = vi.fn<(action: SketchAction) => void>();
  const game = preview.room.game;
  render(
    <LocaleProvider>
      <Phone
        view={preview.view}
        room={preview.room}
        deadline={game?.deadline ?? null}
        timerStartedAt={game?.timerStartedAt ?? null}
        clock={CLOCK}
        send={send}
        stage={preview.room.sharedScreen ? null : preview.view}
      />
    </LocaleProvider>,
  );
  return { preview, send };
}

describe("the phone screens", () => {
  it("names the game on every phase", () => {
    for (const preview of sketchPhonePlayerPreviews) {
      renderPhone(preview.label);
      expect(screen.getAllByText(en.sketchPhone.title).length).toBeGreaterThan(0);
      cleanup();
    }
  });

  it("sends the words a player types, at the length limit", () => {
    const { send, preview } = renderPhone("Phone: Maya writing");
    expect(screen.getByText(en.sketchPhone.startChain)).toBeTruthy();
    expect(screen.getByText(en.sketchPhone.writeHint)).toBeTruthy();
    const input = screen.getByLabelText<HTMLInputElement>(en.sketchPhone.writeSomething);
    expect(input.maxLength).toBe(50);
    fireEvent.change(input, { target: { value: "  a cat   on a bike " } });
    // Whitespace is collapsed, so the room stores one clean phrase.
    fireEvent.click(screen.getByRole("button", { name: en.sketchPhone.sendIt }));
    expect(preview.view.myLinkId).not.toBeNull();
    expect(send).toHaveBeenCalledWith({ type: "words", text: "a cat on a bike" });
  });

  it("will not send an empty phrase", () => {
    const { send } = renderPhone("Phone: Maya writing");
    fireEvent.click(screen.getByRole("button", { name: en.sketchPhone.sendIt }));
    expect(send).not.toHaveBeenCalled();
  });

  it("offers three phrases to start from, each one a tap away", () => {
    renderPhone("Phone: Maya writing");
    const input = screen.getByLabelText<HTMLInputElement>(en.sketchPhone.writeSomething);
    const { cat, pig, waffle } = en.sketchPhone.suggestions;
    expect(screen.getByRole("button", { name: cat })).toBeTruthy();
    expect(screen.getByRole("button", { name: pig })).toBeTruthy();
    expect(screen.getByRole("button", { name: waffle })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: pig }));
    expect(input.value).toBe(pig);
  });

  it("shows the drawing a describer has to put into words", () => {
    renderPhone("Phone: Noa describing");
    expect(screen.getByText(en.sketchPhone.whatIsThis)).toBeTruthy();
    expect(screen.getByText(en.sketchPhone.describeHint)).toBeTruthy();
    // The drawing's own label is what a screen reader announces where the picture is.
    // The drawing's own label is what a screen reader announces where the picture is.
    expect(screen.getAllByText(/'s drawing$/).length).toBeGreaterThan(0);
    expect(screen.getByText(/^It came from · .*'s drawing$/)).toBeTruthy();
  });

  it("draws, offers a squiggle, and hands the drawing in", () => {
    const { send, preview } = renderPhone("Phone: Sam drawing");
    expect(screen.getByText(en.sketchPhone.drawThisNoWords)).toBeTruthy();
    expect(screen.getByRole("button", { name: en.sketchPhone.cantDrawSendSquiggle })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: en.sketchPhone.imDone }));
    expect(send).toHaveBeenCalledWith({ type: "done", linkId: preview.view.myLinkId });
  });

  it("says who it went to and how many are still going", () => {
    renderPhone("Phone: Maya sent");
    expect(screen.getByText(en.sketchPhone.sent)).toBeTruthy();
    expect(screen.getByText("Waiting for 7 more")).toBeTruthy();
    expect(screen.getByText(en.sketchPhone.nextUpDrawing)).toBeTruthy();

    cleanup();
    renderPhone("Phone: Maya sent, one player left");
    expect(screen.getByText("Waiting for 1 more")).toBeTruthy();

    cleanup();
    renderPhone("Phone: Maya sent, two players left");
    expect(screen.getByText("Waiting for 2 more")).toBeTruthy();

    cleanup();
    renderPhone("Phone: Maya sent the first line");
    expect(screen.getByText(en.sketchPhone.nextUpWords)).toBeTruthy();
  });

  it("waits, rather than drawing, when it was pulled in mid-round", () => {
    const { preview } = renderPhone("Phone: Sam pulled in, nothing to draw");
    expect(preview.view.myLinkId).toBeNull();
    expect(screen.getByText(en.sketchPhone.waitingOnLink)).toBeTruthy();
  });

  it("lets the presenter walk their own chain", () => {
    const { send } = renderPhone("Phone: Priya presenting");
    expect(screen.getByText(en.sketchPhone.yourChainOnTv)).toBeTruthy();
    expect(screen.getByText(en.sketchPhone.yourChainHint)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: en.sketchPhone.nextLink }));
    expect(send).toHaveBeenCalledWith({ type: "next-link" });
  });

  it("tells everyone else to look up when there is a shared screen", () => {
    const { preview } = renderPhone("Phone: Sam watching");
    expect(preview.room.sharedScreen).toBe(true);
    expect(screen.getByText(en.sketchPhone.lookUp)).toBeTruthy();
  });

  it("carries the revealed chain on a phone with no TV", () => {
    const { preview } = renderPhone("Phone (no-TV): Sam watching");
    expect(preview.room.sharedScreen).toBe(false);
    expect(screen.getAllByText(/'s (words|drawing)$/).length).toBeGreaterThan(0);
  });

  it("locks in a vote for someone else's link", () => {
    const { send, preview } = renderPhone("Phone: Sam voting");
    const lockIn = screen.getByRole("button", { name: en.sketchPhone.lockIn });
    expect(lockIn.hasAttribute("disabled")).toBe(true);
    const first = screen.getAllByRole("button").find((button) => button.textContent?.includes("'s "));
    if (first === undefined) throw new Error("no vote options rendered");
    const option = within(first).getByText(/words|drawing/);
    fireEvent.click(option);
    fireEvent.click(screen.getByRole("button", { name: en.sketchPhone.lockIn }));
    expect(send).toHaveBeenCalledTimes(1);
    const sent = send.mock.calls[0]?.[0];
    expect(sent?.type).toBe("vote");
    const linkId = sent?.type === "vote" ? sent.linkId : "";
    expect(preview.view.options?.some((each) => each.id === linkId && !each.mine)).toBe(true);
  });

  it("cannot vote for its own link", () => {
    renderPhone("Phone: Sam voting");
    const mine = screen.getAllByText(en.sketchPhone.yours);
    expect(mine.length).toBeGreaterThan(0);
    const own = mine[0]?.closest("button");
    expect(own?.hasAttribute("disabled")).toBe(true);
  });

  it("crowns the favourite and says how your own links did", () => {
    renderPhone("Phone: Priya favourite");
    expect(screen.getAllByText(en.sketchPhone.favourite).length).toBeGreaterThan(0);
    expect(screen.getByText(/\+400/)).toBeTruthy();
  });

  it("tells each player how their own link did in the favourite round", () => {
    const { preview } = renderPhone("Phone: Sam favourite");
    expect(preview.view.favouriteId).not.toBeNull();
    expect(screen.getAllByText(/\+\d+/).length).toBeGreaterThan(1);
  });

  it("still crowns the favourite when the vote counts arrive empty", () => {
    const preview = previewOf("Phone: Priya favourite");
    render(
      <LocaleProvider>
        <Phone
          view={{ ...preview.view, voteCounts: {} }}
          room={preview.room}
          deadline={null}
          timerStartedAt={null}
          clock={CLOCK}
          send={vi.fn<(action: SketchAction) => void>()}
          stage={null}
        />
      </LocaleProvider>,
    );
    expect(screen.getByText(en.sketchPhone.favourite)).toBeTruthy();
    expect(screen.getByText(/\+0/)).toBeTruthy();
  });

  it("says so plainly when nobody voted for a favourite", () => {
    const preview = previewOf("Phone: Priya favourite");
    render(
      <LocaleProvider>
        <Phone
          view={{ ...preview.view, favouriteId: null, links: [], voteCounts: {} }}
          room={preview.room}
          deadline={null}
          timerStartedAt={null}
          clock={CLOCK}
          send={vi.fn<(action: SketchAction) => void>()}
          stage={null}
        />
      </LocaleProvider>,
    );
    expect(screen.getAllByText(en.sketchPhone.favourite).length).toBeGreaterThan(0);
    expect(screen.queryByText(/\+\d/)).toBeNull();
  });

  it("puts the drawing it was handed in front of the describer", () => {
    const { preview } = renderPhone("Phone: Noa describing");
    expect(preview.view.input?.doodle).not.toBeNull();
    expect(screen.getByText(en.sketchPhone.whatIsThis)).toBeTruthy();
  });

  it("describes words, rather than a drawing, when that is all it was handed", () => {
    const preview = previewOf("Phone: Noa describing");
    const words = { id: "c0s0", kind: "words" as const, authorId: "maya", text: "a cat on a bike", doodle: null };
    render(
      <LocaleProvider>
        <Phone
          view={{ ...preview.view, input: words }}
          room={preview.room}
          deadline={null}
          timerStartedAt={null}
          clock={CLOCK}
          send={vi.fn<(action: SketchAction) => void>()}
          stage={null}
        />
      </LocaleProvider>,
    );
    expect(screen.getByText(/a cat on a bike/)).toBeTruthy();
  });

  it("writes the first line with nothing handed to it at all", () => {
    const preview = previewOf("Phone: Maya writing");
    render(
      <LocaleProvider>
        <Phone
          view={{ ...preview.view, input: null }}
          room={preview.room}
          deadline={null}
          timerStartedAt={null}
          clock={CLOCK}
          send={vi.fn<(action: SketchAction) => void>()}
          stage={null}
        />
      </LocaleProvider>,
    );
    expect(screen.getByText(en.sketchPhone.startChain)).toBeTruthy();
    expect(screen.queryByText(en.sketchPhone.itCameFrom.replace("{label}", ""))).toBeNull();
  });
});
