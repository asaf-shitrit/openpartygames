// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { PlayerSummary } from "@opg/protocol";
import { LocaleProvider } from "@opg/i18n";
import type { DoodleHostView } from "../state";
import { isStagedPhase, PhoneStage } from "./PhoneStage";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

const PLAYERS: PlayerSummary[] = [
  { id: "maya", name: "Maya", avatar: "star", connected: true, isVip: true, crowns: 0, waitingForNextGame: false },
  { id: "dov", name: "Dov", avatar: "toast", connected: true, isVip: false, crowns: 0, waitingForNextGame: false },
  { id: "priya", name: "Priya", avatar: "drop", connected: true, isVip: false, crowns: 0, waitingForNextGame: false },
];

function hostView(overrides: Partial<DoodleHostView> = {}): DoodleHostView {
  return {
    phase: "draw",
    playerIds: ["maya", "dov", "priya"],
    drawnIds: [],
    drawnCounts: {},
    roundNumber: 1,
    roundCount: 6,
    artistId: null,
    doodle: null,
    writtenIds: [],
    votedIds: [],
    options: null,
    reveal: null,
    pointsThisRound: null,
    totals: {},
    gallery: null,
    ...overrides,
  };
}

function renderStage(phase: "draw" | "title" | "vote", stage: DoodleHostView | null) {
  return render(
    <LocaleProvider>
      <PhoneStage phase={phase} stage={stage} players={PLAYERS} />
    </LocaleProvider>,
  );
}

describe("isStagedPhase", () => {
  it("covers the three phases with their own controls", () => {
    expect(isStagedPhase("draw")).toBe(true);
    expect(isStagedPhase("title")).toBe(true);
    expect(isStagedPhase("vote")).toBe(true);
  });

  it("leaves reveal and gallery to the host screens they already reuse", () => {
    expect(isStagedPhase("reveal")).toBe(false);
    expect(isStagedPhase("gallery")).toBe(false);
  });
});

describe("PhoneStage", () => {
  it("renders nothing in a room with a shared screen", () => {
    const { container } = renderStage("vote", null);
    expect(container.innerHTML).toBe("");
  });

  it("shows who has finished drawing, and how many", () => {
    renderStage("draw", hostView({ drawnIds: ["maya"] }));
    expect(screen.getByText("Everyone is drawing")).toBeTruthy();
    expect(screen.getByText("1 of 3 finished")).toBeTruthy();
    expect(screen.getAllByTestId("stage-done")).toHaveLength(1);
  });

  it("counts titles against the players who may write one, leaving the artist out", () => {
    renderStage("title", hostView({ phase: "title", artistId: "priya", writtenIds: ["maya"] }));
    expect(screen.getByText("Who's written")).toBeTruthy();
    expect(screen.getByText("1 of 2 have written a title")).toBeTruthy();
    expect(screen.queryByLabelText("Priya's avatar")).toBeNull();
  });

  it("shows who has voted without ever saying what they picked", () => {
    renderStage("vote", hostView({ phase: "vote", artistId: "priya", votedIds: ["maya", "dov"] }));
    expect(screen.getByText("The room is voting")).toBeTruthy();
    expect(screen.getByText("2 of 2 voted")).toBeTruthy();
    expect(screen.getAllByTestId("stage-done")).toHaveLength(2);
  });

  it("marks a player who is still working without relying on contrast alone", () => {
    renderStage("draw", hostView({ drawnIds: ["maya"] }));
    // Two of the three carry no check badge; the badge, not the dimming, is the signal.
    expect(screen.getAllByTestId("stage-done")).toHaveLength(1);
    expect(screen.getAllByLabelText(/avatar/)).toHaveLength(3);
  });

  it("renders in Hebrew when the locale is set", () => {
    window.localStorage.setItem("opg:locale", "he");
    renderStage("draw", hostView({ drawnIds: ["maya", "dov"] }));
    expect(screen.getByText("כולם מציירים")).toBeTruthy();
    expect(screen.getByText("2 מתוך 3 סיימו")).toBeTruthy();
  });
});
