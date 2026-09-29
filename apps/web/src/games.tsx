// Game registry: maps a game id to its TV and phone screens.
//
// What is eager and what is lazy is deliberate. A game's `Host`/`Phone` components are the
// heavy part and load on demand (`loadScreens`, one chunk per game). Everything the shared
// ceremony needs at a *known moment* stays in the main chunk: the view schemas (`/views`) and
// `awardCopy` (`/award-copy`). `awardCopy` feeds `describableAwards` -> `finaleBeats`, which
// decides how many award beats exist and when the crown lands, and the TV and every phone
// compute that independently. Behind a dynamic import it would answer null on a device whose
// chunk had not arrived, and that device would stage a different ceremony from the room.
import { useLocale, type Dictionary } from "@opg/i18n";
import { doodleBluffAwardCopy } from "@opg/game-doodle-bluff/award-copy";
import {
  doodleHostViewSchema,
  doodlePlayerViewSchema,
} from "@opg/game-doodle-bluff/views";
import { imposterAwardCopy } from "@opg/game-imposter/award-copy";
import {
  imposterHostViewSchema,
  imposterPlayerViewSchema,
} from "@opg/game-imposter/views";
import { mostLikelyToAwardCopy } from "@opg/game-most-likely-to/award-copy";
import {
  mltHostViewSchema,
  mltPlayerViewSchema,
} from "@opg/game-most-likely-to/views";
import { realOrNahAwardCopy } from "@opg/game-real-or-nah/award-copy";
import {
  ronHostViewSchema,
  ronPlayerViewSchema,
} from "@opg/game-real-or-nah/views";
import type { Award, AvatarId } from "@opg/protocol";
import type { GameUi, IconName } from "@opg/ui";
import { lazy, Suspense, type ComponentProps } from "react";
import type { z, ZodType } from "zod";
import { LOADING_ATTRIBUTE } from "./loading";

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

/** The heavy half of a game's UI: the components, loaded on demand. */
type GameScreens<HostView, PlayerView, Action> = Pick<
  GameUi<HostView, PlayerView, Action>,
  "Host" | "Phone"
>;

export interface GameEntry<HostView, PlayerView, Action extends z.core.util.JSONType> {
  /** Loads the game's Host and Phone. Runs on first render or preload, then is cached. */
  loadScreens: () => Promise<GameScreens<HostView, PlayerView, Action>>;
  /** Eager on purpose: the finale needs it synchronously. See the header comment. */
  awardCopy?: GameUi<HostView, PlayerView, Action>["awardCopy"];
  hostViewSchema: ZodType<HostView>;
  playerViewSchema: ZodType<PlayerView>;
}

export interface RegisteredGame {
  ui: AnyGameUi;
  /** Starts (or joins) the screens download. Resolves once the game's screens are ready. */
  preload: () => Promise<void>;
}

/** Runs `load` at most once, however many callers ask. */
function once<T>(load: () => Promise<T>): () => Promise<T> {
  let promise: Promise<T> | null = null;
  return () => {
    promise ??= load();
    return promise;
  };
}

function ViewMismatch() {
  const { t } = useLocale();
  return (
    <output style={{ display: "block", padding: 24, fontSize: 20 }}>
      {t.status.gameUpdating}
    </output>
  );
}

/** Shown while a game's chunk downloads: same words and footprint as `ViewMismatch`. */
function GameLoading() {
  const { t } = useLocale();
  return (
    <output
      {...{ [LOADING_ATTRIBUTE]: "" }}
      style={{ display: "block", padding: 24, fontSize: 20 }}
    >
      {t.status.gameUpdating}
    </output>
  );
}

/**
 * Adapts a typed game UI to the registry's untyped shape. Views arrive over the socket, so
 * each adapter parses them with the game's own schema before rendering. The components load
 * lazily behind Suspense; `awardCopy` is passed straight through, so it answers the same
 * whether or not the chunk has arrived.
 */
export function registerGame<
  HostView,
  PlayerView,
  Action extends z.core.util.JSONType,
>(entry: GameEntry<HostView, PlayerView, Action>): RegisteredGame {
  const { hostViewSchema, playerViewSchema } = entry;
  const load = once(entry.loadScreens);
  const LazyHost = lazy(async () => ({ default: (await load()).Host }));
  const LazyPhone = lazy(async () => ({ default: (await load()).Phone }));
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
      awardCopy: entry.awardCopy,
    },
    preload: () => load().then(() => undefined),
  };
}

const GAME_REGISTRY = new Map<string, RegisteredGame>([
  [
    "imposter",
    registerGame({
      loadScreens: () => import("@opg/game-imposter/ui").then((m) => m.imposterUi),
      awardCopy: imposterAwardCopy,
      hostViewSchema: imposterHostViewSchema,
      playerViewSchema: imposterPlayerViewSchema,
    }),
  ],
  [
    "real-or-nah",
    registerGame({
      loadScreens: () =>
        import("@opg/game-real-or-nah/ui").then((m) => m.realOrNahUi),
      awardCopy: realOrNahAwardCopy,
      hostViewSchema: ronHostViewSchema,
      playerViewSchema: ronPlayerViewSchema,
    }),
  ],
  [
    "most-likely-to",
    registerGame({
      loadScreens: () =>
        import("@opg/game-most-likely-to/ui").then((m) => m.mostLikelyToUi),
      awardCopy: mostLikelyToAwardCopy,
      hostViewSchema: mltHostViewSchema,
      playerViewSchema: mltPlayerViewSchema,
    }),
  ],
  [
    "doodle-bluff",
    registerGame({
      loadScreens: () =>
        import("@opg/game-doodle-bluff/ui").then((m) => m.doodleBluffUi),
      awardCopy: doodleBluffAwardCopy,
      hostViewSchema: doodleHostViewSchema,
      playerViewSchema: doodlePlayerViewSchema,
    }),
  ],
]);

export function gameUiFor(id: string): AnyGameUi | null {
  return GAME_REGISTRY.get(id)?.ui ?? null;
}

/**
 * Starts a game's chunk download before any screen asks for it. Safe to call repeatedly and
 * for an unknown id (does nothing). It only changes *when the bytes arrive*; nothing the
 * ceremony reads depends on it.
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
