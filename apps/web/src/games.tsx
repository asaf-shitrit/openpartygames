// Game registry: maps a game id to its TV and phone screens.
import {
  imposterHostViewSchema,
  imposterPlayerViewSchema,
} from "@opg/game-imposter";
import { imposterUi } from "@opg/game-imposter/ui";
import {
  mltHostViewSchema,
  mltPlayerViewSchema,
} from "@opg/game-most-likely-to";
import { mostLikelyToUi } from "@opg/game-most-likely-to/ui";
import { ronHostViewSchema, ronPlayerViewSchema } from "@opg/game-real-or-nah";
import { realOrNahUi } from "@opg/game-real-or-nah/ui";
import type { Award, AvatarId } from "@opg/protocol";
import type { GameUi, IconName } from "@opg/ui";
import type { ComponentProps } from "react";
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
];

/** A landing game's icon, or the generic cards icon when the id is unknown. */
export function gameIconFor(id: string): IconName {
  return LANDING_GAMES.find((game) => game.id === id)?.icon ?? "cards";
}

type AnyGameUi = GameUi<unknown, unknown, z.core.util.JSONType>;
type HostProps = ComponentProps<AnyGameUi["Host"]>;
type PhoneProps = ComponentProps<AnyGameUi["Phone"]>;

interface GameEntry<HostView, PlayerView, Action extends z.core.util.JSONType> {
  ui: GameUi<HostView, PlayerView, Action>;
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
 * Adapts a typed game UI to the registry's untyped shape. Views arrive over the socket, so
 * each adapter parses them with the game's own schema before rendering.
 */
function registerGame<
  HostView,
  PlayerView,
  Action extends z.core.util.JSONType,
>(entry: GameEntry<HostView, PlayerView, Action>): AnyGameUi {
  const { ui, hostViewSchema, playerViewSchema } = entry;
  function RegisteredHost(props: HostProps) {
    const parsed = hostViewSchema.safeParse(props.view);
    if (!parsed.success) return <ViewMismatch />;
    return (
      <ui.Host
        view={parsed.data}
        room={props.room}
        deadline={props.deadline}
        timerStartedAt={props.timerStartedAt}
        clock={props.clock}
      />
    );
  }
  function RegisteredPhone(props: PhoneProps) {
    const parsed = playerViewSchema.safeParse(props.view);
    if (!parsed.success) return <ViewMismatch />;
    return (
      <ui.Phone
        view={parsed.data}
        room={props.room}
        deadline={props.deadline}
        timerStartedAt={props.timerStartedAt}
        clock={props.clock}
        send={(action: Action) => props.send(action)}
      />
    );
  }
  return {
    Host: RegisteredHost,
    Phone: RegisteredPhone,
    awardCopy: ui.awardCopy,
  };
}

const GAME_UIS = new Map<string, AnyGameUi>([
  [
    "imposter",
    registerGame({
      ui: imposterUi,
      hostViewSchema: imposterHostViewSchema,
      playerViewSchema: imposterPlayerViewSchema,
    }),
  ],
  [
    "real-or-nah",
    registerGame({
      ui: realOrNahUi,
      hostViewSchema: ronHostViewSchema,
      playerViewSchema: ronPlayerViewSchema,
    }),
  ],
  [
    "most-likely-to",
    registerGame({
      ui: mostLikelyToUi,
      hostViewSchema: mltHostViewSchema,
      playerViewSchema: mltPlayerViewSchema,
    }),
  ],
]);

export function gameUiFor(id: string): AnyGameUi | null {
  return GAME_UIS.get(id) ?? null;
}

/** A game's award id turned into words, or null when the game has no copy for it. */
export function awardCopyFor(
  gameId: string,
  award: Award,
): { title: string; detail: string } | null {
  const ui = gameUiFor(gameId);
  if (!ui?.awardCopy) return null;
  return ui.awardCopy(award);
}

/** The awards the platform can describe: the finale stages one beat per award in here. */
export function describableAwards(
  gameId: string,
  awards: readonly Award[],
): Award[] {
  return awards.filter((award) => awardCopyFor(gameId, award) !== null);
}
