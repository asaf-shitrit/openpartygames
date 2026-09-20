// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { PlayerRoomView, PlayerSummary } from "@opg/protocol";
import type { ServerClock } from "@opg/ui";
import { LocaleProvider } from "@opg/i18n";
import type { DoodleAction, DoodleHostView, DoodlePlayerView } from "../state";
import { Phone } from "./Phone";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

const CLOCK: ServerClock = { now: () => 1000 };

const PLAYERS: PlayerSummary[] = [
  { id: "maya", name: "Maya", avatar: "star", connected: true, isVip: true, crowns: 0, waitingForNextGame: false },
];

function room(): PlayerRoomView {
  return {
    role: "player",
    you: "maya",
    code: "BKTZ",
    phase: "in-game",
    lobbyScreen: "join",
    players: PLAYERS,
    vipId: "maya",
    locked: false,
    games: [],
    selectedGameId: "doodle-bluff",
    packs: [],
    lastResult: null,
    game: null,
    serverNow: 1000,
    sharedScreen: true,
  };
}

function playerView(overrides: Partial<DoodlePlayerView> = {}): DoodlePlayerView {
  return {
    phase: "draw",
    playerCount: 3,
    myPrompts: [],
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

function renderPhone(view: DoodlePlayerView, stage: DoodleHostView | null = null) {
  return render(
    <LocaleProvider>
      <Phone view={view} room={room()} deadline={null} timerStartedAt={null} clock={CLOCK} send={vi.fn<(action: DoodleAction) => void>()} stage={stage} />
    </LocaleProvider>,
  );
}

describe("Phone", () => {
  it("renders the draw phase", () => {
    renderPhone(playerView());
    expect(screen.getByText("Waiting on your prompts…")).toBeTruthy();
  });

  it("shows Look up on the gallery phase with a shared screen", () => {
    renderPhone(playerView({ phase: "gallery" }));
    expect(screen.getByText("Look up")).toBeTruthy();
  });

  it("mirrors the gallery grid on a phone in a no-TV room", () => {
    const stage: DoodleHostView = {
      phase: "gallery",
      playerIds: ["maya"],
      drawnIds: [],
      drawnCounts: {},
      roundNumber: 0,
      roundCount: 0,
      artistId: null,
      doodle: null,
      writtenIds: [],
      votedIds: [],
      options: null,
      reveal: null,
      pointsThisRound: null,
      totals: { maya: 0 },
      gallery: [
        { drawingId: "maya:0", artistId: "maya", doodle: { v: 1, s: [] }, title: "a cat riding a skateboard", shown: true, foundByCount: 1 },
      ],
    };
    renderPhone(playerView({ phase: "gallery" }), stage);
    expect(screen.getByText("a cat riding a skateboard")).toBeTruthy();
  });

  it("renders in Hebrew when the locale is set", () => {
    window.localStorage.setItem("opg:locale", "he");
    renderPhone(playerView({ phase: "gallery" }));
    expect(screen.getByText("תסתכלו למעלה")).toBeTruthy();
    expect(screen.getByText("הגלריה על הטלוויזיה.")).toBeTruthy();
  });
});
