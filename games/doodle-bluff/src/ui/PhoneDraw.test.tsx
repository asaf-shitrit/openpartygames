// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { MutableRefObject } from "react";
import type { ServerClock } from "@opg/ui";
import type { Stroke } from "@opg/ui";
import type { DoodleAction, DoodlePlayerView } from "../state";
import type { SentCursors } from "./PhoneDraw";
import { commitDrawingChange, PhoneDraw, pendingChunks, readMirror, resyncCursor, storageKey } from "./PhoneDraw";

function sentCursorsRef(initial: SentCursors = {}): MutableRefObject<SentCursors> {
  return { current: initial };
}

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
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

describe("PhoneDraw", () => {
  it("shows the progress label and the active prompt", () => {
    render(<PhoneDraw view={baseView()} roomCode="BKTZ" clock={CLOCK} send={vi.fn<(action: DoodleAction) => void>()} />);
    expect(screen.getByText("Drawing 1 of 2")).toBeTruthy();
    expect(screen.getByText("Draw this — no words: a cat riding a skateboard")).toBeTruthy();
  });

  it("switches to the second prompt on Next drawing", () => {
    render(<PhoneDraw view={baseView()} roomCode="BKTZ" clock={CLOCK} send={vi.fn<(action: DoodleAction) => void>()} />);
    fireEvent.click(screen.getByText("Next drawing"));
    expect(screen.getByText("Drawing 2 of 2")).toBeTruthy();
    expect(screen.getByText("Draw this — no words: a dog on a scooter")).toBeTruthy();
  });

  it("the squiggle button submits a valid drawing and marks it done", () => {
    const send = vi.fn<(action: DoodleAction) => void>();
    render(<PhoneDraw view={baseView()} roomCode="BKTZ" clock={CLOCK} send={send} />);
    fireEvent.click(screen.getByText("Can't draw? Send a squiggle"));
    const strokeCalls = send.mock.calls.filter(([action]) => action.type === "strokes");
    expect(strokeCalls.length).toBeGreaterThan(0);
    expect(strokeCalls[0]?.[0]).toMatchObject({ type: "strokes", drawingId: "p1:0", from: 0 });
    expect(send).toHaveBeenCalledWith({ type: "doodle-done", drawingId: "p1:0" });
  });

  it("disables the squiggle button once that drawing is done", () => {
    render(
      <PhoneDraw
        view={baseView({ myDone: { "p1:0": true } })}
        roomCode="BKTZ"
        clock={CLOCK}
        send={vi.fn<(action: DoodleAction) => void>()}
      />,
    );
    expect(screen.getByText("Can't draw? Send a squiggle").hasAttribute("disabled")).toBe(true);
  });

  it("shows a waiting state when there are no prompts yet", () => {
    render(<PhoneDraw view={baseView({ myPrompts: [] })} roomCode="BKTZ" clock={CLOCK} send={vi.fn<(action: DoodleAction) => void>()} />);
    expect(screen.getByText("Waiting on your prompts…")).toBeTruthy();
  });

  it("the done button submits doodle-done once, and stays disabled once done", () => {
    const send = vi.fn<(action: DoodleAction) => void>();
    render(<PhoneDraw view={baseView()} roomCode="BKTZ" clock={CLOCK} send={send} />);
    const [doneButton] = screen.getAllByText("I'm done with this one");
    if (doneButton === undefined) throw new Error("expected a done button");
    fireEvent.click(doneButton);
    expect(send).toHaveBeenCalledWith({ type: "doodle-done", drawingId: "p1:0" });
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
  it("mirrors, sends the new strokes, and reports the new count", () => {
    const send = vi.fn<(action: DoodleAction) => void>();
    const onStrokeCountChange = vi.fn<(drawingId: string, count: number) => void>();
    const sentRef = sentCursorsRef();
    const doodle = { v: 1 as const, s: [stroke(2)] };
    commitDrawingChange({ roomCode: "BKTZ", drawingId: "p1:0", doodle, sentRef, send, onStrokeCountChange });
    expect(send).toHaveBeenCalledWith({ type: "strokes", drawingId: "p1:0", from: 0, strokes: [doodle.s[0]] });
    expect(onStrokeCountChange).toHaveBeenCalledWith("p1:0", 1);
    expect(JSON.parse(window.sessionStorage.getItem(storageKey("BKTZ", "p1:0")) ?? "null")).toEqual(doodle);
  });
});
