// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ServerClock } from "@opg/ui";
import type { DoodleAction, DoodlePlayerView } from "../state";
import { PhoneVote } from "./PhoneVote";

afterEach(() => {
  cleanup();
});

const CLOCK: ServerClock = { now: () => 1000 };

function baseView(overrides: Partial<DoodlePlayerView> = {}): DoodlePlayerView {
  return {
    phase: "vote",
    playerCount: 4,
    myPrompts: [],
    myStrokeCounts: {},
    myDone: {},
    drawnCount: 4,
    roundNumber: 1,
    roundCount: 6,
    currentDrawingId: "d1",
    isArtist: false,
    doodle: { v: 1, s: [] },
    myTitle: null,
    titleError: null,
    titledCount: 3,
    options: [
      { id: "o1", text: "a cat riding a skateboard", mine: false },
      { id: "o2", text: "a dog on a scooter", mine: true },
      { id: "o3", text: "a duck on a unicycle", mine: false },
    ],
    myVote: null,
    votedCount: 0,
    reveal: null,
    myPoints: null,
    totals: {},
    ...overrides,
  };
}

describe("PhoneVote", () => {
  it("shows the spectator card for the artist", () => {
    render(<PhoneVote view={baseView({ isArtist: true })} clock={CLOCK} send={vi.fn<(action: DoodleAction) => void>()} />);
    expect(screen.getByText("The room is voting")).toBeTruthy();
  });

  it("disables the voter's own option", () => {
    render(<PhoneVote view={baseView()} clock={CLOCK} send={vi.fn<(action: DoodleAction) => void>()} />);
    expect(screen.getByText("a dog on a scooter").closest("button")?.hasAttribute("disabled")).toBe(true);
  });

  it("locks in a vote for a non-own option", () => {
    const send = vi.fn<(action: DoodleAction) => void>();
    render(<PhoneVote view={baseView()} clock={CLOCK} send={send} />);
    fireEvent.click(screen.getByText("a cat riding a skateboard"));
    fireEvent.click(screen.getByText("Lock in"));
    expect(send).toHaveBeenCalledWith({ type: "vote", optionId: "o1" });
  });

  it("disables Lock in before a pick is made", () => {
    render(<PhoneVote view={baseView()} clock={CLOCK} send={vi.fn<(action: DoodleAction) => void>()} />);
    expect(screen.getByText("Lock in").closest("button")?.hasAttribute("disabled")).toBe(true);
  });

  it("shows the locked card once a vote is cast", () => {
    render(<PhoneVote view={baseView({ myVote: "o1" })} clock={CLOCK} send={vi.fn<(action: DoodleAction) => void>()} />);
    expect(screen.getByText("Vote locked in")).toBeTruthy();
  });
});
