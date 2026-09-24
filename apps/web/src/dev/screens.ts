// Every screen a game preview covers, flattened into cases with stable ids. The fixtures
// themselves live in each game's preview.ts; this only indexes them, so the dev gallery and
// the layout suite walk exactly the same list.
//
// A case is a discriminated union on its surface, so a host screen carries a host room and a
// phone screen carries a player room by construction. The gallery then has nothing to check:
// a preview whose room disagrees with its surface is dropped here, where it can be tested,
// rather than guarded against in a component where it can never happen.
import type { HostRoomView, PlayerRoomView } from "@opg/protocol";
import { doodleBluffPreviews } from "@opg/game-doodle-bluff/preview";
import { imposterPreviews } from "@opg/game-imposter/preview";
import { mostLikelyToPreviews } from "@opg/game-most-likely-to/preview";
import { realOrNahPreviews } from "@opg/game-real-or-nah/preview";

export type Surface = "host" | "phone";

/** The shape every game's preview entries share. */
export interface PreviewEntry {
  label: string;
  surface: Surface;
  view: unknown;
  room: HostRoomView | PlayerRoomView;
}

interface CaseBase {
  /** Stable id, and what /dev/screens takes as its `id` parameter. */
  id: string;
  gameId: string;
  label: string;
  view: unknown;
}

export interface HostCase extends CaseBase {
  surface: "host";
  room: HostRoomView;
}

export interface PhoneCase extends CaseBase {
  surface: "phone";
  room: PlayerRoomView;
}

export type ScreenCase = HostCase | PhoneCase;

/** What a screen's game needs to render it: everything timed, and the no-TV stage. */
export interface ScreenTiming {
  deadline: number | null;
  timerStartedAt: number | null;
  /** The host view a no-TV phone stages, or null in a room with a shared screen. */
  stage: unknown;
  /** Where to freeze the clock: the phase start, or the room's own clock when nothing is timed. */
  anchor: number;
}

export function timingOf(room: HostRoomView | PlayerRoomView): ScreenTiming {
  const game = room.game;
  if (game === null) {
    return { deadline: null, timerStartedAt: null, stage: null, anchor: room.serverNow };
  }
  return {
    deadline: game.deadline,
    timerStartedAt: game.timerStartedAt,
    stage: game.stage,
    // A phase with no deadline has no timer start either, so the room's own clock is the anchor.
    anchor: game.timerStartedAt ?? room.serverNow,
  };
}

function caseOf(gameId: string, preview: PreviewEntry, index: number): ScreenCase | null {
  const base = { id: `${gameId}/${index}`, gameId, label: preview.label, view: preview.view };
  if (preview.surface === "host" && preview.room.role === "host") {
    return { ...base, surface: "host", room: preview.room };
  }
  if (preview.surface === "phone" && preview.room.role === "player") {
    return { ...base, surface: "phone", room: preview.room };
  }
  return null;
}

/** One case per preview, keeping each preview's index so ids stay stable as a game grows. */
export function casesFor(gameId: string, previews: readonly PreviewEntry[]): ScreenCase[] {
  const cases: ScreenCase[] = [];
  for (const [index, preview] of previews.entries()) {
    const screen = caseOf(gameId, preview, index);
    if (screen !== null) cases.push(screen);
  }
  return cases;
}

const SOURCES: Array<[string, readonly PreviewEntry[]]> = [
  ["imposter", imposterPreviews],
  ["real-or-nah", realOrNahPreviews],
  ["most-likely-to", mostLikelyToPreviews],
  ["doodle-bluff", doodleBluffPreviews],
];

/** Every preview across every game, in registry order. */
export const SCREENS: ScreenCase[] = SOURCES.flatMap(([gameId, previews]) =>
  casesFor(gameId, previews),
);

export function screenById(id: string): ScreenCase | null {
  return SCREENS.find((screen) => screen.id === id) ?? null;
}

/** The `id` parameter of a /dev/screens query string, or null when it carries none. */
export function screenIdFromSearch(search: string): string | null {
  return new URLSearchParams(search).get("id");
}
