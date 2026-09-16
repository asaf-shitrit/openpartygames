// Game SDK clock contract and the GameUi type used by the web app registry.
import type { ComponentType } from "react";
import type { Award, HostRoomView, PlayerRoomView } from "@opg/protocol";

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
  }>;
  /** Turns a game-defined award id into words. Returns null for an id the game does not know. */
  awardCopy?: (award: Award) => { title: string; detail: string } | null;
}
