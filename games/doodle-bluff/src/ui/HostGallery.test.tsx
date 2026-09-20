// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { PlayerSummary } from "@opg/protocol";
import type { ServerClock } from "@opg/ui";
import { LocaleProvider } from "@opg/i18n";
import type { DoodleGalleryEntry } from "../state";
import { cascadeDelayMs, HostGallery } from "./HostGallery";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

const CLOCK: ServerClock = { now: () => 1000 };

const PLAYERS: PlayerSummary[] = [
  { id: "priya", name: "Priya", avatar: "drop", connected: true, isVip: false, crowns: 0, waitingForNextGame: false },
];

function entry(overrides: Partial<DoodleGalleryEntry> = {}): DoodleGalleryEntry {
  return {
    drawingId: "priya:0",
    artistId: "priya",
    doodle: { v: 1, s: [] },
    title: "a dog on a scooter",
    shown: true,
    foundByCount: 2,
    ...overrides,
  };
}

describe("cascadeDelayMs", () => {
  it("grows with the index, capped at the max", () => {
    expect(cascadeDelayMs(0)).toBe(0);
    expect(cascadeDelayMs(1)).toBe(70);
    expect(cascadeDelayMs(100)).toBe(900);
  });
});

function renderGallery(entries: DoodleGalleryEntry[]) {
  return render(
    <LocaleProvider>
      <HostGallery entries={entries} players={PLAYERS} clock={CLOCK} />
    </LocaleProvider>,
  );
}

describe("HostGallery", () => {
  it("renders the heading and every entry's title and artist", () => {
    renderGallery([entry()]);
    expect(screen.getByText("The gallery — gone after tonight")).toBeTruthy();
    expect(screen.getByText("a dog on a scooter")).toBeTruthy();
    expect(screen.getByText("Priya")).toBeTruthy();
    expect(screen.getByText("Found by 2 players")).toBeTruthy();
  });

  it("marks a drawing that was never shown", () => {
    renderGallery([entry({ shown: false, foundByCount: null })]);
    expect(screen.getByText("never shown")).toBeTruthy();
  });

  it("singular found-by copy for one finder", () => {
    renderGallery([entry({ foundByCount: 1 })]);
    expect(screen.getByText("Found by 1 player")).toBeTruthy();
  });

  it("renders in Hebrew when the locale is set", () => {
    window.localStorage.setItem("opg:locale", "he");
    renderGallery([entry()]);
    expect(screen.getByText("הגלריה — נעלמת אחרי הערב")).toBeTruthy();
    expect(screen.getByText("נמצא על ידי 2 שחקנים")).toBeTruthy();
  });
});
