// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ServerClock } from "@opg/ui";
import type { DoodleAction, DoodlePlayerView } from "../state";
import { PhoneTitle } from "./PhoneTitle";

afterEach(() => {
  cleanup();
});

const CLOCK: ServerClock = { now: () => 1000 };

function baseView(overrides: Partial<DoodlePlayerView> = {}): DoodlePlayerView {
  return {
    phase: "title",
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
    titledCount: 1,
    options: null,
    myVote: null,
    votedCount: 0,
    reveal: null,
    myPoints: null,
    totals: {},
    ...overrides,
  };
}

describe("PhoneTitle", () => {
  it("shows the sit-tight card for the artist", () => {
    render(<PhoneTitle view={baseView({ isArtist: true })} clock={CLOCK} send={vi.fn<(action: DoodleAction) => void>()} />);
    expect(screen.getByText("Your drawing — sit tight")).toBeTruthy();
  });

  it("submits a trimmed title", () => {
    const send = vi.fn<(action: DoodleAction) => void>();
    render(<PhoneTitle view={baseView()} clock={CLOCK} send={send} />);
    fireEvent.change(screen.getByLabelText("Your title"), { target: { value: "  a lie  " } });
    fireEvent.click(screen.getByText("Submit title"));
    expect(send).toHaveBeenCalledWith({ type: "title", text: "a lie" });
  });

  it("disables submit for an empty title", () => {
    render(<PhoneTitle view={baseView()} clock={CLOCK} send={vi.fn<(action: DoodleAction) => void>()} />);
    expect(screen.getByText("Submit title").closest("button")?.hasAttribute("disabled")).toBe(true);
  });

  it("shows warm copy for each title error", () => {
    const { rerender } = render(
      <PhoneTitle view={baseView({ titleError: "truth" })} clock={CLOCK} send={vi.fn<(action: DoodleAction) => void>()} />,
    );
    expect(screen.getByText("That's the real title! Write a lie instead.")).toBeTruthy();
    rerender(<PhoneTitle view={baseView({ titleError: "duplicate" })} clock={CLOCK} send={vi.fn<(action: DoodleAction) => void>()} />);
    expect(screen.getByText("Someone already wrote that. Try another.")).toBeTruthy();
    rerender(<PhoneTitle view={baseView({ titleError: "invalid" })} clock={CLOCK} send={vi.fn<(action: DoodleAction) => void>()} />);
    expect(screen.getByText("Keep it between 1 and 40 characters.")).toBeTruthy();
  });

  it("shows the locked card once a title is submitted", () => {
    render(<PhoneTitle view={baseView({ myTitle: "a lie" })} clock={CLOCK} send={vi.fn<(action: DoodleAction) => void>()} />);
    expect(screen.getByText("Title locked in")).toBeTruthy();
  });
});
