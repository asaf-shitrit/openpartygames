// Game SDK clock contract and the GameUi type used by the web app registry.
import type { ComponentType } from "react";
import type { HostRoomView, PlayerRoomView } from "@opg/protocol";

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
    clock: ServerClock;
  }>;
  Phone: ComponentType<{
    view: PlayerView;
    room: PlayerRoomView;
    deadline: number | null;
    clock: ServerClock;
    send: (action: Action) => void;
  }>;
}
