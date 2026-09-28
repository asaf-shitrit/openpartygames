// Game registry: maps a game id to its TV and phone screens.
//
// Each game's root package export (imported statically below, for its view schemas) pulls in
// that game's whole GameDefinition — rules, bot, awards, views — because the games don't split
// their pure logic from their schemas at the package boundary. That's unavoidable here without
// a package change; what this file controls is the `/ui` entry, which is React components plus
// ceremony and is genuinely separate. Each game's `ui` is loaded with a dynamic import() behind
// `lazy`, so a phone only ever downloads UI code for the game actually in its room.
import type { Dictionary } from "@opg/i18n";
import {
  doodleHostViewSchema,
  doodlePlayerViewSchema,
} from "@opg/game-doodle-bluff";
import {
  imposterHostViewSchema,
  imposterPlayerViewSchema,
} from "@opg/game-imposter";
import {
  mltHostViewSchema,
  mltPlayerViewSchema,
} from "@opg/game-most-likely-to";
import { ronHostViewSchema, ronPlayerViewSchema } from "@opg/game-real-or-nah";
import type { Award, AvatarId } from "@opg/protocol";
import type { GameUi, IconName } from "@opg/ui";
import { lazy, Suspense, type ComponentProps } from "react";
import type { z, ZodType } from "zod";

export interface LandingGame {
  id: string;
  name: string;
  blurb: string;
  minPlayers: number;
  maxPlayers: number;
  minutes: number;
  icon: IconName;
  avatar: AvatarId;
}

/** Static metadata for the landing page, where there is no room view yet. */
export const LANDING_GAMES: LandingGame[] = [
  {
    id: "imposter",
    name: "Imposter",
    blurb: "One of you has a decoy word. Talk it out, vote them out.",
    minPlayers: 3,
    maxPlayers: 8,
    minutes: 15,
    icon: "mask",
    avatar: "drop",
  },
  {
    id: "real-or-nah",
    name: "Real or Nah",
    blurb:
      "Write fake answers to real facts. Fool your friends, find the truth.",
    minPlayers: 3,
    maxPlayers: 8,
    minutes: 15,
    icon: "cards",
    avatar: "toast",
  },
  {
    id: "most-likely-to",
    name: "Most Likely To",
    blurb: "Vote on who fits the prompt. Score by reading the room.",
    minPlayers: 3,
    maxPlayers: 8,
    minutes: 12,
    icon: "point",
    avatar: "cat",
  },
  {
    id: "doodle-bluff",
    name: "Doodle Bluff",
    blurb: "Draw the prompt, write a title. Bluff or find the real one.",
    minPlayers: 3,
    maxPlayers: 8,
    minutes: 15,
    icon: "pencil",
    avatar: "star",
  },
];

/** A landing game's icon, or the generic cards icon when the id is unknown. */
export function gameIconFor(id: string): IconName {
  return LANDING_GAMES.find((game) => game.id === id)?.icon ?? "cards";
}

type AnyGameUi = GameUi<unknown, unknown, z.core.util.JSONType>;
type HostProps = ComponentProps<AnyGameUi["Host"]>;
type PhoneProps = ComponentProps<AnyGameUi["Phone"]>;

export interface GameEntry<HostView, PlayerView, Action extends z.core.util.JSONType> {
  /**
   * Loads the game's `/ui` module. Called lazily, the first time this game's Host or Phone is
   * asked to render, and cached — so a phone downloads UI code only for the game in its room.
   */
  loadUi: () => Promise<GameUi<HostView, PlayerView, Action>>;
  hostViewSchema: ZodType<HostView>;
  playerViewSchema: ZodType<PlayerView>;
}

function ViewMismatch() {
  return (
    <output style={{ display: "block", padding: 24, fontSize: 20 }}>
      Updating the game… one moment.
    </output>
  );
}

/**
 * Shown while a game's UI chunk is downloading. Same footprint and copy as `ViewMismatch`
 * (reused rather than duplicated) so a slow connection never shows a blank screen or shifts
 * the layout when the real screen swaps in.
 */
const GameLoading = ViewMismatch;

/** A game's `/ui` module, loaded at most once, with its resolved value readable synchronously. */
interface MemoizedLoad<T> {
  load: () => Promise<T>;
  get: () => T | undefined;
}

/** Memoizes a game's `/ui` load so its Host and Phone share one dynamic import, not two. */
function memoizeLoad<T>(load: () => Promise<T>): MemoizedLoad<T> {
  let promise: Promise<T> | null = null;
  let resolved: T | undefined;
  return {
    load: () => {
      promise ??= load().then((value) => {
        resolved = value;
        return value;
      });
      return promise;
    },
    get: () => resolved,
  } satisfies MemoizedLoad<T>;
}

export interface RegisteredGame {
  ui: AnyGameUi;
  /**
   * Starts (or joins) this game's `/ui` download without waiting for a render to ask for it.
   * `awardCopy` needs that module synchronously — it can't itself be async, since it's called
   * mid-render on the finale screen — and it's only guaranteed to have loaded already when
   * this game's Host or Phone rendered earlier in the same session. A caller that knows a
   * game's id before its UI is due to render (the room view names the game before any game
   * screen renders) can call this to close that window; nothing in this app does yet — see
   * the report for why.
   */
  preload: () => Promise<void>;
}

/**
 * Adapts a typed game UI to the registry's untyped shape. Views arrive over the socket, so
 * each adapter parses them with the game's own schema before rendering. The UI itself loads
 * lazily behind a Suspense boundary, on first use, so an unplayed game costs nothing.
 */
export function registerGame<
  HostView,
  PlayerView,
  Action extends z.core.util.JSONType,
>(entry: GameEntry<HostView, PlayerView, Action>): RegisteredGame {
  const { loadUi, hostViewSchema, playerViewSchema } = entry;
  const ui = memoizeLoad(loadUi);
  const LazyHost = lazy(async () => ({ default: (await ui.load()).Host }));
  const LazyPhone = lazy(async () => ({ default: (await ui.load()).Phone }));
  function RegisteredHost(props: HostProps) {
    const parsed = hostViewSchema.safeParse(props.view);
    if (!parsed.success) return <ViewMismatch />;
    return (
      <Suspense fallback={<GameLoading />}>
        <LazyHost
          view={parsed.data}
          room={props.room}
          deadline={props.deadline}
          timerStartedAt={props.timerStartedAt}
          clock={props.clock}
        />
      </Suspense>
    );
  }
  function RegisteredPhone(props: PhoneProps) {
    const parsed = playerViewSchema.safeParse(props.view);
    if (!parsed.success) return <ViewMismatch />;
    // Null passes straight through (a shared-screen room carries no stage); a stage that
    // fails to parse also becomes null rather than crashing the phone.
    let stage: HostView | null = null;
    if (props.stage !== null) {
      const parsedStage = hostViewSchema.safeParse(props.stage);
      if (parsedStage.success) stage = parsedStage.data;
    }
    return (
      <Suspense fallback={<GameLoading />}>
        <LazyPhone
          view={parsed.data}
          room={props.room}
          deadline={props.deadline}
          timerStartedAt={props.timerStartedAt}
          clock={props.clock}
          send={(action: Action) => props.send(action)}
          stage={stage}
        />
      </Suspense>
    );
  }
  return {
    ui: {
      Host: RegisteredHost,
      Phone: RegisteredPhone,
      // The finale describes awards for the game just played, so by the time this runs that
      // game's UI has usually already loaded (playing it is what triggers the load above).
      // Falls back to null — "no copy for this award" — if asked before that resolves.
      awardCopy: (award, t) => ui.get()?.awardCopy?.(award, t) ?? null,
    },
    preload: () => ui.load().then(() => undefined),
  };
}

const GAME_REGISTRY = new Map<string, RegisteredGame>([
  [
    "imposter",
    registerGame({
      loadUi: () => import("@opg/game-imposter/ui").then((m) => m.imposterUi),
      hostViewSchema: imposterHostViewSchema,
      playerViewSchema: imposterPlayerViewSchema,
    }),
  ],
  [
    "real-or-nah",
    registerGame({
      loadUi: () =>
        import("@opg/game-real-or-nah/ui").then((m) => m.realOrNahUi),
      hostViewSchema: ronHostViewSchema,
      playerViewSchema: ronPlayerViewSchema,
    }),
  ],
  [
    "most-likely-to",
    registerGame({
      loadUi: () =>
        import("@opg/game-most-likely-to/ui").then((m) => m.mostLikelyToUi),
      hostViewSchema: mltHostViewSchema,
      playerViewSchema: mltPlayerViewSchema,
    }),
  ],
  [
    "doodle-bluff",
    registerGame({
      loadUi: () =>
        import("@opg/game-doodle-bluff/ui").then((m) => m.doodleBluffUi),
      hostViewSchema: doodleHostViewSchema,
      playerViewSchema: doodlePlayerViewSchema,
    }),
  ],
]);

export function gameUiFor(id: string): AnyGameUi | null {
  return GAME_REGISTRY.get(id)?.ui ?? null;
}

/**
 * Starts this game's `/ui` download ahead of a render asking for it. See `RegisteredGame.preload`.
 * Resolves once loaded; a game id this registry doesn't know resolves immediately, doing nothing.
 */
export function preloadGameUi(id: string): Promise<void> {
  return GAME_REGISTRY.get(id)?.preload() ?? Promise.resolve();
}

/** A game's award id turned into words, or null when the game has no copy for it. */
export function awardCopyFor(
  gameId: string,
  award: Award,
  t: Dictionary,
): { title: string; detail: string } | null {
  const ui = gameUiFor(gameId);
  if (!ui?.awardCopy) return null;
  return ui.awardCopy(award, t);
}

/** The awards the platform can describe: the finale stages one beat per award in here. */
export function describableAwards(
  gameId: string,
  awards: readonly Award[],
  t: Dictionary,
): Award[] {
  return awards.filter((award) => awardCopyFor(gameId, award, t) !== null);
}
