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
  kind: "game";
  surface: "host";
  room: HostRoomView;
}

export interface PhoneCase extends CaseBase {
  kind: "game";
  surface: "phone";
  room: PlayerRoomView;
}

/**
 * A screen owned by the app shell rather than a game: the join flow, the lobby, the TV
 * landing/credits/full-tonight pages, and so on. Its real component and fixture props live in
 * `dev/app-screens.tsx`, which only the (React) gallery imports — this file stays plain data so
 * `layout.spec.ts` can import it under Node with no React, no stylesheet and no asset in reach.
 */
export interface AppCase {
  kind: "app";
  id: string;
  gameId: "app";
  label: string;
  surface: Surface;
  /** Looked up in `dev/app-screens.tsx`'s registry. */
  appId: string;
}

export type ScreenCase = HostCase | PhoneCase | AppCase;

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
    return { ...base, kind: "game", surface: "host", room: preview.room };
  }
  if (preview.surface === "phone" && preview.room.role === "player") {
    return { ...base, kind: "game", surface: "phone", room: preview.room };
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

interface AppScreenSpec {
  /** Looked up in `dev/app-screens.tsx`'s registry — kept in step with it by a unit test. */
  appId: string;
  label: string;
  surface: Surface;
}

/**
 * Every screen the app shell owns, rather than a game: the join flow, the avatar picker, the
 * lobby and its VIP controls, results, reconnecting/kicked, and the TV shell (landing, lobby,
 * game picker, final scores, full-tonight, credits, reconnecting overlay). None of these were
 * ever reached by the layout suite before — a preview fixture only ever covered a game's own
 * Host/Phone screens — so this is where that gap closes.
 */
const APP_SCREENS: readonly AppScreenSpec[] = [
  { appId: "join", label: "Phone: join a room", surface: "phone" },
  {
    appId: "join-worst",
    label: "Phone: join, worst case (room-full error, name at NAME_MAX_LENGTH)",
    surface: "phone",
  },
  { appId: "avatar-picker", label: "Phone: avatar picker", surface: "phone" },
  {
    appId: "avatar-picker-worst",
    label: "Phone: avatar picker, worst case (8 players, long names, most avatars taken)",
    surface: "phone",
  },
  { appId: "lobby", label: "Phone: lobby, shared screen", surface: "phone" },
  {
    appId: "lobby-worst",
    label: "Phone: lobby, worst case (no shared screen, 8 long names)",
    surface: "phone",
  },
  { appId: "vip-controls", label: "Phone: VIP controls", surface: "phone" },
  {
    appId: "vip-controls-worst",
    label: "Phone: VIP controls, worst case (8 long names, every pack, an error)",
    surface: "phone",
  },
  { appId: "results", label: "Phone: results, crown with awards", surface: "phone" },
  {
    appId: "results-worst",
    label: "Phone: results, worst case (8 long names, 3 awards, a tie)",
    surface: "phone",
  },
  { appId: "reconnecting", label: "Phone: reconnecting", surface: "phone" },
  { appId: "kicked", label: "Phone: kicked from the room", surface: "phone" },
  { appId: "waiting", label: "Phone: waiting for the next game", surface: "phone" },
  {
    appId: "waiting-worst",
    label: "Phone: waiting, worst case (8 long names)",
    surface: "phone",
  },
  { appId: "landing", label: "Phone: landing", surface: "phone" },
  { appId: "tv-landing", label: "TV: landing", surface: "host" },
  { appId: "tv-full-tonight", label: "TV: room limit reached tonight", surface: "host" },
  { appId: "tv-lobby", label: "TV: lobby", surface: "host" },
  {
    appId: "tv-lobby-worst",
    label: "TV: lobby, worst case (8 long names)",
    surface: "host",
  },
  { appId: "tv-game-picker", label: "TV: game picker", surface: "host" },
  {
    appId: "tv-final-scores",
    label: "TV: final scores, crown with awards",
    surface: "host",
  },
  {
    appId: "tv-final-scores-worst",
    label: "TV: final scores, worst case (8 long names, 3 awards, a tie)",
    surface: "host",
  },
  { appId: "tv-credits", label: "TV: credits", surface: "host" },
  { appId: "tv-reconnecting", label: "TV: reconnecting overlay", surface: "host" },
];

function appCases(specs: readonly AppScreenSpec[]): AppCase[] {
  return specs.map((spec, index) => ({
    kind: "app",
    id: `app/${index}`,
    gameId: "app",
    label: spec.label,
    surface: spec.surface,
    appId: spec.appId,
  }));
}

/** Every game preview, plus every app-shell screen, in registry order. */
export const SCREENS: ScreenCase[] = [
  ...SOURCES.flatMap(([gameId, previews]) => casesFor(gameId, previews)),
  ...appCases(APP_SCREENS),
];

export function screenById(id: string): ScreenCase | null {
  return SCREENS.find((screen) => screen.id === id) ?? null;
}

/** The `id` parameter of a /dev/screens query string, or null when it carries none. */
export function screenIdFromSearch(search: string): string | null {
  return new URLSearchParams(search).get("id");
}
