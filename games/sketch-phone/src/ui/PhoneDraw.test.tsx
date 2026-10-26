// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ServerClock } from "@opg/ui";
import type { Doodle, Stroke } from "@opg/sdk";
import { emptyDoodle } from "@opg/sdk";
import { MAX_MESSAGE_LENGTH } from "@opg/protocol";
import { LocaleProvider, en } from "@opg/i18n";
import type { SketchAction, SketchPlayerView } from "../state";
import { Phone } from "./Phone";
import { sketchPhonePlayerPreviews } from "./preview";
import { mirrorKey, pendingChunks, restoreMirror, sendChunks } from "./PhoneDraw";

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
});

const CLOCK: ServerClock = { now: () => 1_735_689_600_000 };

function stroke(points: number): Stroke {
  const p: number[] = [0, 0];
  for (let i = 1; i < points; i += 1) p.push(1, 1);
  return { c: 0, d: 10, g: 0, p };
}

function doodleOf(strokes: Stroke[]): Doodle {
  return { v: 1, s: strokes };
}

describe("pendingChunks", () => {
  it("never builds a frame longer than the wire allows", () => {
    const strokes = Array.from({ length: 40 }, () => stroke(20));
    const chunks = pendingChunks(strokes, 0, "c0s1");
    expect(chunks.flat().length).toBe(40);
    for (const chunk of chunks) {
      const frame = JSON.stringify({
        t: "game-action",
        action: { type: "strokes", linkId: "c0s1", from: 0, strokes: chunk },
      });
      expect(frame.length).toBeLessThanOrEqual(MAX_MESSAGE_LENGTH);
    }
  });

  it("never builds a chunk with more points than the rules accept", () => {
    const strokes = Array.from({ length: 8 }, () => stroke(128));
    const chunks = pendingChunks(strokes, 0, "c0s1");
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      const points = chunk.reduce((sum, each) => sum + each.p.length / 2, 0);
      expect(points).toBeLessThanOrEqual(400);
    }
  });

  it("sends only what the room has not seen yet", () => {
    const strokes = [stroke(3), stroke(3), stroke(3)];
    expect(pendingChunks(strokes, 2, "c0s1")).toHaveLength(1);
    expect(pendingChunks(strokes, 3, "c0s1")).toHaveLength(0);
  });
});

describe("sendChunks", () => {
  it("moves the cursor on by what it sent", () => {
    const send = vi.fn<(action: SketchAction) => void>();
    const sentRef = { current: 0 };
    sendChunks({ send, sentRef, linkId: "c0s1", doodle: doodleOf([stroke(3), stroke(3)]) });
    const first = send.mock.calls[0]?.[0];
    expect(first).toEqual({ type: "strokes", linkId: "c0s1", from: 0, strokes: [stroke(3), stroke(3)] });
    expect(sentRef.current).toBe(2);
  });

  it("cannot undo, and says nothing, when the pad is not allowed to truncate", () => {
    const send = vi.fn<(action: SketchAction) => void>();
    const sentRef = { current: 2 };
    sendChunks({ send, sentRef, linkId: "c0s1", doodle: emptyDoodle() });
    expect(send).not.toHaveBeenCalled();
    expect(sentRef.current).toBe(2);
  });

  it("asks the room to drop strokes when it is", () => {
    const send = vi.fn<(action: SketchAction) => void>();
    const sentRef = { current: 2 };
    sendChunks({ send, sentRef, linkId: "c0s1", doodle: emptyDoodle(), canTruncate: true });
    expect(send).toHaveBeenCalledWith({ type: "truncate", linkId: "c0s1", from: 2, to: 0 });
    expect(sentRef.current).toBe(0);
  });
});

describe("the sessionStorage mirror", () => {
  it("is picked up again only when it holds everything the room accepted", () => {
    const key = mirrorKey("BKTZ", "c0s1", 5000);
    window.sessionStorage.setItem(key, JSON.stringify(doodleOf([stroke(3), stroke(3)])));
    expect(restoreMirror(key, 2)).toBeDefined();
    expect(restoreMirror(key, 3)).toBeUndefined();
  });

  it("ignores a mirror that is not a doodle", () => {
    const key = mirrorKey("BKTZ", "c0s1", 5000);
    window.sessionStorage.setItem(key, "{oops");
    expect(restoreMirror(key, 0)).toBeUndefined();
  });

  it("keys the mirror on the room, the game and the link", () => {
    expect(mirrorKey("BKTZ", "c0s1", 5000)).toBe("opg:sketch:BKTZ:5000:c0s1");
    expect(mirrorKey("BKTZ", "c0s1", null)).toBe("opg:sketch:BKTZ:0:c0s1");
  });
});

describe("the draw screen", () => {
  function renderDraw(label: string, patch: Partial<SketchPlayerView> = {}) {
    const preview = sketchPhonePlayerPreviews.find((each) => each.label === label);
    if (preview === undefined) throw new Error(`no phone preview called ${label}`);
    const send = vi.fn<(action: SketchAction) => void>();
    render(
      <LocaleProvider>
        <Phone
          view={{ ...preview.view, ...patch }}
          room={preview.room}
          deadline={null}
          timerStartedAt={preview.room.game?.timerStartedAt ?? null}
          clock={CLOCK}
          send={send}
          stage={null}
        />
      </LocaleProvider>,
    );
    return { preview, send };
  }

  it("offers the squiggle to anyone who cannot draw, and hands it in", () => {
    const { send } = renderDraw("Phone: Sam drawing");
    fireEvent.click(screen.getByRole("button", { name: en.sketchPhone.cantDrawSendSquiggle }));
    expect(send.mock.calls.some(([action]) => action.type === "done")).toBe(true);
    expect(send.mock.calls.some(([action]) => action.type === "strokes")).toBe(true);
  });

  it("waits, with no pad and no squiggle, until a chain pulls the player in", () => {
    const { preview } = renderDraw("Phone: Sam pulled in, nothing to draw");
    expect(preview.view.myLinkId).toBeNull();
    expect(screen.getByText(en.sketchPhone.waitingOnLink)).toBeTruthy();
    expect(screen.queryByRole("button", { name: en.sketchPhone.cantDrawSendSquiggle })).toBeNull();
  });

  it("hands the drawing in once, and then puts the pad away", () => {
    const { send } = renderDraw("Phone: Sam drawing");
    fireEvent.click(screen.getByRole("button", { name: en.sketchPhone.imDone }));
    expect(send).toHaveBeenCalledWith({ type: "done", linkId: "c2s1" });
    cleanup();

    renderDraw("Phone: Sam drawing", { myDone: true });
    expect(screen.getByText(en.sketchPhone.sent)).toBeTruthy();
    expect(screen.queryByRole("button", { name: en.sketchPhone.imDone })).toBeNull();
  });

  it("brings back a drawing its phone still holds, so a reconnect does not lose it", () => {
    const preview = sketchPhonePlayerPreviews.find((each) => each.label === "Phone: Sam drawing");
    if (preview === undefined || preview.view.myLinkId === null) throw new Error("no drawing preview");
    const startedAt = preview.view.gameStartedAt ?? 0;
    window.sessionStorage.setItem(
      mirrorKey(preview.room.code, preview.view.myLinkId, startedAt),
      JSON.stringify(doodleOf([stroke(3), stroke(3)])),
    );
    const send = vi.fn<(action: SketchAction) => void>();
    render(
      <LocaleProvider>
        <Phone
          view={{ ...preview.view, myStrokeCount: 2 }}
          room={preview.room}
          deadline={null}
          timerStartedAt={startedAt}
          clock={CLOCK}
          send={send}
          stage={null}
        />
      </LocaleProvider>,
    );
    // The pad already holds both strokes, so nothing is sent until the player draws again.
    expect(send).not.toHaveBeenCalled();
    expect(restoreMirror(mirrorKey(preview.room.code, preview.view.myLinkId, startedAt), 2)).toBeDefined();
  });
});
