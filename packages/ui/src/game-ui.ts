// Game SDK clock contract and the GameUi type used by the web app registry.
import type { ComponentType } from "react";
import type { Award, HostRoomView, PlayerRoomView } from "@opg/protocol";
import type { Dictionary } from "@opg/i18n";

export interface ServerClock {
  /** Current server-style epoch ms, corrected for client clock skew. */
  now(): number;
}

export interface GameUi<
  HostView = unknown,
  PlayerView = unknown,
  Action = unknown,
> {
  Host: ComponentType<{
    view: HostView;
    room: HostRoomView;
    deadline: number | null;
    /** Epoch ms the current `deadline` was set, or null when nothing is timed. */
    timerStartedAt: number | null;
    clock: ServerClock;
  }>;
  Phone: ComponentType<{
    view: PlayerView;
    room: PlayerRoomView;
    deadline: number | null;
    /** Epoch ms the current `deadline` was set, or null when nothing is timed. */
    timerStartedAt: number | null;
    clock: ServerClock;
    send: (action: Action) => void;
    /** The host view in a no-TV room, or null in a room with a shared screen. */
    stage: HostView | null;
  }>;
  /**
   * Turns a game-defined award id into words, in the reader's language. Returns null for an
   * id the game does not know. Takes the dictionary rather than reading context itself: the
   * finale calls this while building a list, not from inside a component of its own.
   */
  awardCopy?: (
    award: Award,
    t: Dictionary,
  ) => { title: string; detail: string } | null;
}
