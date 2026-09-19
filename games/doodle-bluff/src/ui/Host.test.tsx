// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { HostRoomView, PlayerSummary } from "@opg/protocol";
import type { ServerClock } from "@opg/ui";
import type { DoodleHostView } from "../state";
import { Host } from "./Host";

afterEach(() => {
  cleanup();
});

const CLOCK: ServerClock = { now: () => 1000 };

const PLAYERS: PlayerSummary[] = [
  { id: "maya", name: "Maya", avatar: "star", connected: true, isVip: true, crowns: 0, waitingForNextGame: false },
  { id: "dov", name: "Dov", avatar: "toast", connected: true, isVip: false, crowns: 0, waitingForNextGame: false },
];

function room(): HostRoomView {
  return {
    role: "host",
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

function hostView(overrides: Partial<DoodleHostView> = {}): DoodleHostView {
  return {
    phase: "draw",
    playerIds: ["maya", "dov"],
    drawnIds: [],
    drawnCounts: {},
    roundNumber: 1,
    roundCount: 4,
    artistId: null,
    doodle: null,
    writtenIds: [],
    votedIds: [],
    options: null,
    reveal: null,
    pointsThisRound: null,
    totals: { maya: 0, dov: 0 },
    gallery: null,
    ...overrides,
  };
}

describe("Host", () => {
  it("draw: shows every player and who is done", () => {
    render(
      <Host
        view={hostView({ drawnIds: ["maya"], drawnCounts: { maya: 2, dov: 0 } })}
        room={room()}
        deadline={null}
        timerStartedAt={null}
        clock={CLOCK}
      />,
    );
    expect(screen.getByText("Everyone is drawing")).toBeTruthy();
    expect(screen.getByText("Both done")).toBeTruthy();
    expect(screen.getByText("Drawing 1 of 2")).toBeTruthy();
  });

  it("draw: counts a finished first drawing, so the TV moves while a player does", () => {
    render(
      <Host
        view={hostView({ drawnCounts: { maya: 1, dov: 0 } })}
        room={room()}
        deadline={null}
        timerStartedAt={null}
        clock={CLOCK}
      />,
    );
    expect(screen.getByText("Drawing 2 of 2")).toBeTruthy();
    expect(screen.getByText("Drawing 1 of 2")).toBeTruthy();
  });

  it("title: shows who has written and marks the artist", () => {
    render(
      <Host
        view={hostView({ phase: "title", artistId: "maya", doodle: { v: 1, s: [] }, writtenIds: ["dov"] })}
        room={room()}
        deadline={2000}
        timerStartedAt={1000}
        clock={CLOCK}
      />,
    );
    expect(screen.getByText("drew this one")).toBeTruthy();
    expect(screen.getByText(/have written a title/)).toBeTruthy();
  });

  it("vote: shows the options", () => {
    render(
      <Host
        view={hostView({
          phase: "vote",
          artistId: "maya",
          doodle: { v: 1, s: [] },
          options: [{ id: "o1", text: "a cat riding a skateboard" }],
        })}
        room={room()}
        deadline={2000}
        timerStartedAt={1000}
        clock={CLOCK}
      />,
    );
    expect(screen.getByText("Which title is real?")).toBeTruthy();
    expect(screen.getByText("a cat riding a skateboard")).toBeTruthy();
  });

  it("gallery: renders the gallery grid", () => {
    render(
      <Host
        view={hostView({
          phase: "gallery",
          gallery: [{ drawingId: "maya:0", artistId: "maya", doodle: { v: 1, s: [] }, title: "a duck on a unicycle", shown: true, foundByCount: 1 }],
        })}
        room={room()}
        deadline={null}
        timerStartedAt={null}
        clock={CLOCK}
      />,
    );
    expect(screen.getByText("a duck on a unicycle")).toBeTruthy();
  });
});
