// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { PlayerSummary } from "@opg/protocol";
import type { ServerClock } from "@opg/ui";
import { LocaleProvider } from "@opg/i18n";
import type { DoodleGalleryEntry } from "../state";
import { cascadeDelayMs, galleryFit, HostGallery } from "./HostGallery";

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

  it("still shows every artist and title in a full room's sixteen drawings", () => {
    renderGallery(Array.from({ length: 16 }, (_, index) => entry({ drawingId: `d${index}`, title: `title ${index}` })));
    expect(screen.getAllByText("Priya")).toHaveLength(16);
    expect(screen.getByText("title 15")).toBeTruthy();
  });

  it("gives up the found-by line in a full room, where there is no row to spare for it", () => {
    renderGallery(Array.from({ length: 16 }, (_, index) => entry({ drawingId: `d${index}` })));
    expect(screen.queryByText("Found by 2 players")).toBeNull();
  });
});

describe("galleryFit", () => {
  // The stage is 1080px and does not scroll, so these numbers are the whole reason a full
  // gallery is visible at all: 16 drawings are three rows, and three rows of the roomy tile
  // ran more than 1000px past the bottom edge.
  it("gives a small room big drawings and the full card", () => {
    expect(galleryFit(6)).toEqual({ doodleSize: 220, withStatus: true });
  });

  it("shrinks the drawing when the gallery needs a second row", () => {
    const fit = galleryFit(12);
    expect(fit.withStatus).toBe(true);
    expect(fit.doodleSize).toBeLessThan(220);
  });

  it("drops the found-by line and shrinks further for a full room's three rows", () => {
    const fit = galleryFit(16);
    expect(fit.withStatus).toBe(false);
    expect(fit.doodleSize).toBeLessThan(galleryFit(12).doodleSize);
  });

  it("keeps three rows of tiles inside the stage", () => {
    // 808px of stage for the grid, two 20px gaps, and a tile is its drawing plus its chrome.
    const fit = galleryFit(16);
    expect(3 * (fit.doodleSize + 177) + 2 * 20).toBeLessThanOrEqual(808);
  });

  it("treats an empty gallery as one row", () => {
    expect(galleryFit(0).doodleSize).toBe(220);
  });
});
