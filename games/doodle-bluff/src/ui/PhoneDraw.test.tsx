// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { MutableRefObject } from "react";
import type { ServerClock } from "@opg/ui";
import type { Stroke } from "@opg/ui";
import { LocaleProvider } from "@opg/i18n";
import type { Doodle, DoodleAction, DoodlePlayerView } from "../state";
import type { SentCursors } from "./PhoneDraw";
import { commitDrawingChange, PhoneDraw, pendingChunks, readMirror, restoreMirror, resyncCursor, storageKey } from "./PhoneDraw";

function sentCursorsRef(initial: SentCursors = {}): MutableRefObject<SentCursors> {
  return { current: initial };
}

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
  window.localStorage.clear();
});

const CLOCK: ServerClock = { now: () => 1000 };

function stroke(points: number): Stroke {
  const p: number[] = [0, 0];
  for (let i = 1; i < points; i += 1) p.push(1, 1);
  return { c: 0, d: 10, g: 0, p };
}

function baseView(overrides: Partial<DoodlePlayerView> = {}): DoodlePlayerView {
  return {
    phase: "draw",
    playerCount: 4,
    myPrompts: [
      { drawingId: "p1:0", prompt: "a cat riding a skateboard" },
      { drawingId: "p1:1", prompt: "a dog on a scooter" },
    ],
    myStrokeCounts: {},
    myDone: {},
    drawnCount: 0,
    roundNumber: 0,
    roundCount: 0,
    currentDrawingId: null,
    isArtist: false,
    doodle: null,
    myTitle: null,
    titleError: null,
    titledCount: 0,
    options: null,
    myVote: null,
    votedCount: 0,
    reveal: null,
    myPoints: null,
    totals: {},
    ...overrides,
  };
}

describe("pendingChunks", () => {
  it("returns nothing when there are no strokes past the cursor", () => {
    expect(pendingChunks([stroke(2), stroke(2)], 2)).toEqual([]);
  });

  it("keeps strokes under the per-chunk point cap in one chunk", () => {
    const strokes = [stroke(2), stroke(2)];
    expect(pendingChunks(strokes, 0)).toEqual([strokes]);
  });

  it("splits into a new chunk once the point cap would be exceeded", () => {
    const big = stroke(300);
    const strokes = [big, big];
    const chunks = pendingChunks(strokes, 0);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toEqual([big]);
    expect(chunks[1]).toEqual([big]);
  });

  it("respects the from cursor", () => {
    const strokes = [stroke(2), stroke(2), stroke(2)];
    expect(pendingChunks(strokes, 1)).toEqual([[strokes[1], strokes[2]]]);
  });
});

function renderDraw(view: DoodlePlayerView, send: (action: DoodleAction) => void = vi.fn<(action: DoodleAction) => void>()) {
  return render(
    <LocaleProvider>
      <PhoneDraw view={view} roomCode="BKTZ" clock={CLOCK} send={send} />
    </LocaleProvider>,
  );
}

/** Every drawing renders its own squiggle button; only the active one is on screen. */
function clickSquiggle(): void {
  const [squiggle] = screen.getAllByText("Can't draw? Send a squiggle");
  if (squiggle === undefined) throw new Error("expected a squiggle button");
  fireEvent.click(squiggle);
}

describe("PhoneDraw", () => {
  it("shows the progress label and the active prompt", () => {
    renderDraw(baseView());
    expect(screen.getByText("Drawing 1 of 2")).toBeTruthy();
    expect(screen.getByText("Draw this — no words: a cat riding a skateboard")).toBeTruthy();
  });

  it("switches to the second prompt on Next drawing", () => {
    renderDraw(baseView());
    fireEvent.click(screen.getByText("Next drawing"));
    expect(screen.getByText("Drawing 2 of 2")).toBeTruthy();
    expect(screen.getByText("Draw this — no words: a dog on a scooter")).toBeTruthy();
  });

  it("the squiggle button submits a valid drawing and marks it done", () => {
    const send = vi.fn<(action: DoodleAction) => void>();
    renderDraw(baseView(), send);
    clickSquiggle();
    const strokeCalls = send.mock.calls.filter(([action]) => action.type === "strokes");
    expect(strokeCalls.length).toBeGreaterThan(0);
    expect(strokeCalls[0]?.[0]).toMatchObject({ type: "strokes", drawingId: "p1:0", from: 0 });
    expect(send).toHaveBeenCalledWith({ type: "doodle-done", drawingId: "p1:0" });
  });

  it("disables the squiggle button once that drawing is done", () => {
    renderDraw(baseView({ myDone: { "p1:0": true } }));
    const [squiggle] = screen.getAllByText("Can't draw? Send a squiggle");
    expect(squiggle?.hasAttribute("disabled")).toBe(true);
  });

  it("shows a waiting state when there are no prompts yet", () => {
    renderDraw(baseView({ myPrompts: [] }));
    expect(screen.getByText("Waiting on your prompts…")).toBeTruthy();
  });

  it("the done button submits doodle-done once, and stays disabled once done", () => {
    const send = vi.fn<(action: DoodleAction) => void>();
    renderDraw(baseView(), send);
    const [doneButton] = screen.getAllByText("I'm done with this one");
    if (doneButton === undefined) throw new Error("expected a done button");
    fireEvent.click(doneButton);
    expect(send).toHaveBeenCalledWith({ type: "doodle-done", drawingId: "p1:0" });
  });

  it("renders in Hebrew when the locale is set", () => {
    window.localStorage.setItem("opg:locale", "he");
    renderDraw(baseView());
    expect(screen.getByText("ציור 1 מתוך 2")).toBeTruthy();
    expect(screen.getByText("ציירו את זה — בלי מילים: a cat riding a skateboard")).toBeTruthy();
  });
});

describe("PhoneDraw after a remount", () => {
  const DRAWING = "p1:0";

  function mirror(strokes: number): Doodle {
    return { v: 1, s: Array.from({ length: strokes }, () => stroke(2)) };
  }

  function withMirror(strokes: number): void {
    window.sessionStorage.setItem(storageKey("BKTZ", DRAWING), JSON.stringify(mirror(strokes)));
  }

  it("resumes at the acked count instead of sending from: 0", () => {
    withMirror(5);
    const send = vi.fn<(action: DoodleAction) => void>();
    renderDraw(baseView({ myStrokeCounts: { [DRAWING]: 3 } }), send);
    const strokeCalls = send.mock.calls.map(([action]) => action).filter((action) => action.type === "strokes");
    expect(strokeCalls).toHaveLength(1);
    expect(strokeCalls[0]).toMatchObject({ drawingId: DRAWING, from: 3 });
    expect(strokeCalls[0]?.type === "strokes" && strokeCalls[0].strokes).toHaveLength(2);
  });

  it("keeps the strokes the room already has, instead of coming back blank", () => {
    withMirror(3);
    renderDraw(baseView({ myStrokeCounts: { [DRAWING]: 3 } }));
    expect(screen.getByText("Your drawing for a cat riding a skateboard: 3 strokes so far")).toBeTruthy();
  });

  it("says nothing when the pad and the room are already level", () => {
    withMirror(3);
    const send = vi.fn<(action: DoodleAction) => void>();
    renderDraw(baseView({ myStrokeCounts: { [DRAWING]: 3 } }), send);
    expect(send.mock.calls.filter(([action]) => action.type === "strokes")).toHaveLength(0);
  });

  it("stays on the room's count when there is no mirror to restore", () => {
    const send = vi.fn<(action: DoodleAction) => void>();
    renderDraw(baseView({ myStrokeCounts: { [DRAWING]: 3 } }), send);
    // Nothing to send: the pad came back blank, and the room's three strokes are the only copy
    // of the drawing left. Sending from 0 here would be refused chunk after chunk.
    expect(send.mock.calls.filter(([action]) => action.type === "strokes")).toHaveLength(0);
  });

  it("sends nothing for a drawing the artist has already finished", () => {
    withMirror(5);
    const send = vi.fn<(action: DoodleAction) => void>();
    renderDraw(baseView({ myStrokeCounts: { [DRAWING]: 3 }, myDone: { [DRAWING]: true } }), send);
    expect(send.mock.calls.filter(([action]) => action.type === "strokes")).toHaveLength(0);
  });
});

describe("restoreMirror", () => {
  it("restores a mirror level with the ack — the ordinary reconnect", () => {
    const doodle = { v: 1 as const, s: [stroke(2), stroke(2)] };
    window.sessionStorage.setItem(storageKey("BKTZ", "p1:0"), JSON.stringify(doodle));
    expect(restoreMirror("BKTZ", "p1:0", 2)).toEqual(doodle);
  });

  it("restores a mirror ahead of the ack", () => {
    const doodle = { v: 1 as const, s: [stroke(2), stroke(2)] };
    window.sessionStorage.setItem(storageKey("BKTZ", "p1:0"), JSON.stringify(doodle));
    expect(restoreMirror("BKTZ", "p1:0", 1)).toEqual(doodle);
  });

  it("drops a mirror behind the ack", () => {
    window.sessionStorage.setItem(storageKey("BKTZ", "p1:0"), JSON.stringify({ v: 1, s: [stroke(2)] }));
    expect(restoreMirror("BKTZ", "p1:0", 2)).toBeUndefined();
  });

  it("is undefined when nothing was mirrored", () => {
    expect(restoreMirror("BKTZ", "p1:0", 0)).toBeUndefined();
  });
});

describe("resyncCursor", () => {
  it("pulls the cursor back when the server's ack falls behind it", () => {
    const ref = sentCursorsRef({ "p1:0": 5 });
    resyncCursor(ref, "p1:0", 2);
    expect(ref.current["p1:0"]).toBe(2);
  });

  it("leaves the cursor alone once the ack has caught up", () => {
    const ref = sentCursorsRef({ "p1:0": 5 });
    resyncCursor(ref, "p1:0", 5);
    expect(ref.current["p1:0"]).toBe(5);
  });

  it("treats a drawing never sent as cursor 0", () => {
    const ref = sentCursorsRef();
    resyncCursor(ref, "p1:0", 0);
    expect(ref.current["p1:0"]).toBeUndefined();
  });

  it("never runs the cursor forward past what this phone has sent", () => {
    const ref = sentCursorsRef({ "p1:0": 2 });
    resyncCursor(ref, "p1:0", 4);
    expect(ref.current["p1:0"]).toBe(2);
  });
});

describe("readMirror", () => {
  const KEY = storageKey("BKTZ", "p1:0");

  it("returns null when nothing is stored", () => {
    expect(readMirror("BKTZ", "p1:0")).toBeNull();
  });

  it("returns the parsed doodle when it validates", () => {
    const doodle = { v: 1, s: [stroke(2)] };
    window.sessionStorage.setItem(KEY, JSON.stringify(doodle));
    expect(readMirror("BKTZ", "p1:0")).toEqual(doodle);
  });

  it("returns null for invalid JSON", () => {
    window.sessionStorage.setItem(KEY, "{not json");
    expect(readMirror("BKTZ", "p1:0")).toBeNull();
  });

  it("returns null for JSON that doesn't validate as a doodle", () => {
    window.sessionStorage.setItem(KEY, JSON.stringify({ v: 1, s: "nope" }));
    expect(readMirror("BKTZ", "p1:0")).toBeNull();
  });
});

describe("commitDrawingChange", () => {
  it("mirrors, sends the new strokes, and moves the cursor to the end", () => {
    const send = vi.fn<(action: DoodleAction) => void>();
    const sentRef = sentCursorsRef();
    const doodle = { v: 1 as const, s: [stroke(2)] };
    commitDrawingChange({ roomCode: "BKTZ", drawingId: "p1:0", doodle, sentRef, send });
    expect(send).toHaveBeenCalledWith({ type: "strokes", drawingId: "p1:0", from: 0, strokes: [doodle.s[0]] });
    expect(sentRef.current["p1:0"]).toBe(1);
    expect(JSON.parse(window.sessionStorage.getItem(storageKey("BKTZ", "p1:0")) ?? "null")).toEqual(doodle);
  });

  it("sends only the strokes past the cursor", () => {
    const send = vi.fn<(action: DoodleAction) => void>();
    const sentRef = sentCursorsRef({ "p1:0": 1 });
    const doodle = { v: 1 as const, s: [stroke(2), stroke(2)] };
    commitDrawingChange({ roomCode: "BKTZ", drawingId: "p1:0", doodle, sentRef, send });
    expect(send).toHaveBeenCalledWith({ type: "strokes", drawingId: "p1:0", from: 1, strokes: [doodle.s[1]] });
    expect(sentRef.current["p1:0"]).toBe(2);
  });

  it("leaves the cursor on the room's count when the pad holds less than the room does, by default", () => {
    // The pad of a phone whose mirror was gone starts blank while the room still holds strokes.
    // Dropping the cursor to the pad's own count is what used to send `from: 0` into a void.
    // `canTruncate` defaults to false, so a caller that doesn't say otherwise keeps this guard.
    const send = vi.fn<(action: DoodleAction) => void>();
    const sentRef = sentCursorsRef({ "p1:0": 3 });
    commitDrawingChange({ roomCode: "BKTZ", drawingId: "p1:0", doodle: { v: 1, s: [stroke(2)] }, sentRef, send });
    expect(send).not.toHaveBeenCalled();
    expect(sentRef.current["p1:0"]).toBe(3);
  });

  // Issue #37: undo and clear are a real shrink of the pad, and, once the caller knows this pad's
  // starting point can be trusted (canTruncate: true), must reach the room as a truncate — not be
  // swallowed the way a lost-mirror shrink is above.
  it("sends a truncate when the pad shrinks and canTruncate is true", () => {
    const send = vi.fn<(action: DoodleAction) => void>();
    const sentRef = sentCursorsRef({ "p1:0": 3 });
    commitDrawingChange({
      roomCode: "BKTZ",
      drawingId: "p1:0",
      doodle: { v: 1, s: [stroke(2)] },
      sentRef,
      send,
      canTruncate: true,
    });
    expect(send).toHaveBeenCalledWith({ type: "truncate", drawingId: "p1:0", from: 3, to: 1 });
    expect(sentRef.current["p1:0"]).toBe(1);
  });

  it("sends a truncate to 0 for a clear", () => {
    const send = vi.fn<(action: DoodleAction) => void>();
    const sentRef = sentCursorsRef({ "p1:0": 2 });
    commitDrawingChange({
      roomCode: "BKTZ",
      drawingId: "p1:0",
      doodle: { v: 1, s: [] },
      sentRef,
      send,
      canTruncate: true,
    });
    expect(send).toHaveBeenCalledWith({ type: "truncate", drawingId: "p1:0", from: 2, to: 0 });
    expect(sentRef.current["p1:0"]).toBe(0);
  });
});
